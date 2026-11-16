import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { server } from './server.js';
import { checkSpaceSummary, summaryParts } from '../app/api/_server/study.js';

async function request(base, route, data) {
  const response = await fetch(`${base}${route}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

test('long-document main ideas cite separate portions of the source', () => {
  const documents = [{ id: 'long', name: 'long.md', text: 'A substantial idea appears in this section. '.repeat(220) }];
  const parts = summaryParts(documents)[0];
  assert.equal(parts.length, 4);
  const source = Object.fromEntries(parts.map((part, index) => [`part${index + 1}`,
    { text: `Idea from part ${index + 1}`, sourceId: part[0].id }]));
  assert.equal(checkSpaceSummary(documents, { overview: 'A broad summary.', sources: { source1: source } }).sections[0].ideas.length, 4);
  source.part3.sourceId = parts[0][0].id;
  assert.throws(() => checkSpaceSummary(documents, { overview: 'A broad summary.', sources: { source1: source } }), /invalid idea or citation/);
});

test('main ideas summarize every active document independently of quiz and deck', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'space-summary-'));
  const previousDir = process.env.STUDY_DATA_DIR;
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STUDY_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = 'test-key';
  let calls = 0;
  let invalid = false;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    calls++;
    const input = JSON.parse(options.body);
    assert.equal(input.text.format.name, 'space_main_ideas');
    const properties = input.text.format.schema.properties.sources.properties;
    const sources = Object.fromEntries(Object.entries(properties).map(([key, schema], index) => [key,
      Object.fromEntries(Object.entries(schema.properties).map(([part, ideaSchema], partIndex) => [part,
        { text: `Important idea ${index + 1}, part ${partIndex + 1}`,
          sourceId: invalid ? 999 : ideaSchema.properties.sourceId.enum[0] }]))]));
    const output = { overview: 'The documents explain related database ideas.', sources };
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }), { status: 200 });
  };
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const spaceId = (await request(base, '/api/spaces', { title: 'Summary' })).body.space.id;
    for (const name of ['indexes.md', 'transactions.md'])
      assert.equal((await request(base, `/api/spaces/${spaceId}/documents`, { name, text: `${name} explains an important database idea. `.repeat(5) })).status, 201);
    const first = await request(base, `/api/spaces/${spaceId}/summary`, {});
    assert.equal(first.status, 200);
    assert.equal(first.body.sections.length, 2);
    assert.equal(first.body.sections[0].ideas.length, 1);
    assert.equal((await request(base, `/api/spaces/${spaceId}`)).body.space.summary.documentIds.length, 2);
    invalid = true;
    assert.equal((await request(base, `/api/spaces/${spaceId}/summary`, {})).status, 422);
    assert.equal((await request(base, `/api/spaces/${spaceId}`)).body.space.summary.documentIds.length, 2);
    invalid = false;
    assert.equal((await request(base, `/api/spaces/${spaceId}/documents`, { name: 'planning.md', text: 'A query planner chooses a useful execution strategy. '.repeat(5) })).status, 201);
    const refreshed = await request(base, `/api/spaces/${spaceId}/summary`, {});
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.body.sections.length, 3);
    assert.equal((await request(base, `/api/spaces/${spaceId}`)).body.space.summary.documentIds.length, 3);
    assert.equal(calls, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = originalFetch;
    if (previousDir === undefined) delete process.env.STUDY_DATA_DIR;
    else process.env.STUDY_DATA_DIR = previousDir;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    await rm(dataDir, { recursive: true, force: true });
  }
});
