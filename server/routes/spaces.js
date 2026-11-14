import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkSource } from '../study.js';
import { findSpace, readSpaces, updateSpaces } from '../store.js';
import { body, json } from '../http.js';

export async function handleSpaces(request, response) {
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
  return false;
}
