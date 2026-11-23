// Isolated, sequential pilot runner. Never imports routes or writes study-space data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sourceBlocks, generationTargets, checkSpaceSummary, checkQuiz, checkFlashcards } from '../../app/api/_server/study.js';
import { completeCoverage } from '../../app/api/_server/coverage.js';
import { planRequest, validatePlan, guidance, PLAN_PROMPT_VERSION, PLAN_SCHEMA_VERSION } from './plan.mjs';

const root = path.resolve('data/evaluation');
const pilotRoot = path.join(root, 'experiments', 'concept-planning');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const progress = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'progress.json'), 'utf8'));
const corpus = read('corpus-manifest.json');
const controls = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'controls.json'), 'utf8'));
const lock = read('source-lock.json');

function verifyCorpus() {
  for (const source of lock.files) {
    const file = path.join(root, 'source-snapshot', source.relativePath);
    if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== source.sha256)
      throw new Error(`Frozen snapshot hash mismatch: ${source.relativePath}`);
  }
  for (const set of corpus.sets) for (const size of set.sizes.filter(item => ['40k', '100k'].includes(item.id))) {
    if (size.documents.length !== 5) throw new Error(`Expected five documents: ${set.id}/${size.id}`);
    let characters = 0;
    for (const document of size.documents) {
      const file = path.join(root, document.file);
      if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== document.sha256)
        throw new Error(`Corpus hash mismatch: ${document.file}`);
      const text = fs.readFileSync(file, 'utf8');
      if (text.length !== document.characters || text.length > 20000) throw new Error(`Invalid character count: ${document.file}`);
      characters += text.length;
    }
    if (characters !== size.actualCharacters) throw new Error(`Set character count mismatch: ${set.id}/${size.id}`);
  }
  const expected = ['frontend', 'java', 'systems'].flatMap(set => ['40k', '100k'].flatMap(size =>
    (size === '40k' ? ['baseline', 'plan'] : ['plan', 'baseline']).map(arm =>
      `${set}-${size}-terra-${arm}-r1`)));
  if (JSON.stringify(progress.cases.map(item => item.caseId)) !== JSON.stringify(expected))
    throw new Error('The active queue differs from the deterministic 12-case order.');
}

function loadKey() {
  if (process.env.OPENAI_API_KEY) return;
  const env = path.resolve('.env');
  if (!fs.existsSync(env)) throw new Error('OPENAI_API_KEY unavailable.');
  const line = fs.readFileSync(env, 'utf8').split(/\r?\n/).find(item => /^OPENAI_API_KEY=/.test(item));
  if (!line) throw new Error('OPENAI_API_KEY unavailable.');
  process.env.OPENAI_API_KEY = line.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
}

function cost(model, usage) {
  if (!usage || !Number.isInteger(usage.input_tokens) || !Number.isInteger(usage.output_tokens))
    return { usd: null, reason: 'API usage unavailable; check billing.' };
  const rates = model?.startsWith('gpt-6.1-terra') ? { input: 1, cached: 0.05, output: 5 } : null;
  if (!rates) return { usd: null, reason: 'Returned model has no approved rate.' };
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  if (!Number.isInteger(cached) || cached < 0 || cached > usage.input_tokens)
    return { usd: null, reason: 'Invalid cached token count.' };
  if (model.startsWith('gpt-6.1-terra') && usage.input_tokens > 272000)
    return { usd: null, reason: 'Long-context price adjustment needs review.' };
  return { usd: ((usage.input_tokens - cached) * rates.input + cached * rates.cached + usage.output_tokens * rates.output) / 1e6,
    reason: null };
}

function prepareRequestBody(body, { arm, format, plan }) {
  const prepared = { ...body, reasoning: { effort: 'medium' } };
  if (prepared.model !== 'gpt-6.1-terra' || prepared.store !== false)
    throw new Error('Model or request controls changed.');
  if (format !== 'plan' && arm === 'plan') {
    if (!plan) throw new Error('Validated concept plan is required.');
    prepared.instructions += guidance(plan, format);
  }
  if (format !== 'plan' && arm === 'baseline' && prepared.instructions.includes('source-derived concept outline'))
    throw new Error('Baseline received plan guidance.');
  if (/reference.concepts|review.notes|gold.reference|previous.output/i.test(JSON.stringify(prepared)))
    throw new Error('Generation request contains a prohibited reference or review marker.');
  return prepared;
}

