// Resume only the failed flashcards format of the first pilot case. Preserve every prior attempt.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generationTargets, checkFlashcards } from '../../../app/api/_server/study.js';
import { completeCoverage } from '../../../app/api/_server/coverage.js';

const root = path.resolve('data/evaluation');
const pilotRoot = path.join(root, 'experiments', 'model-size-pilot');
const caseId = 'frontend-40k-mini-whole-capped-r1';
const dir = path.join(pilotRoot, caseId);
const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(dir, file), JSON.stringify(data, null, 2) + '\n');
const now = () => new Date().toISOString();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const progress = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'progress.json')));
const controls = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'pilot-controls.draft.json')));
const corpus = JSON.parse(fs.readFileSync(path.join(root, 'corpus-manifest.json')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'source-lock.json')));
const manifest = read('manifest.json');
const calls = read('calls.json');
const outputs = read('outputs.json');
const scores = read('scores.json');
const selected = progress.cases.find(item => item.caseId === caseId);
if (selected?.runStatus !== 'in_progress' || calls.length !== 4 || calls[3].error !== 'timeout' ||
    outputs.mainIdeas.status !== 'validated' || outputs.quiz.status !== 'validated' ||
    outputs.flashcards.status !== 'failed' || !progress.unknownCostBound ||
    progress.budgetDebitedUsd == null || controls.modelSettings.requestTimeoutMs.flashcards !== 90000)
  throw new Error('Retry prerequisites changed; inspect saved artifacts before a paid call.');
for (const item of lock.files) {
  const file = path.join(root, 'source-snapshot', item.relativePath);
  if (hash(fs.readFileSync(file)) !== item.sha256) throw new Error('Frozen snapshot changed.');
}
const size = corpus.sets.find(item => item.id === selected.sourceSetId)?.sizes.find(item => item.id === selected.sizeId);
if (!size || size.documents.length !== 5 || size.documents.some((item, index) =>
    item.sha256 !== manifest.documents[index]?.sha256 || hash(fs.readFileSync(path.join(root, item.file))) !== item.sha256))
  throw new Error('Case sources changed.');
const documents = size.documents.map(item => ({ id: item.id, name: item.id,
  text: fs.readFileSync(path.join(root, item.file), 'utf8') }));
const envLine = fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/).find(line => /^OPENAI_API_KEY=/.test(line));
process.env.OPENAI_API_KEY ||= envLine?.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY unavailable.');
process.env.OPENAI_MODEL = selected.model;
const { generateFlashcards, generateFlashcardCoverage } = await import('../../../app/api/_server/model.js');
const firstNewCall = calls.length;
const nativeFetch = globalThis.fetch;
const nativeTimeout = AbortSignal.timeout;
let purpose = 'manual_retry';
AbortSignal.timeout = () => nativeTimeout(controls.modelSettings.requestTimeoutMs.flashcards);
globalThis.fetch = async (url, init) => {
  if (url !== controls.modelSettings.endpoint) throw new Error('Unexpected API endpoint.');
  const body = JSON.parse(init.body);
  const priorNew = calls.slice(firstNewCall);
  if (priorNew.some(call => call.endedAt && call.costUsd === null))
    throw new Error('Retry cost unknown; stop further requests.');
  const spent = priorNew.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  if (spent >= controls.budget.caseUsdMax || progress.budgetDebitedUsd + spent >= controls.budget.stageUsdMax)
    throw new Error('Approved budget cap reached.');
  const record = { id: calls.length + 1, format: 'flashcards', purpose, startedAt: now(), endedAt: null,
    timeoutMs: controls.modelSettings.requestTimeoutMs.flashcards,
    requestSha256: hash(JSON.stringify(body)), responseStatus: null, error: null,
    validationOutcome: 'pending', model: null, usage: null, inputTokens: null,
    outputTokens: null, reasoningTokens: null, costUsd: null, costReason: 'Response pending.' };
  calls.push(record); write('calls.json', calls);
  try {
    const response = await nativeFetch(url, init);
    const data = await response.clone().json().catch(() => null);
    record.endedAt = now(); record.responseStatus = response.status;
    record.model = data?.model ?? null; record.usage = data?.usage ?? null;
    record.inputTokens = data?.usage?.input_tokens ?? null;
    record.outputTokens = data?.usage?.output_tokens ?? null;
    record.reasoningTokens = data?.usage?.output_tokens_details?.reasoning_tokens ?? null;
    const cached = data?.usage?.input_tokens_details?.cached_tokens ?? 0;
    if (/^gpt-4o-mini/.test(record.model ?? '') && Number.isInteger(record.inputTokens) &&
        Number.isInteger(record.outputTokens) && Number.isInteger(cached) && cached >= 0 && cached <= record.inputTokens) {
      record.costUsd = ((record.inputTokens - cached) * 0.15 + cached * 0.075 + record.outputTokens * 0.60) / 1e6;
      record.costReason = null;
    } else record.costReason = 'Usage or supported returned model unavailable; check billing.';
    if (data?.output) record.responseOutput = data.output;
    if (!response.ok) record.error = data?.error?.type ?? `HTTP ${response.status}`;
    write('calls.json', calls);
    return response;
  } catch (error) {
    record.endedAt = now(); record.error = error.name === 'TimeoutError' ? 'timeout' : error.message;
    record.costReason = 'Request failed before usage was returned; check billing.';
    write('calls.json', calls);
    throw error;
  }
};

