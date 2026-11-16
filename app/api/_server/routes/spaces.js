import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkSource } from '../study.js';
import { findSpace, readSpaces, updateSpaces } from '../store.js';
import { body, json } from '../http.js';

export async function handleSpaces(request) {
  const pathname = new URL(request.url).pathname;
  if (request.method === 'GET' && pathname === '/api/spaces') {
    const spaces = await readSpaces();
    return json(200, { spaces: spaces.map(({ id, title, updatedAt, archivedAt, documents, runs, decks }) =>
      ({ id, title, updatedAt, archivedAt: archivedAt ?? null, documentCount: documents.filter((document) => !document.removedAt).length,
        runCount: runs.length, deckCount: (decks ?? []).length })) });
  }
  if (request.method === 'POST' && pathname === '/api/spaces') {
    const input = await body(request);
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 80) throw new Error('Name your study space in 80 characters or fewer.');
    const now = new Date().toISOString();
    const space = { id: randomUUID(), title, createdAt: now, updatedAt: now, documents: [], runs: [], decks: [] };
    await updateSpaces((spaces) => spaces.push(space));
    return json(201, { space });
  }
  const spaceRoute = /^\/api\/spaces\/([a-f0-9-]+)$/.exec(pathname);
  if (request.method === 'GET' && spaceRoute) {
    return json(200, { space: findSpace(await readSpaces(), spaceRoute[1]) });
  }
  if (request.method === 'PATCH' && spaceRoute) {
    const input = await body(request);
    const rename = Object.hasOwn(input, 'title');
    const archive = Object.hasOwn(input, 'archived');
    if (rename === archive) throw new Error('Choose one study-space change.');
    const title = rename && typeof input.title === 'string' ? input.title.trim() : '';
    if (rename && (!title || title.length > 80)) throw new Error('Name your study space in 80 characters or fewer.');
    if (archive && typeof input.archived !== 'boolean') throw new Error('Choose whether to archive the study space.');
    let updated;
    await updateSpaces((spaces) => {
      const space = findSpace(spaces, spaceRoute[1]);
      const now = new Date().toISOString();
      if (rename) space.title = title;
      else space.archivedAt = input.archived ? now : null;
      space.updatedAt = now;
      updated = space;
    });
    return json(200, { space: updated });
  }
  if (request.method === 'DELETE' && spaceRoute) {
    await updateSpaces((spaces) => {
      const index = spaces.findIndex((space) => space.id === spaceRoute[1]);
      if (index < 0) throw new Error('Study space not found.');
      spaces.splice(index, 1);
    });
    return json(200, { deleted: true });
  }
  const documentRoute = /^\/api\/spaces\/([a-f0-9-]+)\/documents$/.exec(pathname);
  if (request.method === 'POST' && documentRoute) {
    const input = await body(request);
    const name = typeof input.name === 'string' ? path.win32.basename(input.name.trim()) : '';
    if (!name || name.length > 120 || !/\.(txt|md)$/i.test(name)) throw new Error('Choose a .txt or .md document.');
    const text = checkSource(input.text);
    const document = { id: randomUUID(), name, text, createdAt: new Date().toISOString() };
    await updateSpaces((spaces) => {
      const space = findSpace(spaces, documentRoute[1]);
      if (space.archivedAt) throw new Error('Restore this study space before making changes.');
      space.documents.push(document);
      space.updatedAt = document.createdAt;
    });
    return json(201, { document });
  }
  const documentItemRoute = /^\/api\/spaces\/([a-f0-9-]+)\/documents\/([a-f0-9-]+)$/.exec(pathname);
  if (request.method === 'PATCH' && documentItemRoute) {
    const input = await body(request);
    if (typeof input.removed !== 'boolean') throw new Error('Choose whether to remove the document from sources.');
    let updated;
    await updateSpaces((spaces) => {
      const space = findSpace(spaces, documentItemRoute[1]);
      if (space.archivedAt) throw new Error('Restore this study space before making changes.');
      const document = space.documents.find((item) => item.id === documentItemRoute[2]);
      if (!document) throw new Error('Document not found.');
      document.removedAt = input.removed ? new Date().toISOString() : null;
      space.updatedAt = new Date().toISOString();
      updated = document;
    });
    return json(200, { document: updated });
  }
  if (request.method === 'DELETE' && documentItemRoute) {
    let removed;
    await updateSpaces((spaces) => {
      const space = findSpace(spaces, documentItemRoute[1]);
      if (space.archivedAt) throw new Error('Restore this study space before making changes.');
      const index = space.documents.findIndex((document) => document.id === documentItemRoute[2]);
      if (index < 0) throw new Error('Document not found.');
      const documentId = documentItemRoute[2];
      space.documents.splice(index, 1);
      const usesDocument = (item) => item.documentId === documentId || item.documentIds?.includes(documentId);
      const runCount = space.runs.length;
      const deckCount = (space.decks ?? []).length;
      space.runs = space.runs.filter((run) => !usesDocument(run));
      space.decks = (space.decks ?? []).filter((deck) => !usesDocument(deck));
      space.updatedAt = new Date().toISOString();
      removed = { deleted: true, removedRuns: runCount - space.runs.length, removedDecks: deckCount - space.decks.length };
    });
    return json(200, removed);
  }
  return null;
}
