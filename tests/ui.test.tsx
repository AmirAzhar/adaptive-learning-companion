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
  Node: dom.window.Node,
  Element: dom.window.Element,
  ShadowRoot: dom.window.ShadowRoot,
  DocumentFragment: dom.window.DocumentFragment,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  HTMLDialogElement: dom.window.HTMLDialogElement,
  MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { render, screen, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react');
const { default: StudyApp } = await import('../app/_study/study-app');

const source = { id: 'doc-1', name: 'notes.txt', text: 'A database index helps queries find rows faster. '.repeat(5), createdAt: '2026-01-01T00:00:00Z' };
function fixture(): Space {
  return {
    id: 'space-1', title: 'Databases', documents: [{ ...source }],
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
    if (path === '/api/spaces' && !init?.method) return respond({ spaces: [{ id: space.id, title: space.title, documentCount: space.documents.length, runCount: space.runs.length, deckCount: space.decks?.length ?? 0, archivedAt: space.archivedAt ?? null }] });
    if (path === `/api/spaces/${space.id}` && !init?.method) return respond({ space: structuredClone(space) });
    if (path.startsWith(`/api/spaces/${space.id}/documents/`) && init?.method === 'PATCH') {
      const target = space.documents.find(item => item.id === path.split('/').at(-1))!;
      target.removedAt = JSON.parse(String(init.body)).removed ? new Date().toISOString() : null;
      return respond({ document: target });
    }
    if (path.startsWith(`/api/spaces/${space.id}/documents/`) && init?.method === 'DELETE') {
      const id = path.split('/').at(-1);
      space.documents = space.documents.filter(item => item.id !== id);
      space.runs = space.runs.filter(run => run.documentId !== id);
      space.decks = space.decks!.filter(deck => deck.documentId !== id);
      return respond({ deleted: true });
    }
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

test('opening a space starts on main ideas and switches to quiz and flashcard practice', async () => {
  const space = fixture(); mockApi(space);
  render(<StudyApp />);
  await screen.findByRole('heading', { name: 'Study spaces' });
  fireEvent.click(await screen.findByRole('button', { name: /^Databases.*document$/ }));
  assert.equal((await screen.findByRole('button', { name: 'Main ideas' })).getAttribute('aria-pressed'), 'true');
  const summaryPane = screen.getByRole('region', { name: 'Main ideas' });
  assert.ok(summaryPane.classList.contains('study-pane'));
  assert.ok(summaryPane.querySelector('.study-pane-heading'));
  assert.ok(screen.getByRole('button', { name: 'Generate main ideas' }));
  assert.equal(screen.queryByRole('region', { name: 'Quiz practice' }), null);
  fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
  await screen.findByText(/What does an index help\?/);
  assert.equal(screen.queryByRole('region', { name: 'Main ideas' }), null);
  assert.equal(window.location.hash, '#space-1');
  assert.equal(screen.queryByRole('heading', { name: 'Documents (1)' }), null);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
  fireEvent.click(screen.getByRole('radio', { name: 'Find rows' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
  await screen.findByText('Correct answer: Find rows');
  assert.equal(space.runs[0].attempts.length, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  fireEvent.click(screen.getByText('Edit 1 cards and check sources'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Answer' }), { target: { value: 'A searchable index' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save card' }));
  await screen.findByText('Saved');
  fireEvent.click(screen.getByRole('button', { name: 'Reveal answer' }));
  await waitFor(() => assert.equal(document.querySelector('.card-answer')?.textContent, 'A searchable index'));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await screen.findByText('1 Good · 0 Again');
  assert.equal(space.decks![0].reviews.length, 1);
  cleanup();
  window.history.replaceState(null, '', '/');
});

test('a failed quiz generation keeps the saved flashcard deck and shows request details', async () => {
  const space = fixture();
  space.documents.push({ id: 'doc-2', name: 'transactions.txt', text: 'A transaction groups related changes. '.repeat(5), createdAt: '2026-01-02T00:00:00Z' });
  const deck = space.decks![0];
  space.runs = []; space.decks = [];
  const generationBodies: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path === '/api/spaces' && !init?.method) return respond({ spaces: [{ id: space.id, title: space.title, documentCount: 1 }] });
    if (path === `/api/spaces/${space.id}` && !init?.method) return respond({ space: structuredClone(space) });
    if (path.endsWith('/runs')) { generationBodies.push(JSON.parse(String(init?.body))); return respond({ error: 'Quiz needs a retry.', apiRequest: { model: 'mock-model' }, estimatedCostUsd: null }, 422); }
    if (path.endsWith('/decks')) { generationBodies.push(JSON.parse(String(init?.body))); space.decks!.push(deck); return respond({ saved: true }); }
    if (path.endsWith('/summary')) { generationBodies.push(JSON.parse(String(init?.body))); space.summary = { createdAt: '2026-01-03T00:00:00Z', documentIds: space.documents.map(document => document.id), overview: 'Indexes and transactions organize database work.', sections: space.documents.map(document => ({ documentId: document.id, ideas: [{ text: `An idea from ${document.name}`, sourceQuote: document.text.slice(0, 30) }] })) }; return respond({ saved: true }); }
    throw new Error(`Unexpected request: ${path}`);
  };
  render(<StudyApp />);
  fireEvent.click(await screen.findByRole('button', { name: /^Databases.*document$/ }));
  await waitFor(() => assert.equal(window.location.hash, '#space-1'));
  assert.equal(document.querySelector('#document-switch'), null);
  await screen.findByRole('button', { name: 'Generate quiz and flashcards' });
  fireEvent.click(screen.getByRole('button', { name: 'Generate quiz and flashcards' }));
  await screen.findByText(/Saved flashcards.*quiz failed/);
  assert.deepEqual(generationBodies, [{}, {}, {}]);
  const mainIdeas = screen.getByRole('region', { name: 'Main ideas' });
  assert.ok(mainIdeas.textContent?.includes('Indexes and transactions organize database work.'));
  assert.ok(mainIdeas.querySelector('.study-pane-heading'));
  assert.ok(screen.getByRole('button', { name: 'Refresh main ideas' }));
  assert.ok(screen.getByRole('button', { name: 'Main ideas' }).compareDocumentPosition(mainIdeas) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(space.decks!.length, 1);
  assert.ok(screen.getByText('quiz: Quiz needs a retry.'));
  assert.ok(screen.getByText('View API request · cost unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh main ideas' }));
  await waitFor(() => assert.equal(generationBodies.length, 4));
  fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
  await screen.findByRole('button', { name: 'Reveal answer' });
  cleanup();
  window.history.replaceState(null, '', '/');
});

test('sources are optional within the space workspace', async () => {
  const space = fixture(); mockApi(space);
  try {
    render(<StudyApp />);
    const spaceSearch = await screen.findByRole('textbox', { name: 'Find a space' });
    fireEvent.change(spaceSearch, { target: { value: 'missing' } });
    await screen.findByText('No spaces match your search.');
    fireEvent.change(spaceSearch, { target: { value: 'data' } });
    fireEvent.click(screen.getByRole('button', { name: /^Databases.*document$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    await screen.findByText(/What does an index help\?/);
    assert.equal(screen.queryByRole('button', { name: /notes.txt/ }), null);
    fireEvent.click(screen.getByRole('button', { name: 'Sources (1)' }));
    await screen.findByRole('heading', { name: 'Sources' });
    assert.equal(document.querySelector('main #sources-panel'), null);
    assert.ok(screen.getByText('notes.txt'));
    assert.equal(screen.queryByRole('button', { name: /notes.txt/ }), null);
    assert.equal(screen.queryByText(/A database index helps queries find rows faster\./), null);
    assert.equal(window.location.hash, '#space-1');
    assert.ok(screen.getByRole('button', { name: 'Close sources' }));
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});

test('removing a source clears the limit without losing saved material; permanent deletion confirms its impact', async () => {
  const space = fixture();
  space.documents[0].text += 'x'.repeat(8000);
  for (let index = 2; index <= 7; index++) space.documents.push({ id: `doc-${index}`, name: `source-${index}.txt`, text: 'x'.repeat(5500), createdAt: '2026-01-01T00:00:00Z' });
  mockApi(space);
  try {
    render(<StudyApp />);
    fireEvent.click(await screen.findByRole('button', { name: /^Databases.*documents$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sources (7)' }));
    assert.ok(await screen.findByText(/All active sources exceed the 40,000-character limit/));
    const row = screen.getByText('notes.txt').closest('.source-row')!;
    fireEvent.click(row.querySelector('button')!);
    await waitFor(() => assert.equal(space.documents[0].removedAt != null, true));
    await waitFor(() => assert.equal(screen.queryByText(/All active sources exceed the 40,000-character limit/), null));
    assert.equal(space.runs.length, 1);
    assert.equal(space.decks!.length, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Show removed sources (1)' }));
    const removedRow = screen.getByText('notes.txt').closest('.source-row')!;
    fireEvent.click(removedRow.querySelector('button:last-child')!);
    assert.ok(await screen.findByText(/This also deletes 1 quiz and 1 deck/));
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => assert.equal(space.documents.some(item => item.id === 'doc-1'), false));
    assert.equal(space.runs.length, 0);
    assert.equal(space.decks!.length, 0);
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});

test('more than six documents can generate when total characters stay within the limit', async () => {
  const space = fixture(); mockApi(space);
  for (let index = 2; index <= 7; index++) space.documents.push({ id: `doc-${index}`, name: `source-${index}.txt`, text: 'A useful source sentence. '.repeat(5), createdAt: '2026-01-01T00:00:00Z' });
  try {
    render(<StudyApp />);
    fireEvent.click(await screen.findByRole('button', { name: /^Databases.*documents$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    assert.equal((await screen.findByRole('button', { name: 'New quiz' })).hasAttribute('disabled'), false);
    fireEvent.click(screen.getByRole('button', { name: 'Sources (7)' }));
    assert.ok(await screen.findByText(/7 active documents/));
    assert.equal(screen.queryByRole('alert'), null);
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});

test('source count limits disable only formats that cannot cover the selection', async () => {
  const space = fixture(); mockApi(space);
  for (let index = 2; index <= 11; index++) space.documents.push({ id: `doc-${index}`, name: `source-${index}.txt`, text: 'A useful source sentence. '.repeat(5), createdAt: '2026-01-01T00:00:00Z' });
  try {
    render(<StudyApp />);
    fireEvent.click(await screen.findByRole('button', { name: /^Databases.*documents$/ }));
    assert.ok(await screen.findByText(/A quiz can cover at most 10 sources/));
    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    assert.equal(screen.getByRole('button', { name: 'New quiz' }).hasAttribute('disabled'), true);
    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    assert.equal(screen.getByRole('button', { name: 'New deck' }).hasAttribute('disabled'), false);
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});

test('generation uses all active sources and shows saved coverage', async () => {
  const space = fixture();
  space.documents.push({ id: 'doc-2', name: 'transactions.txt', text: 'A transaction groups related changes. '.repeat(5), createdAt: '2026-01-02T00:00:00Z' });
  const run = space.runs[0] as QuizRun;
  space.runs = [{ ...run, documentId: undefined, documentIds: ['doc-1', 'doc-2'],
    questions: [{ ...run.questions[0], documentId: 'doc-1' }] }];
  mockApi(space);
  const originalFetch = globalThis.fetch;
  const generationBodies: unknown[] = [];
  const deckBodies: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/runs') && init?.method === 'POST') {
      generationBodies.push(JSON.parse(String(init.body)));
      return respond({ saved: true });
    }
    if (String(input).endsWith('/decks') && init?.method === 'POST') {
      deckBodies.push(JSON.parse(String(init.body)));
      return respond({ saved: true });
    }
    return originalFetch(input, init);
  };
  try {
    render(<StudyApp />);
    fireEvent.click(await screen.findByRole('button', { name: /^Databases.*documents$/ }));
    const sourcesButton = await screen.findByRole('button', { name: 'Sources (2)' });
    assert.ok(sourcesButton.closest('.workspace-title-row'));
    assert.equal(screen.queryByRole('button', { name: /Choose sources/ }), null);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    assert.ok(await screen.findByText(/Questions cover 1 of 2 selected sources.*Not covered: transactions.txt/));
    fireEvent.click(screen.getByRole('button', { name: 'New quiz' }));
    await waitFor(() => assert.deepEqual(generationBodies, [{}]));
    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    assert.equal(screen.queryByRole('button', { name: 'New quiz' }), null);
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'New deck' }).hasAttribute('disabled'), false));
    fireEvent.click(screen.getByRole('button', { name: 'New deck' }));
    await waitFor(() => assert.deepEqual(deckBodies, [{}]));
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});

test('archived spaces are listed without an open action', async () => {
  const space = fixture(); space.archivedAt = '2026-01-03T00:00:00Z'; mockApi(space);
  try {
    render(<StudyApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archived spaces (1)' }));
    assert.ok(screen.getByText('Databases'));
    assert.equal(screen.queryByRole('button', { name: /^Databases.*document$/ }), null);
    assert.equal(window.location.hash, '');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Databases' }));
    assert.ok(await screen.findByRole('menuitem', { name: 'Restore' }));
  } finally {
    cleanup();
    window.history.replaceState(null, '', '/');
  }
});
