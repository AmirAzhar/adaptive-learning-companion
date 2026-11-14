import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import type { QuizRun, Space } from '../app/_study/types';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLDialogElement: dom.window.HTMLDialogElement,
  MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new dom.window.Event('close')); };

const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
const { default: StudyApp } = await import('../app/_study/study-app');

const source = { id: 'doc-1', name: 'notes.txt', text: 'A database index helps queries find rows faster. '.repeat(5), createdAt: '2026-01-01T00:00:00Z' };
function fixture(): Space {
  return {
    id: 'space-1', title: 'Databases', documents: [source],
    runs: [{ id: 'run-1', documentId: source.id, type: 'quiz', createdAt: '2026-01-01T00:00:00Z', overview: 'Indexes help reads.',
      questions: [{ id: 1, text: 'What does an index help?', options: ['Find rows', 'Remove rows', 'Write files', 'Delete data'], correctIndex: 0, explanation: 'It helps find rows.', sourceQuote: 'A database index helps queries find rows faster.' }],
      attempts: [], currentRound: 1, practiceQuestionIds: [1] }],
    decks: [{ id: 'deck-1', documentId: source.id, createdAt: '2026-01-01T00:00:00Z', cards: [{ id: 1, front: 'What helps queries?', back: 'An index', sourceQuote: 'A database index helps queries find rows faster.' }], reviews: [], currentRound: 1, reviewCardIds: [1] }],
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
function mockApi(space: Space) {
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/spaces' && !init?.method) return respond({ spaces: [{ id: space.id, title: space.title, documentCount: space.documents.length }] });
    if (path === `/api/spaces/${space.id}` && !init?.method) return respond({ space: structuredClone(space) });
    if (path.endsWith('/answers')) {
      const body = JSON.parse(String(init?.body));
      (space.runs[0] as QuizRun).attempts.push({ questionId: body.questionId, optionIndex: body.optionIndex, correct: body.optionIndex === 0, round: 1 });
      return respond({ saved: true });
    }
    if (path.endsWith('/cards/1')) {
      const body = JSON.parse(String(init?.body));
      space.decks![0].cards[0].front = body.front;
      space.decks![0].cards[0].back = body.back;
      return respond({ saved: true });
    }
    if (path.endsWith('/reviews')) {
      const body = JSON.parse(String(init?.body));
      space.decks![0].reviews.push({ cardId: 1, rating: body.rating, round: 1 });
      return respond({ saved: true });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
}

test('Next UI reopens a saved space and saves quiz and flashcard practice through the existing API', async () => {
  const space = fixture(); mockApi(space);
  render(<StudyApp />);
  await screen.findByText(/What does an index help\?/);
  assert.equal(window.location.hash, '#space-1');
  fireEvent.click(screen.getByRole('button', { name: 'Library' }));
  assert.equal(document.querySelector('dialog')?.hasAttribute('open'), true);
  fireEvent.click(screen.getByRole('button', { name: 'notes.txt' }));
  assert.equal(document.querySelector('dialog')?.hasAttribute('open'), false);
  fireEvent.click(screen.getByLabelText('Find rows'));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  await screen.findByText('Correct answer: Find rows');
  assert.equal(space.runs[0].attempts.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(screen.getByText('Edit 1 cards and check sources'));
  fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'A searchable index' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
  await screen.findByText('Saved');
  fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await waitFor(() => assert.equal(document.querySelector('.card-answer')?.textContent, 'A searchable index'));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await screen.findByText('1 Good · 0 Again');
  assert.equal(space.decks![0].reviews.length, 1);
  cleanup();
});

test('a failed quiz generation keeps the saved flashcard deck and shows request details', async () => {
  const space = fixture();
  const deck = space.decks![0];
  space.runs = []; space.decks = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/spaces' && !init?.method) return respond({ spaces: [{ id: space.id, title: space.title, documentCount: 1 }] });
    if (path === `/api/spaces/${space.id}` && !init?.method) return respond({ space: structuredClone(space) });
    if (path.endsWith('/runs')) return respond({ error: 'Quiz needs a retry.', apiRequest: { model: 'mock-model' }, estimatedCostUsd: null }, 422);
    if (path.endsWith('/decks')) { space.decks!.push(deck); return respond({ saved: true }); }
    throw new Error(`Unexpected request: ${path}`);
  };
  render(<StudyApp />);
  await screen.findByRole('button', { name: 'Generate quiz and flashcards' });
  fireEvent.click(screen.getByRole('button', { name: 'Generate quiz and flashcards' }));
  await screen.findByText(/Saved flashcards.*quiz failed/);
  assert.equal(space.decks!.length, 1);
  assert.ok(screen.getByText('quiz: Quiz needs a retry.'));
  assert.ok(screen.getByText('View API request · cost unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  await screen.findByRole('button', { name: 'Reveal answer' });
  cleanup();
});
