// Isolated, sequential pilot runner. Never imports routes or writes study-space data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { sourceBlocks, generationTargets, checkSpaceSummary, checkQuiz, checkFlashcards } from '../../../app/api/_server/study.js';
import { completeCoverage } from '../../../app/api/_server/coverage.js';

const root = path.resolve('data/evaluation');
const pilotRoot = path.join(root, 'experiments', 'model-size-pilot');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
const progress = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'progress.json'), 'utf8'));
const corpus = read('corpus-manifest.json');
const controls = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'pilot-controls.draft.json'), 'utf8'));
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
  if (progress.cases.length !== 12 || new Set(progress.cases.map(item => item.caseId)).size !== 12)
    throw new Error('The active queue is not the 12-case pilot.');
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
  const rates = model?.startsWith('gpt-4o-mini') ? { input: 0.15, cached: 0.075, output: 0.6 }
    : model?.startsWith('gpt-6.1-terra') ? { input: 1, cached: 0.05, output: 5 } : null;
  if (!rates) return { usd: null, reason: 'Returned model has no approved rate.' };
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  if (!Number.isInteger(cached) || cached < 0 || cached > usage.input_tokens)
    return { usd: null, reason: 'Invalid cached token count.' };
  if (model.startsWith('gpt-6.1-terra') && usage.input_tokens > 272000)
    return { usd: null, reason: 'Long-context price adjustment needs review.' };
  return { usd: ((usage.input_tokens - cached) * rates.input + cached * rates.cached + usage.output_tokens * rates.output) / 1e6,
    reason: null };
}

