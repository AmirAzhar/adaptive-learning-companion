import { coveragePlan, mergeCoverage } from './study.js';

// The schema reserves one item and document-specific citations for every missing source.
export async function completeCoverage({ documents, items, target, field, generate, check, firstCall }) {
  const { kept, missing } = coveragePlan(documents, items, target);
  const apiCalls = [firstCall];
  const accepted = [];
  const seen = new Set(kept.map((item) => item[field].toLowerCase()));
  let pending = missing;
  for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
    let output;
    try {
      const generated = await generate(pending);
      apiCalls.push({ apiRequest: generated.requestBody, usage: generated.usage,
        estimatedCostUsd: generated.estimatedCostUsd });
      output = generated.output;
    } catch { continue; }
    const stillMissing = [];
    for (const [index, document] of pending.entries()) {
      try {
        const item = check(pending, output?.[`source${index + 1}`], field);
        const key = item[field].toLowerCase();
        if (item.documentId !== document.id || seen.has(key)) throw new Error('Invalid source item.');
        seen.add(key);
        accepted.push(item);
      } catch { stillMissing.push(document); }
    }
    pending = stillMissing;
  }
  const combined = mergeCoverage(kept, accepted, field, target);
  const covered = new Set(combined.map((item) => item.documentId));
  return { items: combined, apiCalls,
    uncovered: documents.filter((document) => !covered.has(document.id)) };
}