function retryEligible(selected, calls, outputs, reservations, retryControls) {
  return selected?.runStatus === 'failed' && selected.arm === 'plan' && selected.sizeId === '100k' &&
    retryControls?.caseIds?.includes(selected.caseId) && retryControls.maximumNewPlanningAttemptsPerCase === 1 &&
    calls.length === 1 && calls[0].id === 1 && calls[0].format === 'plan' &&
    calls[0].purpose === 'planning' && calls[0].error === 'timeout' && calls[0].costUsd === null &&
    calls[0].responseStatus === null && outputs.plan.status === 'failed' &&
    ['mainIdeas', 'quiz', 'flashcards'].every(format => outputs[format].status === 'skipped') &&
    reservations.filter(item => item.caseId === selected.caseId && item.callId === 1 &&
      item.reservedUsd > 0 && item.reservedUsd <= 1).length === 1;
}

function callReserveUsd(body) {
  const requestBytes = Buffer.byteLength(JSON.stringify(body));
  if (requestBytes > 272000) throw new Error('Request exceeds conservative input bound for standard pricing.');
  // Terra has a 128K maximum output. The byte count bounds input tokens; use
  // the 12-hour cache-write rate ($2.50/M) and add a one-cent margin.
  return Math.ceil((requestBytes * 2.5 + 128000 * 5) / 10000) / 100 + 0.01;
}

function initialScores(reference) {
  const concepts = reference.concepts.filter(item => item.locations.some(location => location.sizeId === selected.sizeId));
  return { reviewStatus: 'pending_human_review', reviewer: null,
    reason: 'No generated item has been human-scored. Structural validation is not factual review.',
    referenceVersion: reference.version, referenceConceptCount: concepts.length,
    unionConceptScores: Object.fromEntries(concepts.map(item => [item.id, null])),
    unionCoverageNumerator: null, unionCoverageDenominator: concepts.length,
    formats: Object.fromEntries(['mainIdeas', 'quiz', 'flashcards'].map(format => [format, {
      conceptScores: Object.fromEntries(concepts.map(item => [item.id, null])),
      itemScores: null, duplicates: null, coverageByDocumentAndThird: null,
      coverageNumerator: null, coverageDenominator: concepts.length,
      highPriorityNumerator: null, highPriorityDenominator: concepts.filter(item => item.priority === 'high').length,
      correctAndSupportedCount: null, reviewedItemCount: null, minorErrorCount: null,
      seriousErrorCount: null, answerKeyErrorCount: format === 'quiz' ? null : 'not_applicable',
      usefulnessSum: null, usefulnessCount: null, reason: 'Human or clearly labeled agent review pending.'
    }])) };
}

