import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { server } from './server.js';

async function request(base, route, data) {
  const response = await fetch(`${base}${route}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

test('generation fills missed source coverage and supports a focused source selection', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'source-coverage-'));
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
    const first = input.input.includes('first.md');
    const second = input.input.includes('second.md');
    assert.equal(second, true);
    const isQuiz = input.text.format.name === 'study_quiz';
    const count = first ? 3 : 1;
    const question = (index) => ({ text: `Question ${first ? 'first' : 'second'} ${index}?`,
      optionA: 'Correct', optionB: 'Wrong', optionC: 'Other', optionD: 'None',
      correctOption: 'A', explanation: 'Supported by the source.', sourceId: 1 });
    const card = (index) => ({ front: `Card ${first ? 'first' : 'second'} ${index}?`, back: 'Supported.', sourceId: 1 });
    const output = isQuiz ? { overview: 'Two subjects.', questions: Array.from({ length: count }, (_, index) => question(index + 1)) }
      : { cards: Array.from({ length: count }, (_, index) => card(index + 1)) };
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4o-mini',
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }), { status: 200 });
  };
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const spaceId = (await request(base, '/api/spaces', { title: 'Coverage' })).body.space.id;
    const firstId = (await request(base, `/api/spaces/${spaceId}/documents`, { name: 'first.md', text: 'The first source explains indexes and queries. '.repeat(70) })).body.document.id;
    const secondId = (await request(base, `/api/spaces/${spaceId}/documents`, { name: 'second.md', text: 'The second source explains transactions and rollback. '.repeat(70) })).body.document.id;
    const quiz = await request(base, `/api/spaces/${spaceId}/runs`, {});
    assert.equal(quiz.status, 200);
    assert.equal(new Set(quiz.body.questions.map((item) => item.documentId)).size, 2);
    assert.equal(quiz.body.apiCalls.length, 2);
    const deck = await request(base, `/api/spaces/${spaceId}/decks`, {});
    assert.equal(deck.status, 200);
    assert.equal(new Set(deck.body.cards.map((item) => item.documentId)).size, 2);
    assert.equal(deck.body.apiCalls.length, 2);
    const focused = await request(base, `/api/spaces/${spaceId}/runs`, { documentIds: [secondId] });
    assert.equal(focused.status, 200);
    assert.deepEqual(focused.body.questions.map((item) => item.documentId), [secondId]);
    const saved = (await request(base, `/api/spaces/${spaceId}`)).body.space;
    assert.deepEqual(saved.runs[0].documentIds, [firstId, secondId]);
    assert.deepEqual(saved.runs[1].documentIds, [secondId]);
    assert.equal((await request(base, `/api/spaces/${spaceId}/runs`, { documentIds: [firstId, 'missing'] })).status, 400);
    assert.equal(calls, 5);
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
