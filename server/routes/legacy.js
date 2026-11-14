import { checkSource, checkSession, checkFeedback, checkQuote } from '../study.js';
import { generateSession, gradeAnswer } from '../model.js';
import { body, modelResult } from '../http.js';

export async function handleLegacy(request, response) {
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
  return false;
}