verifyCorpus();
const args = process.argv.slice(2);
if (args[0] === '--verify') {
  console.log(`Verified ${lock.files.length} frozen snapshots, 30 active corpus files, and ${progress.cases.length} queued pilot cases. No API calls.`);
  process.exit(0);
}
if (args[0] === '--self-test') {
  process.env.OPENAI_API_KEY = 'offline-mock';
  process.env.OPENAI_MODEL = 'gpt-6.1-terra';
  const testDocs = Array.from({ length: 5 }, (_, index) => ({ id: `test-${index + 1}`, name: `Test ${index + 1}`,
    text: `Document ${index + 1} explains a distinct idea and its practical application. `.repeat(12) }));
  const blocks = sourceBlocks(testDocs);
  const sourceIds = testDocs.map(document => blocks.find(block => block.documentId === document.id).id);
  const { generateSpaceSummary, generateQuiz, generateFlashcards } = await import('../../app/api/_server/model.js');
  let activeArm = 'baseline', testPlan = null;
  const seenRequests = [];
  globalThis.fetch = async (_url, init) => {
    const raw = JSON.parse(init.body);
    const body = prepareRequestBody(raw, { arm: activeArm,
      format: raw.text.format.name === 'study_concept_plan' ? 'plan' : raw.text.format.name,
      plan: testPlan });
    seenRequests.push(body);
    let answer;
    if (body.text.format.name === 'study_concept_plan') {
      answer = { concepts: testDocs.map((_, index) => ({ claim: `Document ${index + 1} explains a distinct idea`,
        evidenceQuote: blocks.find(block => block.documentId === testDocs[index].id).text.slice(0, 30),
        sourceId: sourceIds[index], importance: 'high', position: 'beginning',
        targets: ['mainIdeas', 'quiz', 'flashcards'] })) };
    } else if (body.text.format.name === 'space_main_ideas') {
      const sources = {};
      for (const [index, document] of testDocs.entries()) {
        const own = blocks.filter(block => block.documentId === document.id);
        const partCount = Math.min(8, Math.max(2, Math.ceil(document.text.length / 2500)), own.length);
        sources[`source${index + 1}`] = {};
        for (let part = 0; part < partCount; part++) {
          const block = own[Math.floor(part * own.length / partCount)];
          sources[`source${index + 1}`][`part${part + 1}`] = { text: `Idea ${index + 1}-${part + 1}`, sourceId: block.id };
        }
      }
      answer = { overview: 'Five test documents.', sources };
    } else if (body.text.format.name === 'study_quiz') {
      answer = { questions: sourceIds.map((sourceId, index) => ({ text: `Question ${index + 1}?`, optionA: 'Correct', optionB: 'Wrong B',
        optionC: 'Wrong C', optionD: 'Wrong D', correctOption: 'A', explanation: 'Supported by source.', sourceId })) };
    } else if (body.text.format.name === 'study_flashcards') {
      answer = { cards: sourceIds.map((sourceId, index) => ({ front: `Front ${index + 1}?`, back: `Back ${index + 1}.`, sourceId })) };
    } else throw new Error('Unexpected mock request.');
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-6.1-terra',
      usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  for (const arm of ['baseline', 'plan']) {
    activeArm = arm;
    if (arm === 'plan') {
      const response = await fetch('https://api.openai.com/v1/responses', { body: JSON.stringify(planRequest(testDocs)) });
      const data = await response.json();
      testPlan = validatePlan(testDocs, JSON.parse(data.output[0].content[0].text));
    }
    checkSpaceSummary(testDocs, (await generateSpaceSummary(testDocs)).output);
    checkQuiz(testDocs, (await generateQuiz(testDocs)).output);
    checkFlashcards(testDocs, (await generateFlashcards(testDocs)).output);
  }
  if (seenRequests.length !== 7 || seenRequests.slice(0, 3).some(body => body.instructions.includes('source-derived concept outline')) ||
      seenRequests.slice(4).some(body => !body.instructions.includes('source-derived concept outline')) ||
      seenRequests.some(body => /reference.concepts|review.notes|gold.reference|previous.output/i.test(JSON.stringify(body))))
    throw new Error('Mock request isolation failed.');
  const timedOutCase = { caseId: 'frontend-100k-terra-plan-r1', runStatus: 'failed', arm: 'plan', sizeId: '100k' };
  const timedOutCall = { id: 1, format: 'plan', purpose: 'planning', error: 'timeout', costUsd: null, responseStatus: null };
  const failedOutputs = { plan: { status: 'failed' }, mainIdeas: { status: 'skipped' },
    quiz: { status: 'skipped' }, flashcards: { status: 'skipped' } };
  const retryControls = { caseIds: [timedOutCase.caseId], maximumNewPlanningAttemptsPerCase: 1 };
  const reservations = [{ caseId: timedOutCase.caseId, callId: 1, reservedUsd: 1 }];
  if (!retryEligible(timedOutCase, [timedOutCall], failedOutputs, reservations, retryControls) ||
      retryEligible(timedOutCase, [timedOutCall, timedOutCall], failedOutputs, reservations, retryControls) ||
      retryEligible(timedOutCase, [timedOutCall], failedOutputs, [], retryControls) ||
      callReserveUsd(planRequest(testDocs)) >= 1)
    throw new Error('Mock timeout retry guard or budget reserve failed.');
  console.log('Offline mock validated baseline and plan requests, outputs, and isolation. No API calls.');
  process.exit(0);
}
if (!['--case', '--resume-plan', '--retry-timeout'].includes(args[0]) || args.length !== 2)
  throw new Error('Use --verify, --self-test, --case, --resume-plan, or --retry-timeout with a case ID.');
const resuming = args[0] === '--resume-plan';
const retrying = args[0] === '--retry-timeout';
const existingCase = resuming || retrying;
const selected = progress.cases.find(item => item.caseId === args[1]);
if (!selected || (!existingCase && selected !== progress.cases.find(item => item.runStatus === 'pending')))
  throw new Error('Select the earliest incomplete case in queue order.');
if (existingCase ? selected.runStatus !== 'failed' || selected.arm !== 'plan' : selected.runStatus !== 'pending')
  throw new Error('Case state does not match the requested action.');
if (!controls.approvalForPaidRuns || !Number.isFinite(controls.stageBudgetUsd) ||
    !Number.isFinite(controls.caseCapUsd)) throw new Error('New experiment budget and paid-run approval are required.');
const reference = read('reference-concepts.reviewed.json');
if (reference.status !== 'human_reviewed' || !reference.sets?.some(set => set.id === selected.sourceSetId))
  throw new Error('Human-reviewed reference concepts are required.');
if (progress.apiCalls !== 0 && progress.budgetDebitedUsd == null)
  throw new Error('Prior attempt has unknown cost; resolve billing before new calls.');
const budgetDebitedUsd = progress.budgetDebitedUsd ?? 0;
if (budgetDebitedUsd >= controls.stageBudgetUsd) throw new Error('Stage budget exhausted.');
const sourceSet = corpus.sets.find(item => item.id === selected.sourceSetId);
const size = sourceSet?.sizes.find(item => item.id === selected.sizeId);
if (!size) throw new Error('Case source set unavailable.');
const documents = size.documents.map(item => ({ id: item.id, name: item.id,
  text: fs.readFileSync(path.join(root, item.file), 'utf8') }));
loadKey();
process.env.OPENAI_MODEL = selected.model;
const { generateSpaceSummary, generateQuiz, generateFlashcards, generateQuizCoverage, generateFlashcardCoverage } = await import('../../app/api/_server/model.js');
const caseDir = path.join(pilotRoot, selected.caseId);
if (existingCase ? !fs.existsSync(caseDir) : fs.existsSync(caseDir))
  throw new Error('Case directory state does not match the requested action.');
if (!existingCase) fs.mkdirSync(caseDir);
const save = (file, value) => fs.writeFileSync(path.join(caseDir, file), JSON.stringify(value, null, 2) + '\n');
const calls = existingCase ? JSON.parse(fs.readFileSync(path.join(caseDir, 'calls.json'), 'utf8')) : [];
const priorCallCount = calls.length;
const priorCaseCost = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
const budgetBeforeCaseUsd = budgetDebitedUsd - priorCaseCost;
const outputs = existingCase ? JSON.parse(fs.readFileSync(path.join(caseDir, 'outputs.json'), 'utf8')) :
  { plan: { status: selected.arm === 'plan' ? 'pending' : 'not_applicable' },
    mainIdeas: { status: 'pending' }, quiz: { status: 'pending' }, flashcards: { status: 'pending' } };
if (resuming && (calls.length !== 1 || calls[0].format !== 'plan' || calls[0].costUsd === null ||
    outputs.plan.status !== 'failed' || ['mainIdeas', 'quiz', 'flashcards'].some(format => outputs[format].status !== 'skipped')))
  throw new Error('Failed plan case is not safe to resume.');
if (retrying && !retryEligible(selected, calls, outputs, progress.unknownCostReservations ?? [], controls.manualTimeoutRetry))
  throw new Error('Timed-out case is not eligible for a single explicit retry.');
const priorUnknownReservationUsd = retrying ?
  progress.unknownCostReservations.find(item => item.caseId === selected.caseId && item.callId === 1).reservedUsd : 0;
const previousPlanOutcome = retrying ? structuredClone(outputs.plan) : null;
const manifest = existingCase ? JSON.parse(fs.readFileSync(path.join(caseDir, 'manifest.json'), 'utf8')) :
  { caseId: selected.caseId, sourceSetId: selected.sourceSetId, sizeId: selected.sizeId,
  documents: size.documents.map(item => ({ id: item.id, sha256: item.sha256, characters: item.characters })),
  sourceSnapshotLockSha256: hash(fs.readFileSync(path.join(root, 'source-lock.json'))),
  characters: size.actualCharacters, documentCount: documents.length, documentOrder: documents.map(item => item.id),
  modelId: selected.model, returnedModelVersions: [], reasoningEffort: selected.reasoningEffort,
  processing: selected.arm === 'plan' ? 'source-derived-plan' : 'whole-selection', arm: selected.arm,
  outputPolicy: { quizCap: 10, flashcardCap: 20, summaryPartsPerDocumentCap: 8 }, repetition: selected.repetition,
  planPromptVersion: selected.arm === 'plan' ? PLAN_PROMPT_VERSION : null,
  planSchemaVersion: selected.arm === 'plan' ? PLAN_SCHEMA_VERSION : null,
  planCodeSha256: selected.arm === 'plan' ? hash(fs.readFileSync(new URL('./plan.mjs', import.meta.url))) : null,
  productPromptSchemaSha256: hash(fs.readFileSync(new URL('../../app/api/_server/model.js', import.meta.url))),
  runnerCodeSha256: hash(fs.readFileSync(new URL('./run-case.mjs', import.meta.url))),
  codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  requestSettings: { model: 'gpt-6.1-terra', reasoningEffort: 'medium', timeoutMs: 90000 },
  baselineChanges: ['Isolated evaluation accepts 100K source input and uses 90-second request timeouts.'],
  startedAt: now(), requestInputTokens: null };
if (!existingCase) {
  save('manifest.json', manifest); save('calls.json', calls); save('outputs.json', outputs);
  save('scores.json', initialScores(reference.sets.find(set => set.id === selected.sourceSetId)));
}
if (retrying) {
  if (manifest.caseId !== selected.caseId || manifest.modelId !== selected.model ||
      manifest.documentOrder.join('|') !== size.documents.map(item => item.id).join('|') ||
      manifest.requestSettings.timeoutMs !== 90000)
    throw new Error('Saved case controls differ from the approved retry case.');
  manifest.manualTimeoutRetry = { startedAt: now(), planningTimeoutMs: controls.manualTimeoutRetry.planningRetryTimeoutMs,
    formatTimeoutMs: controls.manualTimeoutRetry.formatTimeoutMs,
    runnerCodeSha256: hash(fs.readFileSync(new URL('./run-case.mjs', import.meta.url))),
    originalPlanningCallId: 1 };
  save('manifest.json', manifest);
}
let currentFormat = null, purpose = null, validatedPlan = null;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected API endpoint.');
  const body = prepareRequestBody(JSON.parse(init.body),
    { arm: selected.arm, format: currentFormat, plan: validatedPlan });
  const reserveUsd = callReserveUsd(body);
  const spentKnownUsd = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  const caseSpentUsd = spentKnownUsd + priorUnknownReservationUsd;
  if (calls.some(call => call.endedAt && call.costUsd === null && !(retrying && call.id === 1)))
    throw new Error('A previous call has unknown cost; stop for billing review.');
  if (caseSpentUsd + reserveUsd > controls.caseCapUsd ||
      budgetBeforeCaseUsd + spentKnownUsd + reserveUsd > controls.stageBudgetUsd)
    throw new Error('Insufficient approved budget for another call.');
  const record = { id: calls.length + 1, format: currentFormat, purpose, startedAt: now(), endedAt: null,
    requestSha256: hash(JSON.stringify(body)), responseStatus: null, error: null, validationOutcome: 'pending',
    model: null, usage: null, inputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null,
    costReason: 'Response pending.' };
  calls.push(record); save('calls.json', calls);
  try {
    const response = await nativeFetch(url, { ...init, body: JSON.stringify(body) });
    record.endedAt = now(); record.responseStatus = response.status;
    const data = await response.clone().json().catch(() => null);
    record.model = data?.model ?? selected.model;
    record.usage = data?.usage ?? null;
    record.inputTokens = data?.usage?.input_tokens ?? null;
    record.outputTokens = data?.usage?.output_tokens ?? null;
    record.reasoningTokens = data?.usage?.output_tokens_details?.reasoning_tokens ?? null;
    const priced = cost(record.model, record.usage);
    record.costUsd = priced.usd; record.costReason = priced.reason;
    if (data?.output) record.responseOutput = data.output;
    if (!response.ok) record.error = data?.error?.type ?? `HTTP ${response.status}`;
    save('calls.json', calls);
    return response;
  } catch (error) {
    record.endedAt = now(); record.error = error.name === 'TimeoutError' ? 'timeout' : error.message;
    record.costReason = 'Request failed before usage was returned; check billing.';
    save('calls.json', calls);
    throw error;
  }
};