const startedAt = now();
const oldFailure = outputs.flashcards;
try {
  const generated = await generateFlashcards(documents);
  const checked = checkFlashcards(documents, generated.output);
  calls[firstNewCall].validationOutcome = 'passed_initial'; write('calls.json', calls);
  purpose = 'coverage_repair';
  const completed = await completeCoverage({ documents, items: checked.cards,
    target: generationTargets(documents).cards, field: 'front', generate: generateFlashcardCoverage,
    check: (pending, item) => checkFlashcards(pending, { cards: [item] }, 1).cards[0], firstCall: {} });
  for (const call of calls.slice(firstNewCall + 1)) if (call.validationOutcome === 'pending')
    call.validationOutcome = 'returned_for_coverage_check';
  if (completed.uncovered.length) throw new Error(`Uncovered documents: ${completed.uncovered.map(item => item.id).join(', ')}`);
  outputs.flashcards = { status: 'validated', startedAt, endedAt: now(), raw: generated.output,
    validated: { cards: completed.items }, previousAttempts: [oldFailure] };
} catch (error) {
  if (calls[firstNewCall]?.validationOutcome === 'pending') calls[firstNewCall].validationOutcome = 'failed_or_unavailable';
  outputs.flashcards = { status: 'failed', startedAt, endedAt: now(), error: error.message,
    previousAttempts: [oldFailure], failedResponses: calls.slice(firstNewCall)
      .filter(call => call.responseOutput).map(call => ({ callId: call.id, output: call.responseOutput })) };
}
globalThis.fetch = nativeFetch; AbortSignal.timeout = nativeTimeout;
write('calls.json', calls); write('outputs.json', outputs);
manifest.returnedModelVersions = [...new Set(calls.map(call => call.model).filter(Boolean))];
manifest.retry = { reason: 'User requested retry after 30-second flashcards timeout',
  originalCallCount: firstNewCall, startedAt, endedAt: now(), flashcardsTimeoutMs: 90000,
  scope: 'flashcards only; saved Main ideas and Quiz outputs retained' };
