import { randomUUID } from 'node:crypto';
import { checkQuiz, checkFeedback, generationDocuments } from '../study.js';
import { generateQuiz, gradeAnswer } from '../model.js';
import { findSpace, readSpaces, updateSpaces } from '../store.js';
import { body, json, modelResult } from '../http.js';

function requireActive(space) {
  if (space.archivedAt) throw new Error('Restore this study space before making changes.');
  return space;
}

function quizRound(run) {
  const number = run.currentRound ?? 1;
  const questionIds = run.practiceQuestionIds ?? run.questions.map((question) => question.id);
  const attempts = run.attempts.filter((attempt) => (attempt.round ?? 1) === number);
  return { number, questionIds, attempts };
}

export async function handleQuizzes(request) {
  const pathname = new URL(request.url).pathname;
  const runRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs$/.exec(pathname);
  if (request.method === 'POST' && runRoute) {
    const input = await body(request);
    const space = requireActive(findSpace(await readSpaces(), runRoute[1]));
    const documents = generationDocuments(space, input);
    const source = input.documentId ? documents[0].text : documents;
    const generated = await generateQuiz(source);
    return await modelResult(generated, (output) => checkQuiz(source, output), async (result) => {
      const run = { id: randomUUID(), ...(input.documentId ? { documentId: input.documentId } : { documentIds: documents.map((document) => document.id) }), type: 'quiz',
        createdAt: new Date().toISOString(), ...result, attempts: [], currentRound: 1,
        practiceQuestionIds: result.questions.map((question) => question.id) };
      await updateSpaces((spaces) => {
        const current = requireActive(findSpace(spaces, runRoute[1]));
        current.runs.push(run);
        current.updatedAt = run.createdAt;
      });
      result.id = run.id;
    });
  }
  const answerRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs\/([a-f0-9-]+)\/answers$/.exec(pathname);
  if (request.method === 'POST' && answerRoute) {
    const input = await body(request);
    const space = requireActive(findSpace(await readSpaces(), answerRoute[1]));
    const run = space.runs.find((item) => item.id === answerRoute[2]);
    if (!run) throw new Error('Study session not found.');
    const question = run.questions.find((item) => item.id === input.questionId);
    if (!question) throw new Error('Question not found.');
    if (run.type === 'quiz') {
      if (!Number.isInteger(input.optionIndex) || input.optionIndex < 0 || input.optionIndex >= question.options.length)
        throw new Error('Choose one of the answer options.');
      let attempt;
      await updateSpaces((spaces) => {
        const current = requireActive(findSpace(spaces, answerRoute[1]));
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
      return json(200, { ...attempt, correctIndex: question.correctIndex,
        explanation: question.explanation, sourceQuote: question.sourceQuote });
    }
    if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 2000)
      throw new Error('Write an answer under 2,000 characters.');
    const document = space.documents.find((item) => item.id === run.documentId);
    if (!document) throw new Error('Document not found.');
    const generated = await gradeAnswer(document.text, question.text, input.answer.trim());
    return await modelResult(generated, (output) => checkFeedback(document.text, output), async (result) => {
      const attempt = { id: randomUUID(), questionId: question.id, answer: input.answer.trim(),
        createdAt: new Date().toISOString(), ...result };
      await updateSpaces((spaces) => {
        const current = requireActive(findSpace(spaces, answerRoute[1]));
        const savedRun = current.runs.find((item) => item.id === answerRoute[2]);
        savedRun.attempts.push(attempt);
        current.updatedAt = attempt.createdAt;
      });
      result.id = attempt.id;
    });
  }
  const practiceRoute = /^\/api\/spaces\/([a-f0-9-]+)\/runs\/([a-f0-9-]+)\/practice$/.exec(pathname);
  if (request.method === 'POST' && practiceRoute) {
    let result;
    await updateSpaces((spaces) => {
      const space = requireActive(findSpace(spaces, practiceRoute[1]));
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
    return json(200, result);
  }
  return null;
}
