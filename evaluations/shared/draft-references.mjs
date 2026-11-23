import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve('data/evaluation');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'corpus-manifest.json')));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const result = { schemaVersion: 1, status: 'agent_draft_requires_human_review', generatedAt: new Date().toISOString(), sets: [] };

for (const set of manifest.sets) {
  const small = set.sizes.find(size => size.id === '40k');
  const large = set.sizes.find(size => size.id === '100k');
  const concepts = [];
  for (let i = 0; i < small.documents.length; i++) {
    const a = small.documents[i];
    const b = large.documents[i];
    if (a.id !== b.id) throw new Error(`Document order changed: ${set.id}`);
    const text = fs.readFileSync(path.join(root, b.file), 'utf8');
    if (digest(text) !== b.sha256 || digest(fs.readFileSync(path.join(root, a.file))) !== a.sha256)
      throw new Error(`Corpus hash changed: ${b.id}`);
    const heads = [...text.matchAll(/^#{2,4}\s+(.+)$/gm)]
      .filter(match => !match[1].startsWith('Source:'))
      .map(match => ({ title: match[1].trim(), start: match.index }));
    const targets = [a.characters / 6, a.characters / 2, a.characters * 5 / 6,
      b.characters * 0.58, b.characters * 0.83];
    const used = new Set();
    targets.forEach((target, index) => {
      const choices = heads.filter(head => (index < 3 ? head.start < a.characters : head.start >= a.characters) && !used.has(head.start));
      const best = choices.sort((x, y) => Math.abs(x.start - target) - Math.abs(y.start - target))[0];
      if (!best) return;
      used.add(best.start);
      const next = heads.find(head => head.start > best.start)?.start ?? text.length;
      const excerpt = text.slice(best.start, Math.min(next, best.start + 350)).replace(/\s+/g, ' ').trim();
      const locations = [
        ...(best.start < a.characters ? [{ sizeId: '40k', file: a.file, sha256: a.sha256,
          start: best.start, third: Math.min(3, Math.floor(best.start * 3 / a.characters) + 1) }] : []),
        { sizeId: '100k', file: b.file, sha256: b.sha256, start: best.start,
          third: Math.min(3, Math.floor(best.start * 3 / b.characters) + 1) },
      ];
      concepts.push({ id: `${set.id.toUpperCase()}-${String(i + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
        documentId: b.id, candidateTopic: best.title, candidateEvidenceExcerpt: excerpt,
        priority: null, priorityReason: 'Human reviewer must assign high or normal.', locations,
        reviewStatus: 'agent_draft_unreviewed' });
    });
  }
  result.sets.push({ id: set.id, concepts, crossDocumentRelationships: [],
    reviewInstructions: 'Check each candidate against the source, replace topic labels with assessable claims, add or remove concepts, assign priority, verify locations and thirds, and identify cross-document relationships before generation.' });
}
fs.writeFileSync(path.join(root, 'reference-concepts.draft.json'), JSON.stringify(result, null, 2) + '\n');
console.log(result.sets.map(set => `${set.id}: ${set.concepts.length} candidates`).join('\n'));
