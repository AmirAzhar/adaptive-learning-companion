import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkSource, checkSession, checkQuiz, checkFlashcards, checkFeedback, checkQuote } from './study.js';
import { generateSession, generateQuiz, generateFlashcards, gradeAnswer } from './model.js';
import { findSpace, readSpaces, updateSpaces } from './store.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const port = Number(process.env.PORT || 3000);

function quizRound(run) {
  const number = run.currentRound ?? 1;
  const questionIds = run.practiceQuestionIds ?? run.questions.map((question) => question.id);
  const attempts = run.attempts.filter((attempt) => (attempt.round ?? 1) === number);
  return { number, questionIds, attempts };
}

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
      return json(response, 200, { spaces: spaces.map(({ id, title, updatedAt, documents, runs, decks }) =>
        ({ id, title, updatedAt, documentCount: documents.length, runCount: runs.length, deckCount: (decks ?? []).length })) });
    }
    if (request.method === 'POST' && request.url === '/api/spaces') {
      const input = await body(request);
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      if (!title || title.length > 80) throw new Error('Name your study space in 80 characters or fewer.');
      const now = new Date().toISOString();
      const space = { id: randomUUID(), title, createdAt: now, updatedAt: now, documents: [], runs: [], decks: [] };
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
      const generated = await generateQuiz(document.text);
      return await modelResult(response, generated, (output) => checkQuiz(document.text, output), async (result) => {
        const run = { id: randomUUID(), documentId: document.id, type: 'quiz',
          createdAt: new Date().toISOString(), ...result, attempts: [], currentRound: 1,
          practiceQuestionIds: result.questions.map((question) => question.id) };
        await updateSpaces((spaces) => {
          const current = findSpace(spaces, runRoute[1]);
          current.runs.push(run);
          current.updatedAt = run.createdAt;
        });
        result.id = run.id;
      });
    }
    const deckRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks$/.exec(request.url);
    if (request.method === 'POST' && deckRoute) {
      const input = await body(request);
      const space = findSpace(await readSpaces(), deckRoute[1]);
      const document = space.documents.find((item) => item.id === input.documentId);
      if (!document) throw new Error('Document not found.');
      const generated = await generateFlashcards(document.text);
      return await modelResult(response, generated, (output) => checkFlashcards(document.text, output), async (result) => {
        const deck = { id: randomUUID(), documentId: document.id, createdAt: new Date().toISOString(),
          ...result, reviews: [], currentRound: 1, reviewCardIds: result.cards.map((card) => card.id) };
        await updateSpaces((spaces) => {
          const current = findSpace(spaces, deckRoute[1]);
          (current.decks ??= []).push(deck);
          current.updatedAt = deck.createdAt;
        });
        result.id = deck.id;
      });
    }
    const cardEditRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/cards\/([1-5])$/.exec(request.url);
    if (request.method === 'POST' && cardEditRoute) {
      const input = await body(request);
      const front = typeof input.front === 'string' ? input.front.trim() : '';
      const back = typeof input.back === 'string' ? input.back.trim() : '';
      if (!front || front.length > 500 || !back || back.length > 2000)
        throw new Error('Write a question under 500 characters and an answer under 2,000 characters.');
      await updateSpaces((spaces) => {
        const space = findSpace(spaces, cardEditRoute[1]);
        const deck = (space.decks ?? []).find((item) => item.id === cardEditRoute[2]);
        const card = deck?.cards.find((item) => item.id === Number(cardEditRoute[3]));
        if (!card) throw new Error('Flashcard not found.');
        if (deck.cards.some((item) => item.id !== card.id && item.front.toLowerCase() === front.toLowerCase()))
          throw new Error('A flashcard already has that question.');
        card.front = front;
        card.back = back;
        space.updatedAt = new Date().toISOString();
      });
      return json(response, 200, { saved: true });
    }
    const cardReviewRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/cards\/([1-5])\/reviews$/.exec(request.url);
    if (request.method === 'POST' && cardReviewRoute) {
      const input = await body(request);
      if (!['again', 'good'].includes(input.rating)) throw new Error('Choose Again or Good.');
      let review;
      await updateSpaces((spaces) => {
        const space = findSpace(spaces, cardReviewRoute[1]);
        const deck = (space.decks ?? []).find((item) => item.id === cardReviewRoute[2]);
        const cardId = Number(cardReviewRoute[3]);
        if (!deck || !deck.reviewCardIds.includes(cardId)) throw new Error('Flashcard not found in this review round.');
        if (deck.reviews.some((item) => item.round === deck.currentRound && item.cardId === cardId))
          throw new Error('This flashcard is complete in the current round.');
        review = { id: randomUUID(), cardId, rating: input.rating,
          round: deck.currentRound, createdAt: new Date().toISOString() };
        deck.reviews.push(review);
        space.updatedAt = review.createdAt;
      });
      return json(response, 200, review);
    }
    const reviewRoundRoute = /^\/api\/spaces\/([a-f0-9-]+)\/decks\/([a-f0-9-]+)\/review$/.exec(request.url);
    if (request.method === 'POST' && reviewRoundRoute) {
      const input = await body(request);
      if (!['again', 'all'].includes(input.scope)) throw new Error('Choose cards to review.');
      let result;
      await updateSpaces((spaces) => {
        const space = findSpace(spaces, reviewRoundRoute[1]);
        const deck = (space.decks ?? []).find((item) => item.id === reviewRoundRoute[2]);
        if (!deck) throw new Error('Flashcard deck not found.');
        const current = deck.reviewCardIds.map((cardId) =>
          deck.reviews.find((item) => item.round === deck.currentRound && item.cardId === cardId));
        if (current.some((item) => !item)) throw new Error('Finish this review round first.');
        const cardIds = input.scope === 'all' ? deck.cards.map((card) => card.id) :
          current.filter((item) => item.rating === 'again').map((item) => item.cardId);
        if (!cardIds.length) throw new Error('There are no Again cards to review.');
        deck.currentRound++;
        deck.reviewCardIds = cardIds;
        space.updatedAt = new Date().toISOString();
        result = { currentRound: deck.currentRound, cardIds };
      });
      return json(response, 200, result);
    }
    const answerRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs\/([a-f0-9-]+)\/answers$/.exec(request.url);
    if (request.method === 'POST' && answerRoute) {
      const input = await body(request);
      const space = findSpace(await readSpaces(), answerRoute[1]);
      const run = space.runs.find((item) => item.id === answerRoute[2]);
      if (!run) throw new Error('Study session not found.');
      const document = space.documents.find((item) => item.id === run.documentId);
      if (!document) throw new Error('Document not found.');
      const question = run.questions.find((item) => item.id === input.questionId);
      if (!question) throw new Error('Question not found.');
      if (run.type === 'quiz') {
        if (!Number.isInteger(input.optionIndex) || input.optionIndex < 0 || input.optionIndex >= question.options.length)
          throw new Error('Choose one of the answer options.');
        let attempt;
        await updateSpaces((spaces) => {
          const current = findSpace(spaces, answerRoute[1]);
          const savedRun = current.runs.find((item) => item.id === answerRoute[2]);
          const round = quizRound(savedRun);
          if (!round.questionIds.includes(question.id)) throw new Error('This question is not in the current practice round.');
          if (round.attempts.some((item) => item.questionId === question.id))
            throw new Error('This question is complete. Practice missed questions after the round.');
          attempt = { id: randomUUID(), questionId: question.id, optionIndex: input.optionIndex,
            correct: input.optionIndex === question.correctIndex, round: round.number,
            createdAt: new Date().toISOString() };
          savedRun.attempts.push(attempt);
          current.updatedAt = attempt.createdAt;
        });
        return json(response, 200, { ...attempt, correctIndex: question.correctIndex,
          explanation: question.explanation, sourceQuote: question.sourceQuote });
      }
      if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 2000)
        throw new Error('Write an answer under 2,000 characters.');
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
    const practiceRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs\/([a-f0-9-]+)\/practice$/.exec(request.url);
    if (request.method === 'POST' && practiceRoute) {
      let result;
      await updateSpaces((spaces) => {
        const space = findSpace(spaces, practiceRoute[1]);
        const run = space.runs.find((item) => item.id === practiceRoute[2]);
        if (!run || run.type !== 'quiz') throw new Error('Quiz not found.');
        const round = quizRound(run);
        const latest = round.questionIds.map((questionId) =>
          [...round.attempts].reverse().find((attempt) => attempt.questionId === questionId));
        if (latest.some((attempt) => !attempt)) throw new Error('Finish this round before practicing missed questions.');
        const missed = round.questionIds.filter((_, index) => !latest[index].correct);
        if (!missed.length) throw new Error('There are no missed questions to practice.');
        run.currentRound = round.number + 1;
        run.practiceQuestionIds = missed;
        space.updatedAt = new Date().toISOString();
        result = { currentRound: run.currentRound, questionIds: missed };
      });
      return json(response, 200, result);
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
