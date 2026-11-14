import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { json } from './http.js';
import { apiPort } from './config.js';
import { handleSpaces } from './routes/spaces.js';
import { handleQuizzes } from './routes/quizzes.js';
import { handleFlashcards } from './routes/flashcards.js';
import { handleLegacy } from './routes/legacy.js';

const port = Number(process.env.PORT || apiPort);

export const server = http.createServer(async (request, response) => {
  try {
    if (await handleSpaces(request, response)) return;
    if (await handleQuizzes(request, response)) return;
    if (await handleFlashcards(request, response)) return;
    if (await handleLegacy(request, response)) return;
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
