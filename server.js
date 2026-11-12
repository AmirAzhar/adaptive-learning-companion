import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkSource, checkSession, checkFeedback, checkQuote } from './study.js';
import { generateSession, gradeAnswer } from './model.js';

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
    if (raw.length > 16000) throw new Error('Request is too large.');
  }
  try { return JSON.parse(raw); } catch { throw new Error('Invalid request.'); }
}

export const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/session') {
      const input = await body(request);
      const source = checkSource(input.source);
      if (!['summary', 'explanation'].includes(input.mode)) throw new Error('Choose summary or explanation.');
      const result = checkSession(source, await generateSession(source, input.mode));
      return json(response, 200, result);
    }
    if (request.method === 'POST' && request.url === '/api/answer') {
      const input = await body(request);
      const source = checkSource(input.source);
      if (typeof input.question !== 'string' || input.question.length > 500 || !input.question.trim()) throw new Error('Question is missing.');
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 2000) throw new Error('Write an answer under 2,000 characters.');
      checkQuote(source, input.sourceQuote);
      const result = checkFeedback(source, await gradeAnswer(source, input.question, input.answer));
      return json(response, 200, result);
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