async function execute(format, generate, validate, repair) {
  currentFormat = format; purpose = 'initial'; const before = calls.length; const startedAt = now();
  try {
    const generated = await generate(documents);
    const checked = validate(generated.output);
    if (calls[before]) { calls[before].validationOutcome = 'passed_initial'; save('calls.json', calls); }
    let final = checked;
    if (repair) {
      const target = format === 'quiz' ? generationTargets(documents).questions : generationTargets(documents).cards;
      purpose = 'coverage_repair';
      const completed = await completeCoverage({ documents, items: format === 'quiz' ? checked.questions : checked.cards,
        target, field: format === 'quiz' ? 'text' : 'front', generate: repair,
        check: (pending, item) => (format === 'quiz' ? checkQuiz(pending, { questions: [item] }, 1).questions[0]
          : checkFlashcards(pending, { cards: [item] }, 1).cards[0]), firstCall: {} });
      if (completed.uncovered.length) throw new Error(`Uncovered documents: ${completed.uncovered.map(item => item.id).join(', ')}`);
      final = format === 'quiz' ? { ...checked, questions: completed.items } : { cards: completed.items };
      for (const call of calls.slice(before + 1))
        if (call.validationOutcome === 'pending') call.validationOutcome = 'returned_for_coverage_check';
    }
    outputs[format] = { status: 'validated', startedAt, endedAt: now(), raw: generated.output, validated: final };
  } catch (error) {
    if (calls[before]?.validationOutcome === 'pending') calls[before].validationOutcome = 'failed_or_unavailable';
    outputs[format] = { status: 'failed', startedAt, endedAt: now(), error: error.message,
      failedResponses: calls.slice(before).filter(call => call.responseOutput).map(call => ({ callId: call.id, output: call.responseOutput })) };
  }
  save('calls.json', calls); save('outputs.json', outputs);
}

