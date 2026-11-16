import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { server } from './server.js';

const first = 'An index lets a database find matching rows without scanning every row. Keeping the index current adds work to inserts and updates.';
const second = 'A transaction groups related changes into one unit. If a change fails, a rollback restores the earlier consistent state.';

async function request(base, route, data) {
  const response = await fetch(`${base}${route}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

test('space generation snapshots all documents and cites each source document', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'space-generation-'));
  const previousDir = process.env.STUDY_DATA_DIR;
  const previousKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STUDY_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    calls++;
    const input = JSON.parse(options.body);
    assert.match(input.input, /indexes\.md/);
    assert.match(input.input, /transactions\.md/);
    const question = (id) => ({ text: `Question ${id}`, optionA: 'Yes', optionB: 'No', optionC: 'Maybe', optionD: 'Unknown', correctOption: 'A', explanation: 'Supported by the source.', sourceId: id });
    const card = (id) => ({ front: `Card ${id}`, back: 'Supported by the source.', sourceId: id === 1 ? 1 : 2 });
    const output = input.text.format.name === 'study_quiz'
      ? { overview: 'Indexes and transactions support database work.', question1: question(1), question2: question(2), question3: question(2) }
      : { card1: card(1), card2: card(2), card3: card(3), card4: card(4), card5: card(5) };
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }), { status: 200 });
  };
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const spaceId = (await request(base, '/api/spaces', { title: 'Databases' })).body.space.id;
    const firstId = (await request(base, `/api/spaces/${spaceId}/documents`, { name: 'indexes.md', text: first })).body.document.id;
    const secondId = (await request(base, `/api/spaces/${spaceId}/documents`, { name: 'transactions.md', text: second })).body.document.id;
    const quiz = await request(base, `/api/spaces/${spaceId}/runs`, {});
    const deck = await request(base, `/api/spaces/${spaceId}/decks`, {});
    assert.equal(quiz.status, 200);
    assert.equal(deck.status, 200);
    assert.deepEqual(quiz.body.questions.map((item) => item.documentId), [firstId, secondId, secondId]);
    assert.deepEqual(deck.body.cards.map((item) => item.documentId), [firstId, secondId, secondId, secondId, secondId]);
    const added = await request(base, `/api/spaces/${spaceId}/documents`, { name: 'third.md', text: first });
    assert.equal(added.status, 201);
    const saved = (await request(base, `/api/spaces/${spaceId}`)).body.space;
    assert.deepEqual(saved.runs[0].documentIds, [firstId, secondId]);
    assert.deepEqual(saved.decks[0].documentIds, [firstId, secondId]);
    assert.equal(saved.runs[0].documentId, undefined);
    assert.equal(calls, 2);
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
