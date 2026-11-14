import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { json } from './http.js';
import { handleSpaces } from './routes/spaces.js';
import { handleQuizzes } from './routes/quizzes.js';
import { handleFlashcards } from './routes/flashcards.js';
import { handleLegacy } from './routes/legacy.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const port = Number(process.env.PORT || 3000);

export const server = http.createServer(async (request, response) => {
  try {
    if (await handleSpaces(request, response)) return;
    if (await handleQuizzes(request, response)) return;
    if (await handleFlashcards(request, response)) return;
    if (await handleLegacy(request, response)) return;
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