function initialScores(reference) {
  const concepts = reference.concepts.filter(item => item.locations.some(location => location.sizeId === selected.sizeId));
  return { reviewStatus: 'pending_human_review', reviewer: null,
    reason: 'No generated item has been human-scored. Structural validation is not factual review.',
    referenceVersion: reference.version, referenceConceptCount: concepts.length,
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
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  const testDocs = Array.from({ length: 5 }, (_, index) => ({ id: `test-${index + 1}`, name: `Test ${index + 1}`,
    text: `Document ${index + 1} explains a distinct idea and its practical application. `.repeat(12) }));
  const blocks = sourceBlocks(testDocs);
  const sourceIds = testDocs.map(document => blocks.find(block => block.documentId === document.id).id);
  const { generateSpaceSummary, generateQuiz, generateFlashcards } = await import('../../../app/api/_server/model.js');
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    let answer;
    if (body.text.format.name === 'space_main_ideas') {
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
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4o-mini-2024-07-18',
      usage: { input_tokens: 100, output_tokens: 50 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  checkSpaceSummary(testDocs, (await generateSpaceSummary(testDocs)).output);
  checkQuiz(testDocs, (await generateQuiz(testDocs)).output);
  checkFlashcards(testDocs, (await generateFlashcards(testDocs)).output);
  console.log('Offline mock validated all three model request/response paths. No API calls.');
  process.exit(0);
}
if (args[0] !== '--case' || args.length !== 2) throw new Error('Use --verify or --case <queued-case-id>.');
const selected = progress.cases.find(item => item.caseId === args[1]);
if (!selected || selected !== progress.cases.find(item => item.runStatus === 'pending' || item.runStatus === 'in_progress'))
  throw new Error('Select the earliest incomplete case in queue order.');
if (selected.runStatus !== 'pending') throw new Error('Interrupted cases require manual artifact inspection before resuming.');
if (!Object.values(controls.approval).every(Boolean)) throw new Error('Reference, threshold/budget, and corpus release approvals are required.');
const reference = read('reference-concepts.reviewed.json');
if (reference.status !== 'human_reviewed' || !reference.sets?.some(set => set.id === selected.sourceSetId))
  throw new Error('Human-reviewed reference concepts are required.');
const budgetDebitedUsd = progress.budgetDebitedUsd ?? progress.costUsd;
if (progress.apiCalls !== 0 && budgetDebitedUsd == null) throw new Error('Prior cost is unknown; resolve billing before new calls.');
if (budgetDebitedUsd >= controls.budget.stageUsdMax) throw new Error('Stage budget exhausted.');
const sourceSet = corpus.sets.find(item => item.id === selected.sourceSetId);
const size = sourceSet?.sizes.find(item => item.id === selected.sizeId);
if (!size) throw new Error('Case source set unavailable.');
const documents = size.documents.map(item => ({ id: item.id, name: item.id,
  text: fs.readFileSync(path.join(root, item.file), 'utf8') }));
loadKey();
process.env.OPENAI_MODEL = selected.model;
const { generateSpaceSummary, generateQuiz, generateFlashcards, generateQuizCoverage, generateFlashcardCoverage } = await import('../../../app/api/_server/model.js');
const caseDir = path.join(pilotRoot, selected.caseId);
if (fs.existsSync(caseDir)) throw new Error('Case directory already exists; inspect it before resuming.');
fs.mkdirSync(caseDir);
const save = (file, value) => fs.writeFileSync(path.join(caseDir, file), JSON.stringify(value, null, 2) + '\n');
const calls = [];
const outputs = { mainIdeas: { status: 'pending' }, quiz: { status: 'pending' }, flashcards: { status: 'pending' } };
const manifest = { caseId: selected.caseId, sourceSetId: selected.sourceSetId, sizeId: selected.sizeId,
  documents: size.documents.map(item => ({ id: item.id, sha256: item.sha256, characters: item.characters })),
  sourceSnapshotLockSha256: hash(fs.readFileSync(path.join(root, 'source-lock.json'))),
  characters: size.actualCharacters, documentCount: documents.length, documentOrder: documents.map(item => item.id),
  modelId: selected.model, returnedModelVersions: [], reasoningEffort: selected.reasoningEffort,
  processing: 'whole-selection', outputPolicy: controls.modelSettings.outputPolicy, repetition: selected.repetition,
  codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  requestSettings: controls.modelSettings, baselineChanges: ['Evaluation uses an isolated runner with source input beyond the product limit where applicable.',
    'Evaluation request timeouts follow the approved pilot controls; product timeouts are unchanged.'],
  startedAt: now(), requestInputTokens: null };
save('manifest.json', manifest); save('calls.json', calls); save('outputs.json', outputs);
save('scores.json', initialScores(reference.sets.find(set => set.id === selected.sourceSetId)));
let currentFormat = null, purpose = null;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected API endpoint.');
  const body = JSON.parse(init.body);
  if (selected.reasoningEffort) body.reasoning = { effort: selected.reasoningEffort };
  const spent = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  if (calls.some(call => call.endedAt && call.costUsd === null))
    throw new Error('A previous call has unknown cost; stop for billing review.');
  if (spent >= controls.budget.caseUsdMax || budgetDebitedUsd + spent >= controls.budget.stageUsdMax)
    throw new Error('Approved budget cap reached.');
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
AbortSignal.timeout = milliseconds => productTimeout(controls.modelSettings.requestTimeoutMs[currentFormat] ?? milliseconds);
await execute('mainIdeas', generateSpaceSummary, output => checkSpaceSummary(documents, output));
await execute('quiz', generateQuiz, output => checkQuiz(documents, output), generateQuizCoverage);
await execute('flashcards', generateFlashcards, output => checkFlashcards(documents, output), generateFlashcardCoverage);
AbortSignal.timeout = productTimeout;
globalThis.fetch = nativeFetch;
manifest.returnedModelVersions = [...new Set(calls.map(call => call.model).filter(Boolean))];
manifest.requestInputTokens = Object.fromEntries(['mainIdeas', 'quiz', 'flashcards'].map(format =>
  [format, calls.find(call => call.format === format && call.purpose === 'initial')?.inputTokens ?? null]));
manifest.endedAt = now(); save('manifest.json', manifest);
const knownCost = calls.every(call => call.costUsd !== null);
const totalCost = knownCost ? calls.reduce((sum, call) => sum + call.costUsd, 0) : null;
const status = Object.values(outputs).every(output => output.status === 'validated') ? 'generated' : 'failed';
const referenceIds = reference.sets.find(set => set.id === selected.sourceSetId).concepts
  .filter(item => item.locations.some(location => location.sizeId === selected.sizeId)).map(item => item.id);
const itemIds = Object.fromEntries(Object.entries(outputs).map(([name, output]) => [name,
  output.status === 'validated' ? (name === 'mainIdeas' ? output.validated.sections.flatMap((section, index) =>
    section.ideas.map((_, ideaIndex) => `${documents[index].id}-idea-${ideaIndex + 1}`))
    : (name === 'quiz' ? output.validated.questions : output.validated.cards).map(item => `${name}-${item.id}`)) : []]));
const latency = Object.fromEntries(Object.entries(outputs).map(([name, output]) =>
  [name, (new Date(output.endedAt) - new Date(output.startedAt)) / 1000]));
const report = `# ${selected.caseId}\n\n` +
  `Source set: ${selected.sourceSetId}, ${size.actualCharacters} characters across five documents. Model: ${selected.model}; reasoning: ${selected.reasoningEffort ?? 'none'}.\n\n` +
  `## Generation\n\n` + Object.entries(outputs).map(([name, output]) => `- ${name}: ${output.status}${output.error ? ` (${output.error})` : ''}`).join('\n') + '\n\n' +
  `API attempts: ${calls.length}; cost: ${totalCost === null ? 'unknown (billing review needed)' : `$${totalCost.toFixed(6)}`}. ` +
  `Elapsed seconds by format: ${JSON.stringify(latency)}.\n\n` +
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
progress.apiCalls += calls.length;
progress.costUsd = progress.costUsd === null || totalCost === null ? null : progress.costUsd + totalCost;
progress.budgetDebitedUsd = totalCost === null ? null : budgetDebitedUsd + totalCost;
progress.counts = { queued: 12, pending: progress.cases.filter(item => item.runStatus === 'pending').length,
  inProgress: 0, generated: progress.cases.filter(item => item.runStatus === 'generated').length,
  provisionallyScored: 0, humanReviewed: 0, failed: progress.cases.filter(item => item.runStatus === 'failed').length };
fs.writeFileSync(path.join(pilotRoot, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');
console.log(`${selected.caseId}: ${status}, ${calls.length} API calls, cost ${totalCost === null ? 'unknown' : `$${totalCost.toFixed(6)}`}`);
