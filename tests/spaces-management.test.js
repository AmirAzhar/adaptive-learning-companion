import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { server } from './server.js';
import { PATCH, DELETE } from '../app/api/[...path]/route.js';
import { updateSpaces } from '../app/api/_server/store.js';

const source = 'An index lets a database find rows without scanning every row. Maintaining that index adds work when a row is inserted or updated.';

async function request(base, route, method = 'GET', data) {
  const response = await fetch(`${base}${route}`, { method,
    ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  return { status: response.status, body: await response.json() };
}

test('rename, archive, restore, and delete a study space without changing its saved content', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'space-management-'));
  const previousDir = process.env.STUDY_DATA_DIR;
  process.env.STUDY_DATA_DIR = dataDir;
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const created = await request(base, '/api/spaces', 'POST', { title: 'Databases' });
    const id = created.body.space.id;
    const added = await request(base, `/api/spaces/${id}/documents`, 'POST', { name: 'indexes.md', text: source });
    assert.equal(added.status, 201);
    const runId = randomUUID();
    const deckId = randomUUID();
    await updateSpaces(spaces => {
      const space = spaces.find(item => item.id === id);
      space.runs.push({ id: runId, type: 'quiz', documentId: added.body.document.id,
        questions: [{ id: 1, text: 'What does an index do?', options: ['Find rows', 'Delete rows'], correctIndex: 0, explanation: 'It finds rows.', sourceQuote: source }],
        attempts: [], currentRound: 1, practiceQuestionIds: [1] });
      space.decks.push({ id: deckId, documentId: added.body.document.id,
        cards: [{ id: 1, front: 'What helps find rows?', back: 'An index', sourceQuote: source }],
        reviews: [], currentRound: 1, reviewCardIds: [1] });
    });
    const renameResponse = await PATCH(new Request(`${base}/api/spaces/${id}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Database Systems' }) }));
    const renamed = { status: renameResponse.status, body: await renameResponse.json() };
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.space.title, 'Database Systems');
    assert.equal(renamed.body.space.documents[0].id, added.body.document.id);
    assert.equal((await request(base, `/api/spaces/${id}`, 'PATCH', { title: ' ' })).status, 400);
    const archived = await request(base, `/api/spaces/${id}`, 'PATCH', { archived: true });
    assert.ok(archived.body.space.archivedAt);
    const listed = await request(base, '/api/spaces');
    assert.equal(listed.body.spaces[0].archivedAt, archived.body.space.archivedAt);
    assert.equal(listed.body.spaces[0].documentCount, 1);
    assert.equal(listed.body.spaces[0].runCount, 1);
    assert.equal(listed.body.spaces[0].deckCount, 1);
    assert.equal((await request(base, `/api/spaces/${id}/documents`, 'POST', { name: 'more.md', text: source })).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/runs`, 'POST', {})).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/decks`, 'POST', {})).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/runs/${runId}/answers`, 'POST', { questionId: 1, optionIndex: 0 })).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/runs/${runId}/practice`, 'POST', {})).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/decks/${deckId}/cards/1`, 'POST', { front: 'Changed?', back: 'Changed' })).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}/decks/${deckId}/cards/1/reviews`, 'POST', { rating: 'good' })).status, 400);
    assert.equal((await request(base, `/api/spaces/${id}`)).body.space.documents[0].text, source);
    const restored = await request(base, `/api/spaces/${id}`, 'PATCH', { archived: false });
    assert.equal(restored.body.space.archivedAt, null);
    assert.equal((await request(base, `/api/spaces/${id}/documents`, 'POST', { name: 'more.md', text: source })).status, 201);
    const deleteResponse = await DELETE(new Request(`${base}/api/spaces/${id}`, { method: 'DELETE' }));
    assert.equal((await deleteResponse.json()).deleted, true);
    assert.equal((await request(base, '/api/spaces')).body.spaces.length, 0);
    assert.equal((await request(base, `/api/spaces/${id}`)).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousDir === undefined) delete process.env.STUDY_DATA_DIR;
    else process.env.STUDY_DATA_DIR = previousDir;
    await rm(dataDir, { recursive: true, force: true });
  }
});
