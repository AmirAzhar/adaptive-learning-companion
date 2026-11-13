import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const defaultDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
let pending = Promise.resolve();

function filename() {
  return path.join(process.env.STUDY_DATA_DIR || defaultDir, 'spaces.json');
}

export async function readSpaces() {
  try {
    const data = JSON.parse(await readFile(filename(), 'utf8'));
    if (!Array.isArray(data.spaces)) throw new Error('Saved study data is invalid.');
    return data.spaces;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export function updateSpaces(change) {
  const operation = pending.then(async () => {
    const spaces = await readSpaces();
    const result = await change(spaces);
    const target = filename();
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ spaces }, null, 2), { mode: 0o600 });
    await rename(temporary, target);
    return result;
  });
  pending = operation.catch(() => {});
  return operation;
}

export function findSpace(spaces, id) {
  const space = spaces.find((item) => item.id === id);
  if (!space) throw new Error('Study space not found.');
  return space;
}
