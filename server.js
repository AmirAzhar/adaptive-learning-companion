import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkSource, checkSession, checkFeedback, checkQuote } from './study.js';
import { generateSession, gradeAnswer } from './model.js';
import { findSpace, readSpaces, updateSpaces } from './store.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const port = Number(process.env.PORT || 3000);

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function body(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 80000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(raw); } catch { throw new Error('Invalid request.'); }
}

async function modelResult(response, generated, validate, save = async () => {}) {
  const { output, requestBody, usage, estimatedCostUsd } = generated;
  const details = { apiRequest: requestBody, usage, estimatedCostUsd };
  let checked;
  try { checked = validate(output); }
  catch (error) { json(response, 422, { error: error.message, ...details }); }
  if (!checked) return;
  const result = { ...checked, ...details };
  await save(result);
  json(response, 200, result);
}

export const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/spaces') {
      const spaces = await readSpaces();
      return json(response, 200, { spaces: spaces.map(({ id, title, updatedAt, documents, runs }) =>
        ({ id, title, updatedAt, documentCount: documents.length, runCount: runs.length })) });
    }
    if (request.method === 'POST' && request.url === '/api/spaces') {
      const input = await body(request);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title || title.length > 80) throw new Error('Name your study space in 80 characters or fewer.');
      const now = new Date().toISOString();
      const space = { id: randomUUID(), title, createdAt: now, updatedAt: now, documents: [], runs: [] };
      await updateSpaces((spaces) => spaces.push(space));
      return json(response, 201, { space });
    }
    const spaceRoute = /^\/api\/spaces\/([a-f0-9-]+)$/.exec(request.url);
    if (request.method === 'GET' && spaceRoute) {
      return json(response, 200, { space: findSpace(await readSpaces(), spaceRoute[1]) });
    }
    const documentRoute = /^\/api\/spaces\/([a-f0-9-]+)\/documents$/.exec(request.url);
    if (request.method === 'POST' && documentRoute) {
      const input = await body(request);
      const name = typeof input.name === 'string' ? path.win32.basename(input.name.trim()) : '';
      if (!name || name.length > 120 || !/\.(txt|md)$/i.test(name)) throw new Error('Choose a .txt or .md document.');
      const text = checkSource(input.text);
      const document = { id: randomUUID(), name, text, createdAt: new Date().toISOString() };
      await updateSpaces((spaces) => {
        const space = findSpace(spaces, documentRoute[1]);
        space.documents.push(document);
        space.updatedAt = document.createdAt;
      });
      return json(response, 201, { document });
    }
    const runRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs$/.exec(request.url);
    if (request.method === 'POST' && runRoute) {
      const input = await body(request);
      const space = findSpace(await readSpaces(), runRoute[1]);
      const document = space.documents.find((item) => item.id === input.documentId);
      if (!document) throw new Error('Document not found.');
      const generated = await generateSession(document.text);
      return await modelResult(response, generated, (output) => checkSession(document.text, output), async (result) => {
        const run = { id: randomUUID(), documentId: document.id,
          createdAt: new Date().toISOString(), ...result, attempts: [] };
        await updateSpaces((spaces) => {
          const current = findSpace(spaces, runRoute[1]);
          current.runs.push(run);
          current.updatedAt = run.createdAt;
        });
        result.id = run.id;
      });
    }
    const answerRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs\/([a-f0-9-]+)\/answers$/.exec(request.url);
    if (request.method === 'POST' && answerRoute) {
      const input = await body(request);
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 2000)
        throw new Error('Write an answer under 2,000 characters.');
      const space = findSpace(await readSpaces(), answerRoute[1]);
      const run = space.runs.find((item) => item.id === answerRoute[2]);
      if (!run) throw new Error('Study session not found.');
      const document = space.documents.find((item) => item.id === run.documentId);
      if (!document) throw new Error('Document not found.');
      const question = run.questions.find((item) => item.id === input.questionId);
      if (!question) throw new Error('Question not found.');
      const generated = await gradeAnswer(document.text, question.text, input.answer.trim());
      return await modelResult(response, generated, (output) => checkFeedback(document.text, output), async (result) => {
        const attempt = { id: randomUUID(), questionId: question.id, answer: input.answer.trim(),
          createdAt: new Date().toISOString(), ...result };
        await updateSpaces((spaces) => {
          const current = findSpace(spaces, answerRoute[1]);
          const savedRun = current.runs.find((item) => item.id === answerRoute[2]);
          savedRun.attempts.push(attempt);
          current.updatedAt = attempt.createdAt;
        });
        result.id = attempt.id;
      });
    }
    if (request.method === 'POST' && request.url === '/api/session') {
      const input = await body(request);
      const source = checkSource(input.source);
      return await modelResult(response, await generateSession(source), (output) => checkSession(source, output));
    }
    if (request.method === 'POST' && request.url === '/api/answer') {
      const input = await body(request);
      const source = checkSource(input.source);
      if (typeof input.question !== 'string' || input.question.length > 500 || !input.question.trim()) throw new Error('Question is missing.');
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 2000) throw new Error('Write an answer under 2,000 characters.');
      checkQuote(source, input.sourceQuote);
      return await modelResult(response, await gradeAnswer(source, input.question, input.answer), (output) => checkFeedback(source, output));
    }
    if (request.method === 'GET' && files[request.url]) {
      const [name, type] = files[request.url];
      response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return response.end(await readFile(path.join(publicDir, name)));
    }
    json(response, 404, { error: 'Not found.' });
  } catch (error) {
    json(response, error.message?.startsWith('Model request') || error.name === 'TimeoutError' ? 502 : 400,
      { error: error.name === 'TimeoutError' ? 'The model timed out. Please retry.' : error.message || 'Something went wrong.' });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Set OPENAI_API_KEY in .env before starting the app.');
    process.exitCode = 1;
  } else {
    server.listen(port, '127.0.0.1', () => console.log(`Study app running at http://localhost:${port}`));
  }
}
