import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { server } from '../server/index.js';

const source = 'A database index stores selected column values in a searchable structure. It helps the database find matching rows without scanning the entire table. Inserts and updates take more work because the database also maintains the index. A query planner decides when using the index is cheaper than scanning the table.';

async function request(base, route, data) {
  const response = await fetch(`${base}${route}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

test('flashcard decks are independent, editable, reviewed locally, and saved', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'study-cards-'));
  const originalDir = process.env.STUDY_DATA_DIR;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STUDY_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = 'test-key';
  let modelCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    modelCalls++;
    const body = JSON.parse(options.body);
    assert.equal(body.text.format.name, 'study_flashcards');
    assert.equal(body.store, false);
    const cards = Object.fromEntries([1, 2, 3, 4, 5].map((id) =>
      [`card${id}`, { front: `Question ${id}?`, back: `Answer ${id}.`, sourceId: 1 }]));
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4o-mini',
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(cards) }] }] }), { status: 200 });
  };
  let listening = false;
  const start = async () => { await new Promise((resolve) => server.listen(0, resolve)); listening = true; return `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { await new Promise((resolve) => server.close(resolve)); listening = false; };
  try {
    let base = await start();
    const spaceId = (await request(base, '/api/spaces', { title: 'Cards' })).body.space.id;
    const documentId = (await request(base, `/api/spaces/${spaceId}/documents`, { name: 'notes.txt', text: source })).body.document.id;
    const generated = await request(base, `/api/spaces/${spaceId}/decks`, { documentId });
    assert.equal(generated.status, 200);
    assert.equal(generated.body.cards.length, 5);
    assert.ok(generated.body.cards[0].sourceQuote.includes('database index'));
    assert.ok(!JSON.stringify(generated.body).includes('test-key'));
    const deckId = generated.body.id;
    assert.equal((await request(base, `/api/spaces/${spaceId}/decks/${deckId}/cards/1`, { front: '', back: 'X' })).status, 400);
    assert.equal((await request(base, `/api/spaces/${spaceId}/decks/${deckId}/cards/1`,
      { front: 'What does an index do?', back: 'It helps find matching rows.' })).status, 200);
    const ratingRoute = (id) => `/api/spaces/${spaceId}/decks/${deckId}/cards/${id}/reviews`;
    assert.equal((await request(base, ratingRoute(1), { rating: 'again' })).status, 200);
    assert.equal((await request(base, ratingRoute(1), { rating: 'good' })).status, 400);
    assert.equal((await request(base, `/api/spaces/${spaceId}/decks/${deckId}/review`, { scope: 'again' })).status, 400);
    for (let id = 2; id <= 5; id++) assert.equal((await request(base, ratingRoute(id), { rating: 'good' })).status, 200);
    const retry = await request(base, `/api/spaces/${spaceId}/decks/${deckId}/review`, { scope: 'again' });
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.body.cardIds, [1]);
    assert.equal((await request(base, ratingRoute(2), { rating: 'good' })).status, 400);
    assert.equal(modelCalls, 1);
    await stop();
    base = await start();
    const reopened = (await request(base, `/api/spaces/${spaceId}`)).body.space;
    assert.equal(reopened.decks[0].id, deckId);
    assert.equal(reopened.decks[0].cards[0].front, 'What does an index do?');
    assert.equal(reopened.decks[0].reviews.length, 5);
    assert.equal(reopened.decks[0].currentRound, 2);
    assert.equal((await request(base, ratingRoute(1), { rating: 'good' })).status, 200);
    const another = await request(base, `/api/spaces/${spaceId}/decks`, { documentId });
    assert.equal(another.status, 200);
    assert.notEqual(another.body.id, deckId);
    assert.equal((await request(base, '/api/spaces')).body.spaces[0].deckCount, 2);
    assert.equal(modelCalls, 2);
  } finally {
    if (listening) await stop();
    globalThis.fetch = originalFetch;
    if (originalDir === undefined) delete process.env.STUDY_DATA_DIR;
    else process.env.STUDY_DATA_DIR = originalDir;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    await rm(dataDir, { recursive: true, force: true });
  }
});