const productTimeout = AbortSignal.timeout;
AbortSignal.timeout = () => productTimeout(retrying && currentFormat === 'plan' ?
  controls.manualTimeoutRetry.planningRetryTimeoutMs : 90000);
if (resuming) {
  const raw = JSON.parse(calls[0].responseOutput.flatMap(item => item.content || [])
    .find(item => item.type === 'output_text').text);
  validatedPlan = validatePlan(documents, raw);
  calls[0].revalidation = { outcome: 'validated_after_local_position_normalization',
    at: now(), runnerCodeSha256: hash(fs.readFileSync(new URL('./run-case.mjs', import.meta.url))),
    planCodeSha256: hash(fs.readFileSync(new URL('./plan.mjs', import.meta.url))) };
  outputs.plan = { ...outputs.plan, status: 'validated', raw, normalized: validatedPlan,
    priorValidationError: outputs.plan.error, validation: 'Exact claims and quotes validated; position derived from cited block.' };
  delete outputs.plan.error;
  save('calls.json', calls); save('outputs.json', outputs);
}
if (selected.arm === 'plan' && (!resuming || retrying)) {
  currentFormat = 'plan'; purpose = retrying ? 'timeout_retry' : 'planning'; const startedAt = now();
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(planRequest(documents)), signal: AbortSignal.timeout(retrying ?
        controls.manualTimeoutRetry.planningRetryTimeoutMs : 90000),
    });
    if (!response.ok) throw new Error(`Planning request failed (${response.status}).`);
    const data = await response.json();
    const raw = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
    if (data.status !== 'completed' || !raw) throw new Error('Planning response incomplete.');
    const parsed = JSON.parse(raw);
    validatedPlan = validatePlan(documents, parsed);
    calls.at(-1).validationOutcome = 'structurally_validated_evidence_quotes_unreviewed';
    outputs.plan = { status: 'validated', startedAt, endedAt: now(), raw: parsed, normalized: validatedPlan,
      ...(retrying ? { previousAttempts: [previousPlanOutcome] } : {}),
      validation: 'Citations, exact quotes, positions, document and format spread checked; semantic support awaits review.' };
  } catch (error) {
    if (calls.at(-1)?.validationOutcome === 'pending') calls.at(-1).validationOutcome = 'failed';
    outputs.plan = { status: 'failed', startedAt, endedAt: now(), error: error.message,
      ...(retrying ? { previousAttempts: [previousPlanOutcome] } : {}) };
  }
  save('calls.json', calls); save('outputs.json', outputs);
}
if (selected.arm === 'baseline' || validatedPlan) {
  await execute('mainIdeas', generateSpaceSummary, output => checkSpaceSummary(documents, output));
  await execute('quiz', generateQuiz, output => checkQuiz(documents, output), generateQuizCoverage);
  await execute('flashcards', generateFlashcards, output => checkFlashcards(documents, output), generateFlashcardCoverage);
} else for (const format of ['mainIdeas', 'quiz', 'flashcards']) outputs[format] = { status: 'skipped', reason: 'Plan invalid or unavailable.' };
save('outputs.json', outputs);
AbortSignal.timeout = productTimeout;
globalThis.fetch = nativeFetch;
manifest.returnedModelVersions = [...new Set(calls.map(call => call.model).filter(Boolean))];
manifest.requestInputTokens = Object.fromEntries(['mainIdeas', 'quiz', 'flashcards'].map(format =>
  [format, calls.find(call => call.format === format && call.purpose === 'initial')?.inputTokens ?? null]));
