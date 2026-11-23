# Study-space capacity evaluation plan

Status: the **40K versus 100K pilot** completed its twelve initial generation cases on 2026-11-17; agent quality scoring and final comparison decisions remain pending. This document records how to compare source-size and model choices for Main ideas, Quiz, and Flashcards. It does not change the current limits.

The completed pilot's reusable prompts are archived in [RUNNER_PROMPT.md](RUNNER_PROMPT.md).

## Decision to make

Determine whether increasing active source text from about 40,000 to about 100,000 characters preserves accurate, useful study material at an acceptable cost and wait time. Compare the current model with one stronger candidate at both sizes. This pilot can support or reject a 100K direction; it cannot identify the maximum practical size or prove that one quiz/deck fully covers a large space.

The model's context window is a technical capacity, not a quality target. There is no assumed optimal percentage of that window. Character counts are useful for the interface, but the evaluation must record the actual token count of each complete API request, including instructions, source blocks, and schema. Leave room for the response.

## Current baseline

- Each uploaded `.txt` or `.md` document has 120–20,000 characters. Generation uses all active documents in the browser and rejects a selection over 40,000 total characters. A space can store more than 40,000 characters if some documents are removed from active sources.
- Main ideas, quiz, and flashcard generation send the selected source text directly in separate model requests. There is no retrieval or section-selection stage. The default model is `gpt-4o-mini`, overridable with `OPENAI_MODEL`.
- Quiz targets approximately one question per 2,500 characters, capped at 10; flashcards target approximately one card per 1,250 characters, capped at 20. Both targets reach their caps at 25,000 characters. These are starting heuristics, not evidence of sufficient concept coverage.
- Main ideas requests one cited idea from each of up to eight successive parts per document. Quiz and flashcard generation require at least one cited item per selected document and may make coverage-repair requests. Citation and structural validation do not establish that an answer is correct or that the important concepts were covered.
- The app records API usage and estimated cost for the default model when a completed call returns usage. Evaluation must also account for failed or retried calls when determining the cost of obtaining a usable result.

