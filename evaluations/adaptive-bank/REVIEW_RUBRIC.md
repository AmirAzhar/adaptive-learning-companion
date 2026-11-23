# Adaptive bank provisional review

Read `packet.json` and `source.md`. The packet contains one document's bank from one anonymous case. Score the generated items against the independent reference concepts and source. Do not use the extracted concept count as a quality denominator.

For each format, assign every reference concept credit `0` (absent or incorrect), `0.5` (partly covered, correct and understandable), or `1` (substantially covered, correct and understandable). A bare topic mention earns zero; repeated items count once. Record supporting generated IDs for nonzero credit. For the union across the three formats, take the maximum correct credit for each reference concept.

Inspect every generated item. Classify it as `correct_supported`, `minor_issue`, or `serious_error`. A wrong quiz key, unsupported answer, misleading claim, or multiple correct options is serious. Rate usefulness `0` (unusable, rote, ambiguous, or incorrect), `1` (usable but shallow), or `2` (clear, distinct, and probes understanding). Flag exact and near duplicates. Cite the source passage for errors and borderline judgments. Source IDs and model citations alone do not establish accuracy.

Report raw numerators and denominators for overall and high-priority concept credit, supported items, minor and serious errors, wrong keys, usefulness, duplicates, and source-third coverage. Report missing high-priority concepts. Use `null` with a reason for any unreviewed measure. Save review JSON and rationale in this packet directory without overwriting another review. Set `reviewerType` to `agent` and `status` to `provisional` for agent judgments. Do not infer learning outcomes from item quality.

Some source documents have no approved reference concepts. For those packets, report coverage as `null` with a zero denominator and still inspect item accuracy, support, usefulness, and duplication. Do not infer that a format achieved full coverage on a document without reference concepts.

Use this machine-checkable shape in `review-<label>.json`:

```json
{
  "packetId": "A-...",
  "reviewerType": "agent",
  "status": "provisional",
  "conceptScores": {
    "mainIdeas": {"C01": {"credit": 1, "supportItemIds": ["M001"]}},
    "quiz": {"C01": {"credit": 0.5, "supportItemIds": ["Q001"]}},
    "flashcards": {"C01": {"credit": 0, "supportItemIds": []}}
  },
  "itemJudgments": {
    "mainIdeas": {"M001": {"correctness": "correct_supported", "usefulness": 2, "duplicateOf": null, "evidenceNote": ""}},
    "quiz": {},
    "flashcards": {}
  },
  "notes": []
}
```

Include **every** concept ID in each format and **every** generated item ID in its item-judgment map. Valid correctness values are `correct_supported`, `minor_issue`, and `serious_error`. Usefulness is an integer 0, 1, or 2; a serious error must have usefulness 0. `duplicateOf` is another item ID in the same format or `null`. `evidenceNote` is a string and must explain each non-correct item or duplicate. The separate Markdown rationale should include aggregate numerators/denominators, source passages for disputed claims, and missing high-priority concepts. Run `python evaluations/adaptive-bank/validate-reviews.py <review-json>` before returning.