manifest.requestInputTokens.plan = calls.findLast(call => call.format === 'plan')?.inputTokens ?? null;
manifest.planningCallIds = calls.filter(call => call.format === 'plan').map(call => call.id);
manifest.endedAt = now(); save('manifest.json', manifest);
const knownCost = calls.every(call => call.costUsd !== null);
const totalCost = knownCost ? calls.reduce((sum, call) => sum + call.costUsd, 0) : null;
const status = ['mainIdeas', 'quiz', 'flashcards'].every(format => outputs[format].status === 'validated') &&
  (selected.arm === 'baseline' || outputs.plan.status === 'validated') ? 'generated' : 'failed';
const referenceIds = reference.sets.find(set => set.id === selected.sourceSetId).concepts
  .filter(item => item.locations.some(location => location.sizeId === selected.sizeId)).map(item => item.id);
const itemIds = Object.fromEntries(Object.entries(outputs).filter(([name]) => name !== 'plan').map(([name, output]) => [name,
  output.status === 'validated' ? (name === 'mainIdeas' ? output.validated.sections.flatMap((section, index) =>
    section.ideas.map((_, ideaIndex) => `${documents[index].id}-idea-${ideaIndex + 1}`))
    : (name === 'quiz' ? output.validated.questions : output.validated.cards).map(item => `${name}-${item.id}`)) : []]));
