// One-off paid Terra structured-output check. No study text is sent.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve('data/evaluation');
const pilotRoot = path.join(root, 'experiments', 'model-size-pilot');
const outputFile = path.join(pilotRoot, 'terra-compatibility.json');
if (fs.existsSync(outputFile)) throw new Error('Compatibility attempt already exists; inspect it before another call.');
const controls = JSON.parse(fs.readFileSync(path.join(pilotRoot, 'pilot-controls.draft.json')));
if (!Object.values(controls.approval).every(Boolean)) throw new Error('Pilot prerequisites are not approved.');
const envLine = fs.readFileSync(path.resolve('.env'), 'utf8').split(/\r?\n/).find(line => /^OPENAI_API_KEY=/.test(line));
const key = process.env.OPENAI_API_KEY || envLine?.slice('OPENAI_API_KEY='.length).trim().replace(/^['"]|['"]$/g, '');
if (!key) throw new Error('OPENAI_API_KEY unavailable.');
const body = { model: 'gpt-6.1-terra', store: false, reasoning: { effort: 'medium' },
  instructions: 'Return the requested JSON answer.', input: 'Return ok as true.',
  text: { format: { type: 'json_schema', name: 'compatibility_check', strict: true,
    schema: { type: 'object', additionalProperties: false, required: ['ok'],
      properties: { ok: { type: 'boolean' } } } } } };
const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
const record = { purpose: 'isolated Terra structured-output compatibility', model: body.model,
  reasoningEffort: 'medium', sourceTextSent: false, requestSha256: hash,
  startedAt: new Date().toISOString(), endedAt: null, responseStatus: null, returnedModel: null,
  usage: null, output: null, validationOutcome: 'pending', costUsd: null,
  costReason: 'Response pending.', error: null };
const save = () => fs.writeFileSync(outputFile, JSON.stringify(record, null, 2) + '\n');
save();
try {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const data = await response.json();
  record.endedAt = new Date().toISOString(); record.responseStatus = response.status;
  record.returnedModel = data.model ?? null; record.usage = data.usage ?? null;
  record.output = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text ?? null;
  const cached = data.usage?.input_tokens_details?.cached_tokens ?? 0;
  if (Number.isInteger(data.usage?.input_tokens) && Number.isInteger(data.usage?.output_tokens) &&
      Number.isInteger(cached) && cached >= 0 && cached <= data.usage.input_tokens &&
      data.usage.input_tokens <= 272000 && /^gpt-6\.1-terra/.test(data.model ?? '')) {
    record.costUsd = ((data.usage.input_tokens - cached) + cached * 0.05 + data.usage.output_tokens * 5) / 1e6;
    record.costReason = null;
  } else record.costReason = 'Usage or returned model unavailable for standard pricing; check billing.';
  if (!response.ok) record.error = data.error?.message ?? `HTTP ${response.status}`;
  else {
    const parsed = JSON.parse(record.output);
    if (data.status !== 'completed' || parsed.ok !== true) throw new Error('Structured output did not validate.');
    record.validationOutcome = 'passed';
  }
} catch (error) {
  record.endedAt ??= new Date().toISOString();
  record.error = error.message;
  record.validationOutcome = 'failed';
  if (record.costUsd === null) record.costReason = 'Attempt may have been billed without usage; check billing.';
} finally { save(); }
console.log(JSON.stringify({ validationOutcome: record.validationOutcome, responseStatus: record.responseStatus,
  costUsd: record.costUsd, costReason: record.costReason, error: record.error }));
