import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './server.js';
import { checkSession } from './study.js';

const passages = [
  'Evaporation changes liquid water into water vapor when molecules gain enough energy to leave the surface. Warm air can hold more water vapor than cold air. Condensation occurs when water vapor cools and becomes liquid droplets, often forming clouds. Precipitation returns water from clouds to Earth as rain or snow.',
  'A database index stores a searchable representation of selected column values. The index can speed up reads because the database can locate matching rows without scanning every row. Maintaining an index adds work to inserts and updates because index entries must also change. A query planner chooses whether using an index is cheaper than scanning the table.',
];

test('a learner can start and answer an API-backed study session for varied passages', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let modelCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    modelCalls++;
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const request = JSON.parse(options.body);
    assert.equal(request.store, false);
    const source = passages.find((passage) => request.input.includes(passage));
    assert.ok(source);
    const result = request.text.format.name === 'study_session'
      ? { overview: 'A short overview of the source material.', questions: [1, 2, 3].map((n) => ({ text: `Explain idea ${n}.`, sourceQuote: source.split('. ')[n - 1] + '.' })) }
      : { level: 'supported', feedback: 'Your answer explains the cited idea.', sourceQuote: source.split('. ')[0] + '.' };
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), { status: 200 });
  };
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://localhost:${server.address().port}`;
    for (const source of passages) {
      const start = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, mode: 'summary' }) });
      assert.equal(start.status, 200);
      const session = await start.json();
      assert.equal(session.questions.length, 3);
      assert.ok(session.overview.length > 30);
      for (const question of session.questions) assert.ok(source.includes(question.sourceQuote));

      const question = session.questions[0];
      const answer = await fetch(`${base}/api/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, question: question.text, sourceQuote: question.sourceQuote, answer: question.sourceQuote }) });
      assert.equal(answer.status, 200);
      const feedback = await answer.json();
      assert.equal(feedback.level, 'supported');
      assert.ok(source.includes(feedback.sourceQuote));
    }
    assert.equal(modelCalls, passages.length * 2);
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('unsupported model citations are rejected', () => {
  assert.throws(() => checkSession(passages[0], { overview: 'Overview', questions: Array.from({ length: 3 }, () => ({ text: 'Why?', sourceQuote: 'This statement is not in the source passage.' })) }), /reference/);
});