const latency = Object.fromEntries(Object.entries(outputs).map(([name, output]) =>
  [name, output.startedAt && output.endedAt ? (new Date(output.endedAt) - new Date(output.startedAt)) / 1000 : null]));
const planInclusiveLatency = Object.fromEntries(['mainIdeas', 'quiz', 'flashcards'].map(format => [format,
  outputs[format].endedAt ? (new Date(outputs[format].endedAt) - new Date(manifest.startedAt)) / 1000 : null]));
const caseElapsedSeconds = (new Date(manifest.endedAt) - new Date(manifest.startedAt)) / 1000;
const report = `# ${selected.caseId}\n\n` +
  `Source set: ${selected.sourceSetId}, ${size.actualCharacters} characters across five documents. Model: ${selected.model}; reasoning: ${selected.reasoningEffort ?? 'none'}.\n\n` +
  `## Generation\n\n` + Object.entries(outputs).map(([name, output]) => `- ${name}: ${output.status}${output.error ? ` (${output.error})` : ''}`).join('\n') + '\n\n' +
  `API attempts: ${calls.length}; cost: ${totalCost === null ? 'unknown (billing review needed)' : `$${totalCost.toFixed(6)}`}. ` +
  `Elapsed seconds by format: ${JSON.stringify(latency)}. Plan-inclusive wait seconds: ${JSON.stringify(planInclusiveLatency)}. Complete case seconds: ${caseElapsedSeconds}.\n\n` +
  `## Review anchors\n\nReference concept IDs: ${referenceIds.join(', ')}.\n\n` +
  `Generated item IDs: ${JSON.stringify(itemIds)}.\n\n` +
  `## Review limitations\n\nConcept coverage, factual correctness, usefulness, source-position balance, and threshold decisions await blinded human review. Item and concept examples cannot be classified until then; see outputs.json item IDs and scores.json concept IDs. Structural validation does not establish correctness.\n`;
