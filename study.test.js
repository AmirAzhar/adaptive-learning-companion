import { test } from 'node:test';
import assert from 'node:assert/strict';
import { server } from './server.js';
import { checkSession, checkQuiz, sourceChunks } from './study.js';
import { estimateCost } from './model.js';

const passages = [
  'Evaporation changes liquid water into water vapor when molecules gain enough energy to leave the surface. Warm air can hold more water vapor than cold air. Condensation occurs when water vapor cools and becomes liquid droplets, often forming clouds. Precipitation returns water from clouds to Earth as rain or snow.',
  'A database index stores a searchable representation of selected column values. The index can speed up reads because the database can locate matching rows without scanning every row. Maintaining an index adds work to inserts and updates because index entries must also change. A query planner chooses whether using an index is cheaper than scanning the table.',
];

test('a learner can start and answer an API-backed study session for varied passages', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  let modelCalls = 0;
  const sentRequests = [];
  let invalidQuote = false;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, options);
    modelCalls++;
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const request = JSON.parse(options.body);
    sentRequests.push(request);
    assert.equal(request.store, false);
    const source = passages.find((passage) => request.input.includes(passage));
    assert.ok(source);
    const result = request.text.format.name === 'study_session'
      ? { overview: 'A short overview of the source material.', questions: [1, 2, 3].map((n) => ({ text: `Explain idea ${n}.`, sourceQuote: source.split('. ')[n - 1] + '.' })) }
      : { level: 'supported', feedback: 'Your answer explains the cited idea.', sourceQuote: invalidQuote ? 'An unsupported source quote.' : source.split('. ')[0] + '.' };
    const usage = { input_tokens: 200, input_tokens_details: { cached_tokens: 0 }, output_tokens: 100, total_tokens: 300 };
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-4o-mini-2024-07-18', usage,
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), { status: 200 });
  };
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const base = `http://localhost:${server.address().port}`;
    for (const source of passages) {
      const start = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }) });
      assert.equal(start.status, 200);
      const session = await start.json();
      assert.deepEqual(session.apiRequest, sentRequests.at(-1));
      assert.equal(session.usage.total_tokens, 300);
      assert.equal(session.estimatedCostUsd, 0.00009);
      assert.ok(session.apiRequest.instructions.includes('active-recall'));
      assert.ok(session.apiRequest.instructions.includes('main ideas'));
      assert.ok(!JSON.stringify(session.apiRequest).includes('test-key'));
      assert.equal(session.questions.length, 3);
      assert.ok(session.overview.length > 30);
      for (const question of session.questions) assert.ok(source.includes(question.sourceQuote));

      const question = session.questions[0];
      const answer = await fetch(`${base}/api/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, question: question.text, sourceQuote: question.sourceQuote, answer: question.sourceQuote }) });
      assert.equal(answer.status, 200);
      const feedback = await answer.json();
      assert.deepEqual(feedback.apiRequest, sentRequests.at(-1));
      assert.equal(feedback.estimatedCostUsd, 0.00009);
      assert.ok(feedback.apiRequest.input.includes(question.text));
      assert.equal(feedback.level, 'supported');
      assert.ok(source.includes(feedback.sourceQuote));
    }
    invalidQuote = true;
    const rejected = await fetch(`${base}/api/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: passages[0], question: 'Why?', sourceQuote: passages[0].split('. ')[0] + '.', answer: 'Because water gains energy.' }) });
    assert.equal(rejected.status, 422);
    const rejectedBody = await rejected.json();
    assert.match(rejectedBody.error, /reference/);
    assert.equal(rejectedBody.estimatedCostUsd, 0.00009);
    assert.equal(rejectedBody.usage.total_tokens, 300);
    assert.equal(modelCalls, passages.length * 2 + 1);
  } finally {
    server.close();
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test('cost estimate uses cached-token rate and avoids guessing for other models', () => {
  const usage = { input_tokens: 200, input_tokens_details: { cached_tokens: 50 }, output_tokens: 100 };
  assert.equal(estimateCost('gpt-4o-mini', usage), 0.00008625);
  assert.equal(estimateCost('another-model', usage), null);
  assert.equal(estimateCost('gpt-4o-mini', null), null);
});

test('unsupported model citations are rejected', () => {
  assert.throws(() => checkSession(passages[0], { overview: 'Overview', questions: Array.from({ length: 3 }, () => ({ text: 'Why?', sourceQuote: 'This statement is not in the source passage.' })) }), /reference/);
});

test('quiz validation checks answer options and source block IDs', () => {
  const question = { text: 'Which is true?', optionA: 'One', optionB: 'Two',
    optionC: 'Three', optionD: 'Four', correctOption: 'A',
    explanation: 'The source supports one.', sourceId: 1 };
  const valid = { overview: 'Overview', question1: question, question2: question, question3: question };
  assert.equal(checkQuiz(passages[0], valid).questions.length, 3);
  assert.ok(passages[0].replace(/\s+/g, ' ').includes(checkQuiz(passages[0], valid).questions[0].sourceQuote));
  assert.throws(() => checkQuiz(passages[0], { ...valid, question1: { ...question,
    optionB: 'one' } }), /quiz question/);
  assert.throws(() => checkQuiz(passages[0], { ...valid, question1: { ...question,
    sourceId: 99 } }), /quiz question/);
  assert.equal(sourceChunks('a'.repeat(430)).join(''), 'a'.repeat(430));
});
