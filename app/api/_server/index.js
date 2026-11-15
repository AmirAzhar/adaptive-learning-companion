import { json } from './http.js';
import { handleSpaces } from './routes/spaces.js';
import { handleQuizzes } from './routes/quizzes.js';
import { handleFlashcards } from './routes/flashcards.js';
import { handleLegacy } from './routes/legacy.js';

export async function handleRequest(request) {
  try {
    for (const handler of [handleSpaces, handleQuizzes, handleFlashcards, handleLegacy]) {
      const response = await handler(request);
      if (response) return response;
    }
    return json(404, { error: 'Not found.' });
  } catch (error) {
    return json(error.message?.startsWith('Model request') || error.name === 'TimeoutError' ? 502 : 400,
      { error: error.name === 'TimeoutError' ? 'The model timed out. Please retry.' : error.message || 'Something went wrong.' });
  }
}
