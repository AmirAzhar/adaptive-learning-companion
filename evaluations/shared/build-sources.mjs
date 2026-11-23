import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('data/evaluation');
const config = JSON.parse(await readFile(path.join(root, 'source-config.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'source-lock.json'), 'utf8'));
const snapshotRoot = path.resolve(config.snapshotRoot);
const corpusRoot = path.join(root, 'corpus');
const locked = new Map(lock.files.map(file => [file.relativePath, file.sha256]));
const sha256 = text => createHash('sha256').update(text).digest('hex');
const redactionCounts = { email: 0, secretAssignment: 0 };

function redact(text) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => {
      redactionCounts.email++;
      return '[redacted email]';
    })
    .replace(/(password|secret)\s*[:=]\s*[^\s]{12,}/gi, (_, name) => {
      redactionCounts.secretAssignment++;
      return `${name}: [redacted value]`;
    });
}

function section(text, heading) {
  if (!heading) return text;
  const lines = text.split(/(?<=\n)/);
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0) throw new Error(`Missing heading: ${heading}`);
  let end = start + 1;
  while (end < lines.length && !/^# [^#]/.test(lines[end])) end++;
  return lines.slice(start, end).join('');
}

function cutAtBoundary(text, target) {
  if (text.length < target) throw new Error(`Only ${text.length} characters available for target ${target}`);
  const paragraph = text.lastIndexOf('\n\n', target);
  if (paragraph >= target - 700) return Math.min(target, paragraph + 2);
  const line = text.lastIndexOf('\n', target);
  if (line >= target - 350) return Math.min(target, line + 1);
  const space = text.lastIndexOf(' ', target);
  if (space >= target - 100) return Math.min(target, space + 1);
  return target;
}

const output = { schemaVersion: 1, sourceConfig: 'data/evaluation/source-config.json', sourceLock: 'data/evaluation/source-lock.json', sets: [] };
for (const sourceSet of config.sourceSets) {
  const assembled = [];
  for (const document of sourceSet.documents) {
    const pieces = [];
    for (const source of document.sources) {
      const relative = source.path.replaceAll('\\', '/');
      const file = path.resolve(snapshotRoot, relative);
      if (!file.startsWith(snapshotRoot + path.sep)) throw new Error(`Source escaped snapshot root: ${relative}`);
      const bytes = await readFile(file);
      if (sha256(bytes) !== locked.get(relative)) throw new Error(`Snapshot changed: ${relative}`);
      const text = redact(section(bytes.toString('utf8'), source.heading));
      pieces.push(`## Source: ${relative}${source.heading ? ` — ${source.heading}` : ''}\n\n${text.trim()}\n\n`);
    }
    assembled.push({ id: document.id, text: pieces.join('') });
  }
  const sizes = [];
  for (const target of config.targetCharactersPerDocument) {
    const sizeId = `${target * sourceSet.documents.length / 1000}k`;
    const directory = path.join(corpusRoot, sourceSet.id, sizeId);
    await mkdir(directory, { recursive: true });
    const documents = [];
    for (const document of assembled) {
      const text = document.text.slice(0, cutAtBoundary(document.text, target));
      const relative = path.relative(root, path.join(directory, `${document.id}.md`)).replaceAll('\\', '/');
      await writeFile(path.join(directory, `${document.id}.md`), text, 'utf8');
      documents.push({ id: document.id, file: relative, characters: text.length, sha256: sha256(text) });
    }
    sizes.push({ id: sizeId, targetCharacters: target * sourceSet.documents.length,
      actualCharacters: documents.reduce((sum, document) => sum + document.characters, 0), documents });
  }
  output.sets.push({ id: sourceSet.id, sizes });
}
await writeFile(path.join(root, 'corpus-manifest.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Redacted ${redactionCounts.email} email addresses and ${redactionCounts.secretAssignment} secret-like assignments from candidate source text.`);
for (const set of output.sets) {
  console.log(`${set.id}: ${set.sizes.map(size => `${size.id}=${size.actualCharacters}`).join(', ')}`);
}