fs.writeFileSync(path.join(caseDir, 'report.md'), report);
for (const name of ['manifest.json', 'calls.json', 'outputs.json', 'scores.json'])
  if (!fs.existsSync(path.join(caseDir, name))) throw new Error(`Missing case artifact: ${name}`);
if (!fs.existsSync(path.join(caseDir, 'report.md'))) throw new Error('Missing case report.');
const savedManifest = JSON.parse(fs.readFileSync(path.join(caseDir, 'manifest.json')));
const savedCalls = JSON.parse(fs.readFileSync(path.join(caseDir, 'calls.json')));
const savedOutputs = JSON.parse(fs.readFileSync(path.join(caseDir, 'outputs.json')));
const savedScores = JSON.parse(fs.readFileSync(path.join(caseDir, 'scores.json')));
if (savedManifest.caseId !== selected.caseId || savedManifest.documents.length !== 5 ||
    savedCalls.length !== calls.length || !['mainIdeas', 'quiz', 'flashcards'].every(name => savedOutputs[name]?.status) ||
    !savedScores.formats?.quiz || !savedScores.formats?.flashcards || !savedScores.formats?.mainIdeas)
  throw new Error('Saved case artifacts failed verification; progress not updated.');
selected.runStatus = status; selected.reviewStatus = 'pending'; selected.reason = status === 'generated' ? 'All three formats structurally validated; human review pending.' : 'One or more formats failed; inspect artifacts.';
selected.updatedAt = now(); progress.updatedAt = selected.updatedAt;
const newCalls = calls.slice(priorCallCount);
const newCost = newCalls.every(call => call.costUsd !== null) ?
  newCalls.reduce((sum, call) => sum + call.costUsd, 0) : null;
progress.apiCalls += newCalls.length;
progress.knownCostUsd = (progress.knownCostUsd ?? 0) +
  newCalls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
progress.costUsd = progress.costUsd === null || newCost === null ? null : (progress.costUsd ?? 0) + newCost;
const unknownCalls = newCalls.filter(call => call.costUsd === null);
const reservedUnknownUsd = unknownCalls.length * 1.00;
progress.unknownCostReservations ??= [];
for (const call of unknownCalls) progress.unknownCostReservations.push({
  caseId: selected.caseId, callId: call.id, reservedUsd: 1.00,
  reason: 'Usage unavailable; conservative per-call maximum reserved under the fixed model and request bounds. Actual charge remains unknown.',
});
progress.budgetDebitedUsd = budgetDebitedUsd +
  newCalls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0) + reservedUnknownUsd;
progress.counts = { queued: 12, pending: progress.cases.filter(item => item.runStatus === 'pending').length,
  inProgress: 0, generated: progress.cases.filter(item => item.runStatus === 'generated').length,
  provisionallyScored: progress.cases.filter(item => item.reviewStatus === 'provisional_agent_review').length,
  humanReviewed: progress.cases.filter(item => item.reviewStatus === 'human_reviewed').length,
  failed: progress.cases.filter(item => item.runStatus === 'failed').length };
fs.writeFileSync(path.join(pilotRoot, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');
console.log(`${selected.caseId}: ${status}, ${calls.length} API calls, cost ${totalCost === null ? 'unknown' : `$${totalCost.toFixed(6)}`}`);
