import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { server } from './server.js';

const source = 'A database index stores selected column values in a searchable structure. It helps the database find matching rows without scanning the entire table. Inserts and updates take more work because the database also maintains the index. A query planner decides when using the index is cheaper than scanning the table.';
const longSource = source.repeat(Math.ceil(7100 / source.length)).slice(0, 7100);

async function request(base, route, data) {
  const response = await fetch(`${base}${route}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { status: response.status, body: await response.json() };
}

test('a study space keeps documents, sessions, and feedback after a server restart', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'study-spaces-'));
  const originalDir = process.env.STUDY_DATA_DIR;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.STUDY_DATA_DIR = dataDir;
  process.env.OPENAI_API_KEY = 'test-key';
  let modelCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    modelCalls++;
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.store, false);
    assert.ok(requestBody.input.includes(source));
    const output = requestBody.text.format.name === 'study_session'
      ? { overview: 'Indexes speed up some reads but add write overhead.', questions: [1, 2, 3].map((id) =>
        ({ text: `Explain index idea ${id}.`, sourceQuote: source.split('. ')[id - 1] + '.' })) }
      : { level: 'supported', feedback: 'Your answer explains the trade-off.', sourceQuote: source.split('. ')[0] + '.' };
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4o-mini',
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }), { status: 200 });
  };
  let listening = false;
  const start = async () => { await new Promise((resolve) => server.listen(0, resolve)); listening = true; return `http://127.0.0.1:${server.address().port}`; };
  const stop = async () => { await new Promise((resolve) => server.close(resolve)); listening = false; };
  try {
    let base = await start();
    const created = await request(base, '/api/spaces', { title: ' Database Systems ' });
    assert.equal(created.status, 201);
    const spaceId = created.body.space.id;
    assert.equal(created.body.space.title, 'Database Systems');
    const badType = await request(base, `/api/spaces/${spaceId}/documents`, { name: 'notes.pdf', text: source });
    assert.equal(badType.status, 400);
    const shortText = await request(base, `/api/spaces/${spaceId}/documents`, { name: 'notes.txt', text: 'too short' });
    assert.equal(shortText.status, 400);
    const tooLong = await request(base, `/api/spaces/${spaceId}/documents`, { name: 'notes.md', text: 'x'.repeat(20001) });
    assert.equal(tooLong.status, 400);
    const added = await request(base, `/api/spaces/${spaceId}/documents`, { name: 'indexes.md', text: longSource });
    assert.equal(added.status, 201);
    assert.equal(added.body.document.text.length, 7100);
    const documentId = added.body.document.id;
    const started = await request(base, `/api/spaces/${spaceId}/runs`, { documentId });
    assert.equal(started.status, 200);
    assert.equal(started.body.questions.length, 3);
    assert.ok(!started.body.apiRequest.input.includes('Style:'));
    assert.ok(!JSON.stringify(started.body).includes('test-key'));
    const runId = started.body.id;
    const answered = await request(base, `/api/spaces/${spaceId}/runs/${runId}/answers`,
      { questionId: 1, answer: 'It speeds up reads, at the cost of more work on writes.' });
    assert.equal(answered.status, 200);
    assert.equal(answered.body.level, 'supported');
    assert.equal(modelCalls, 2);
    await stop();
    base = await start();
    const reopened = await request(base, `/api/spaces/${spaceId}`);
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.space.documents[0].text, longSource);
    assert.equal(reopened.body.space.runs[0].id, runId);
    assert.ok(!('mode' in reopened.body.space.runs[0]));
    assert.equal(reopened.body.space.runs[0].attempts[0].answer,
      'It speeds up reads, at the cost of more work on writes.');
    assert.equal(reopened.body.space.runs[0].attempts[0].feedback, 'Your answer explains the trade-off.');
    const listed = await request(base, '/api/spaces');
    assert.equal(listed.body.spaces[0].documentCount, 1);
    assert.equal(listed.body.spaces[0].runCount, 1);
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