manifest.requestInputTokens.flashcards = calls[firstNewCall]?.inputTokens ?? null;
manifest.endedAt = now(); write('manifest.json', manifest);
scores.automatedCounts.flashcardsValidatedItems = outputs.flashcards.status === 'validated' ? outputs.flashcards.validated.cards.length : null;
scores.automatedCounts.flashcardsValidatedItemsReason = outputs.flashcards.status === 'validated' ? null : 'Retry did not yield a validated deck';
scores.automatedCounts.apiAttempts = calls.length;
scores.automatedCounts.knownCostUsd = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
scores.automatedCounts.totalCostUsd = null;
scores.automatedCounts.totalCostReason = 'Original timed-out flashcards call had no usage.';
write('scores.json', scores);
const newCalls = calls.slice(firstNewCall);
const newCostKnown = newCalls.every(call => call.costUsd !== null);
const newCost = newCostKnown ? newCalls.reduce((sum, call) => sum + call.costUsd, 0) : null;
const status = outputs.flashcards.status === 'validated' ? 'generated' : 'failed';
const reportPath = path.join(dir, 'report.md');
const report = fs.readFileSync(reportPath, 'utf8') + `\n## User-authorized flashcards retry\n\n` +
  `The original four calls, including the 30-second timeout, remain in calls.json. ` +
  `Flashcards alone were retried with a 90-second isolated evaluation timeout. ` +
  `New attempts: ${newCalls.map(call => call.id).join(', ')}; new cost: ${newCost === null ? 'unknown' : `$${newCost.toFixed(7)}`}. ` +
  `Result: ${outputs.flashcards.status}${outputs.flashcards.error ? ` (${outputs.flashcards.error})` : ''}. ` +
  `Validated card IDs: ${outputs.flashcards.status === 'validated' ? outputs.flashcards.validated.cards.map(card => `flashcards-${card.id}`).join(', ') : 'none'}.\n\n` +
  `The total actual case cost is still unknown because call 4 returned no usage. ` +
  `The first failed attempt remains part of reliability and latency accounting. ` +
  `Concept coverage, accuracy, usefulness, and threshold decisions await blinded human scoring.\n`;
fs.writeFileSync(reportPath, report);
for (const file of ['manifest.json', 'calls.json', 'outputs.json', 'scores.json', 'report.md'])
  if (!fs.existsSync(path.join(dir, file))) throw new Error(`Missing ${file}; progress not updated.`);
if (read('calls.json').length !== calls.length || !['mainIdeas', 'quiz', 'flashcards'].every(name => read('outputs.json')[name]?.status) ||
    read('manifest.json').documents.some((item, index) => item.sha256 !== size.documents[index].sha256) ||
    !read('scores.json').formats?.flashcards || !fs.readFileSync(reportPath, 'utf8').includes('flashcards-'))
  throw new Error('Saved retry artifacts failed verification; progress not updated.');
selected.runStatus = status; selected.reviewStatus = 'pending';
selected.reason = status === 'generated' ? 'All three formats validated after one user-authorized flashcards retry; human scoring pending.' :
  'Flashcards retry failed; inspect preserved call attempts.';
selected.updatedAt = now(); progress.updatedAt = selected.updatedAt;
progress.apiCalls += newCalls.length;
progress.knownCostLowerBoundUsd += newCalls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
progress.costUsd = null; // Original timeout still has unknown actual cost.
progress.budgetDebitedUsd = newCost === null ? null : progress.budgetDebitedUsd + newCost;
progress.counts = { queued: 12, pending: progress.cases.filter(item => item.runStatus === 'pending').length,
  inProgress: 0, generated: progress.cases.filter(item => item.runStatus === 'generated').length,
  provisionallyScored: 0, humanReviewed: 0, failed: progress.cases.filter(item => item.runStatus === 'failed').length };
progress.queueStatus = newCost === null ? 'paused_unknown_cost' : 'ready';
progress.queueReason = newCost === null ? 'New retry cost is unknown; further paid calls need billing or another bound.' :
  'Original timed-out call has a $2 budget reserve; retry cost is known. Continue the sequential pilot.';
progress.setup.currentTask = status === 'generated' ? 'review_first_case_and_run_next_pending' : 'review_failed_retry';
fs.writeFileSync(path.join(pilotRoot, 'progress.json'), JSON.stringify(progress, null, 2) + '\n');
console.log(`${caseId}: ${status}; ${newCalls.length} new API calls; retry cost ${newCost === null ? 'unknown' : `$${newCost.toFixed(7)}`}`);