The default model advertises a [128,000-token context window and 16,384-token maximum output](https://developers.openai.com/api/docs/models/gpt-4o-mini). Research on long inputs finds that usable performance can decline well before the advertised window and can depend on the position of relevant information ([Lost in the Middle](https://www-cs.stanford.edu/~nfliu/papers/lost-in-the-middle.tacl2023.pdf), [NoLiMa](https://arxiv.org/abs/2502.05167), [RULER](https://arxiv.org/abs/2404.06654)). These benchmarks are motivation to test this app's tasks, not a character limit to copy.

## Model chosen for comparison

Compare the current `gpt-4o-mini` baseline with **`gpt-6.1-terra` at `reasoning.effort: "medium"`**. This is a candidate to test, not a claim that it will score better on this app's material. OpenAI's [model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection) specifically suggests Terra for concise writing based on supplied material, which is close to this app's grounded summaries and study items. It costs half as much per input and output token as Sol. Fix the effort for all Terra runs; record the returned model version and all reasoning/output tokens. Check account access and run one isolated structured-output compatibility request before the pilot. The app's current cost estimator only handles `gpt-4o-mini`, so the evaluation harness must calculate Terra costs from reported usage and current pricing. The existing 30-second quiz/card and 90-second summary timeouts may need separate evaluation settings; any timeout change must be recorded and compared fairly.

The [general-purpose model catalog](https://developers.openai.com/api/docs/models) and individual model pages show the following standard API rates per million uncached input/output tokens. All listed candidates support the Responses API and structured outputs. Selection is based on task fit and price, not release date alone.

| Model | Context window | Input / output USD per million tokens | Role in this evaluation |
| --- | ---: | ---: | --- |
| [`gpt-4o-mini`](https://developers.openai.com/api/docs/models/gpt-4o-mini) | 128K tokens | $0.15 / $0.60 | Existing baseline; the catalog marks it deprecated. |
| [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna) | 1.05M tokens | $0.10 / $0.50 | Cheapest option; positioned for focused, high-volume tasks. Consider later if Terra's quality passes and lower cost is still needed. |
| [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | 1.05M tokens | $0.20 / $1.20 | Cost-sensitive older option, but priced above GPT-6 Luna. |
| [`gpt-5.6-terra`](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | 1.05M tokens | $2 / $12 | Balance tier, but priced above GPT-6.1 Terra. |
| [`gpt-6.1-terra`](https://developers.openai.com/api/docs/models/gpt-6.1-terra) | 1.05M tokens | $1 / $5 | **Chosen:** task-relevant writing model at half Sol's price. |
| [`gpt-6-sol`](https://developers.openai.com/api/docs/models/gpt-6-sol) | 1.05M tokens | $2 / $10 | Same listed input/output price as GPT-6.1 Sol; no cost saving. |
| [`gpt-5.6-sol`](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | 1.05M tokens | $4 / $20 | More expensive than either Sol option. |
| [`gpt-6.1-sol`](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | 1.05M tokens | $2 / $10 | Stronger-tier fallback if Terra fails the quality bar. |
| [`gpt-6-astra`](https://developers.openai.com/api/docs/models/gpt-6-astra) | 1.05M tokens | $10 / $50 | Flagship quality reference; five times Sol's listed input/output price, so not the first candidate for this prototype. |

These are published standard rates, not measured costs for this app. As an illustration, a call with 25K uncached input tokens and 2K billed output tokens would cost about **$0.00495** on mini or **$0.035** on Terra before retries or other pricing adjustments. Terra may use reasoning tokens that increase billed output. Judge the models by measured quality, total cost per usable study set, and latency, not by context size or list price alone. Specialized image, audio, embedding, moderation, and coding models are outside this text-generation comparison.

## Pilot variables and controls

| Variable | Pilot setting | Question answered |
| --- | --- | --- |
| Input size | About 40K versus 100K characters; log actual request tokens | What changes when the same source set grows to 100K? |
| Model | Current `gpt-4o-mini` and `gpt-6.1-terra` at medium reasoning effort | Does a model change improve quality enough to justify its total cost? |
| Processing | Hold the current whole-selection request method fixed | Isolate size and model effects. |
| Output policy | Hold the current 10-question/20-card caps fixed | Measure today's single-result behavior; interpret low coverage in light of the fixed caps. |
| Source arrangement | Hold five document IDs and their order fixed within each set; use three subject sets | Compare nested source text while checking source and position balance. |

The 100K cases require an isolated evaluation harness; they must not silently change product behavior or saved study data. Keep each document at or below the current 20K upload limit. Staged processing, retrieval, additional study sessions, other sizes, and additional models are **outside this pilot**. They can be considered after reviewing its results.

### Concrete test matrix and count

Hold the document count at **five per source set** so input size does not also change the number of documents. Use the already prepared nested variants of approximately 8K and 20K characters per document, yielding about **40K and 100K total**. Record actual character and request-token counts. Keep document order fixed within each set. Use `gpt-6.1-terra` at medium reasoning effort as the comparison model and record the returned model version.

| Model | Processing | Output policy | Sizes | Distinct configurations |
| --- | --- | --- | --- | ---: |
| `gpt-4o-mini` | Whole-selection call | Current caps | 40K, 100K | 2 |
| `gpt-6.1-terra` (medium effort) | Whole-selection call | Current caps | 40K, 100K | 2 |
| **Pilot total** | | | | **4** |

With three source sets (**frontend**, **Java**, and **systems/AWS**) and **one initial run** of each configuration, the pilot is `4 × 3 = 12` case runs. Each run requests Main ideas, Quiz, and Flashcards, giving **36 format results** plus any coverage-repair calls. This single repetition is exploratory; it cannot establish a reliable success rate. If results are close or inconsistent, decide on a second repetition before drawing a final conclusion. A second repetition would add 12 runs and 36 format results, but is not in the initial queue.

Run paired cases on the same source set, with the same five document IDs and order. Compare 40K versus 100K within each model first, then compare models at the same size. Do not choose a configuration from a single attractive example.

## Test material and reference answers

The first evaluation's source material is the user's personal study notes from **Dev Vault** in their local Obsidian vault. The machine-specific absolute path and selected note paths are in ignored `data/evaluation/source-config.json`. A frozen, ignored copy is under `data/evaluation/source-snapshot/`; `source-lock.json` records its hashes. The tracked `evaluations/shared/build-sources.mjs` creates the 40K and 100K nested variants for each of three sets, with actual lengths and hashes in `corpus-manifest.json`. The sets are **frontend**, **Java**, and **systems/AWS**, each with five evaluation documents. No raw note text or absolute vault path is committed. Do not use `data/spaces.json` or the vault's separate Work Projects folder. If the local config or snapshot is unavailable in another workspace, resolve that before running cases; never silently substitute different material.

These selected notes are candidate material, not yet a human-approved gold set. A basic local scan found no obvious API key or private-key patterns in the generated corpus, and email addresses and one secret-like assignment were redacted. Check the selected corpus for other sensitive material before external model calls. The three sets are all technical, so conclusions about other subjects will remain limited.

For each set, have a human identify the high-priority concepts, their supporting passages, and any cross-document relationships before seeing generated output. Include important ideas near the beginning, middle, and end. Keep the reference list fixed across model comparisons. Review source claims carefully: grounding to a study note is distinct from independent factual correctness of that note.

The pilot starts with one run per configuration and source set. Review generated results without displaying the model or configuration to the reviewer. Keep source material, prompts, output policy, and scoring rubric identical when comparing models. Record model versions and request parameters so results remain interpretable if an API model alias changes. Repeat paired cases if the initial signal is too uncertain to support a decision.

## Measures

Score Main ideas, Quiz, and Flashcards separately before reporting a complete study-set result. Human reviewers see the sources and generated output, but not the model or configuration. Automated checks collect timing, usage, citations, structure, and failures; they do not decide factual correctness or teaching value.

| Measure | Unit and scoring rule | Report |
| --- | --- | --- |
| Concept coverage | Before generation, list distinct concepts supported by the source and mark each high or normal priority. For each format, a reviewer marks each concept covered (1), partly covered (0.5), or absent (0). A concept only earns credit when its treatment is factually correct and understandable. Repeated items count once. | Sum of earned credit / number of reference concepts, plus high-priority coverage and the count of missing high-priority concepts. For quiz/deck, score both one result and all sessions intended to cover the space. |
| Factual correctness and grounding | Review every main-idea claim, quiz question/key/explanation/options, and flashcard front/back against the source. Mark an item correct and supported, minor issue, or serious error. A wrong quiz key, unsupported answer, or misleading claim is a serious error even if its cited block exists. | Correct-and-supported items / reviewed items; counts of minor and serious errors, with examples. Report answer-key errors separately. |
| Study usefulness | Rate each factually correct item on a 0–2 rubric: 0 = unusable or rote/ambiguous; 1 = usable but shallow or unfocused; 2 = clear, distinct, and probes understanding. For a quiz, check that distractors are plausible and only the keyed answer is correct. For a card, check that the front asks one answerable thing and the back is concise. For main ideas, check that each idea is clear and relevant. | Mean score and fraction scoring 2, by format. Count duplicates and near-duplicates separately. Incorrect items cannot score above 0. |
| Source and position balance | Divide each document into beginning, middle, and end thirds by source length. Assign reference concepts to their supporting document and third before generation. Calculate coverage within each group using the same 1/0.5/0 rule. Do not use raw item counts: documents can contain different numbers of worthwhile concepts. | Coverage per document and position, lowest group coverage, and gap between highest and lowest groups. Show group sizes so a one-concept group is not overinterpreted. |
| Reliability | Count every attempted generation, not just saved results. Record first-call validation, coverage-repair calls, API errors, incomplete output, timeout, final validated success, and whether a manual retry was needed. | First-attempt and final success rates, calls per usable result, and failure counts by type. |
| Latency | Timestamp the start of a user-level generation action and the time its validated result becomes available. Include repair and retry time. Measure each format and the time until all requested formats are available. | Median and slow-case (for example 90th-percentile) wait time, plus failed-run time. |
| Cost | Record the model, input and output tokens, and USD cost for every call in an attempt, including repairs and failed validation. Sum calls needed to get each usable format and the complete study set. | Cost per attempt, cost per usable result, cost per complete set, and total cost / number of distinct, accurate high-priority concepts covered. Show quality and latency beside cost. |

For example, if a source has 20 reference concepts and a quiz accurately covers 12 while partly covering two, its concept coverage is `(12 + 2 × 0.5) / 20 = 65%`. A cited but wrong answer earns no coverage credit and is also counted as a serious accuracy error. This prevents a result from appearing comprehensive merely by mentioning many topics.

Have two reviewers independently score a sample of results, compare disagreements, and refine the rubric before scoring the full set. Resolve remaining disagreements against the source text and keep brief notes for borderline cases. An automated or model-based judge may help flag items for review, but should not be the sole authority for correctness or usefulness.

Cost per concept is a comparison measure, not a goal to minimize at the expense of correctness. Keep raw cost, quality, and latency visible alongside it. If a failed request does not expose usage, mark its cost as unknown rather than zero; use billing data where available. Choose minimum acceptable coverage, correctness, usefulness, reliability, cost, and latency thresholds before reviewing comparison results.

## Required output from each evaluation case

A **configuration** is one combination of input size, model, processing method, and output policy from the test matrix. A **case** is one run of that configuration on a particular source set and repetition. Its **case ID** is a unique, readable identifier for that run, used to group its output files and link them to the comparison report. For example, `frontend-40k-terra-whole-capped-r1` means the frontend source set, 40K characters, Terra, whole-selection processing, current output caps, first run. The case ID is only a label; `manifest.json` holds the exact model ID, token count, source hashes, and other details. An agent running a case must produce the same artifacts for all three formats. Keep raw artifacts under `data/evaluation/experiments/model-size-pilot/<case-id>/` (the repository already ignores `data/`); do not include API keys. A later comparison report can be added to the repository with only non-confidential aggregates and examples.

| Artifact | Required contents |
| --- | --- |
| `manifest.json` | Case ID; source-set ID and source-content hashes; character and token counts; document count and order; model ID and returned version; processing method; prompt/schema version or code commit; output policy; repetition number; start time. State any change from the baseline explicitly. |
| `calls.json` | One entry per API call, including format, purpose (initial/repair/retry), start/end times, response status or error, validation outcome, input/output token usage when available, and USD cost or `null` with a reason. Include calls that produced no saved result. |
| `outputs.json` | Actual generated Main ideas, quiz, and flashcards; source IDs/citations; validation result; and each format's final success or failure. Preserve failed model outputs when available so failure analysis is possible. |
| `scores.json` | For each format: reference concept IDs with 0/0.5/1 coverage scores; each generated item's correctness class, usefulness score, and supporting source location; duplicates; coverage by document and source third; aggregate numerators and denominators; reviewer identity/type and review status. Use `null` and an explanation for unreviewed measures, never a fabricated zero. |
| `report.md` | A short human-readable account: configuration, results for each measure, concrete good and bad examples linked to item/concept IDs, failures, limitations, and whether the case meets the pre-agreed thresholds. This report describes one case; it does not declare the overall winning configuration. |

Agent-generated judgments can be useful preliminary scores, but label them as agent review. If the reference concepts or factual/usefulness scores have not had the planned human review, mark the case **provisional**. An agent must not claim that generated material improved learning; this evaluation measures output quality only.

After all cases, produce one comparison report with a row per model and size. Show each source set's coverage, accuracy, usefulness, success/failure, latency, and total cost; include source-position gaps and cost per accurate high-priority concept. Summarize across the three sets while keeping their raw counts visible. Identify configurations that fail pre-agreed thresholds and any uncertainty or missing cost/review data. One run per source set does not support a precise reliability estimate.

## Suggested sequence

1. Fix reference concepts, review the selected source text, and set pilot quality and cost thresholds before any paid calls.
2. Run mini at 40K and 100K on the three source sets, then Terra at the same two sizes. Keep processing, output caps, source order, and review rubric fixed.
3. Compare the paired results for each set and format, including failures, latency, tokens, and cost. Separate source-size effects from model effects.
4. Decide whether the 100K direction is promising, needs a second repetition, or needs a different generation method before changing the app limit.

Do not infer learning improvement from output quality alone; learner testing remains a separate evaluation. This pilot does not choose an ultimate space-size ceiling or a new per-session item count.

## Results log

The twelve initial case runs across three frozen sets produced 36 structurally validated format results. The case artifacts and saved-artifact comparison are under ignored `data/evaluation/experiments/model-size-pilot/`; no private source or model output is committed. Mini needed ten coverage-repair calls and one manual retry after a timeout; Terra needed no repairs in these six cases. The twelve cases made 47 API attempts, plus one earlier Terra compatibility call. Known cumulative cost including that check is at least $0.45422685; actual cost remains unknown because the timed-out attempt returned no usage. The conservative stage budget ledger debits $2.44889735, including the approved reserve for the first case.

All twelve cases now have complete, arithmetic-checked **provisional agent** reviews under ignored `data/evaluation/experiments/model-size-pilot/review/`. Three anonymous packets had two independent reviews each; the coordinator recorded disagreements, rubric clarification, source-based resolutions, and retained the original judgments. The other nine packets had one agent review each. The original case `scores.json` files remain pending human review; `progress.json` records `provisionally_scored`, never `human_reviewed`. The paired quality, balance, reliability, latency, cost, and threshold results are in ignored `data/evaluation/experiments/model-size-pilot/pilot-comparison.provisional.md` and `review/agent-aggregate.json`. All 36 format results miss at least one approved coverage gate. The provisional recommendation is to try another generation method or targeted study sessions before changing the 40K product limit; no product limit changed. Resolve the timed-out call's billed cost and obtain human adjudication before a final decision. One run per set and configuration remains exploratory; a second repetition needs a deliberate plan update.
