# Study-generation evaluations

| Experiment | Question | Status | Local artifacts |
| --- | --- | --- | --- |
| [Model and source size](model-size/PLAN.md) | How do 40K and 100K source inputs compare on Mini and Terra with the current whole-selection method? | Twelve cases generated and provisionally agent-scored. No configuration passed every coverage gate. | `data/evaluation/experiments/model-size-pilot/` |
| [Concept planning](concept-planning/PLAN.md) | Does a source-derived concept plan improve coverage at fixed model, source size, and item caps? | Twelve cases attempted; three 100K planning timeouts received one explicit retry each. Nine cases generated, three failed, and all generated cases have provisional agent review. | `data/evaluation/experiments/concept-planning/` |
| [Adaptive study bank](adaptive-bank/PLAN.md) | Can a space build a content-sized bank without a fixed total question or card cap? | Six cases and 30 document packets have provisional agent scores. [Results](adaptive-bank/RESULTS.md): every complete bank misses at least one quality gate; human review remains. | `data/evaluation/experiments/adaptive-bank/` |

Tracked plans, runner prompts, and source-free tooling live here. `data/evaluation/corpus/`, `source-snapshot/`, `source-lock.json`, `source-config.json`, `corpus-manifest.json`, and `reference-concepts.reviewed.json` are shared frozen fixtures. The private source text, API outputs, scores, and local progress remain ignored by Git. Each experiment owns its cases, review files, progress, controls, and comparison under its own directory. Do not use results from one experiment as if they were a paired run in another.
