# Study-space capacity evaluation plan

Status: proposed evaluation, not yet run. This document records how to choose a source-size and generation configuration for Main ideas, Quiz, and Flashcards. It does not change the current limits.

For running the cases one at a time across chats, use the reusable prompt in [EVALUATION_RUNNER_PROMPT.md](EVALUATION_RUNNER_PROMPT.md).

## Decision to make

Choose the largest practical amount of active source text a study space can use while generating accurate, useful, and reasonably complete study material at an acceptable cost and wait time. Decide separately how many questions or cards belong in one study session. A space may need multiple sessions to cover its material.

The model's context window is a technical capacity, not a quality target. There is no assumed optimal percentage of that window. Character counts are useful for the interface, but the evaluation must record the actual token count of each complete API request, including instructions, source blocks, and schema. Leave room for the response.

## Current baseline

- Each uploaded `.txt` or `.md` document has 120–20,000 characters. Generation uses all active documents in the browser and rejects a selection over 40,000 total characters. A space can store more than 40,000 characters if some documents are removed from active sources.
- Main ideas, quiz, and flashcard generation send the selected source text directly in separate model requests. There is no retrieval or section-selection stage. The default model is `gpt-4o-mini`, overridable with `OPENAI_MODEL`.
- Quiz targets approximately one question per 2,500 characters, capped at 10; flashcards target approximately one card per 1,250 characters, capped at 20. Both targets reach their caps at 25,000 characters. These are starting heuristics, not evidence of sufficient concept coverage.
- Main ideas requests one cited idea from each of up to eight successive parts per document. Quiz and flashcard generation require at least one cited item per selected document and may make coverage-repair requests. Citation and structural validation do not establish that an answer is correct or that the important concepts were covered.
- The app records API usage and estimated cost for the default model when a completed call returns usage. Evaluation must also account for failed or retried calls when determining the cost of obtaining a usable result.

The default model advertises a [128,000-token context window and 16,384-token maximum output](https://developers.openai.com/api/docs/models/gpt-4o-mini). Research on long inputs finds that usable performance can decline well before the advertised window and can depend on the position of relevant information ([Lost in the Middle](https://www-cs.stanford.edu/~nfliu/papers/lost-in-the-middle.tacl2023.pdf), [NoLiMa](https://arxiv.org/abs/2502.05167), [RULER](https://arxiv.org/abs/2404.06654)). These benchmarks are motivation to test this app's tasks, not a character limit to copy.

## Model chosen for comparison

Compare the current `gpt-4o-mini` baseline with **`gpt-6.1-sol` at `reasoning.effort: "medium"`**. This is the proposed stronger-model candidate, not a claim that it will score better on this app's material. Fix the effort for all Sol runs; record the returned model version and all reasoning/output tokens. Check account access and run one isolated structured-output compatibility request before the full matrix. The app's current cost estimator only handles `gpt-4o-mini`, so the evaluation harness must calculate Sol costs from reported usage and current pricing. The existing 30-second quiz/card and 90-second summary timeouts may need separate evaluation settings; any timeout change must be recorded and compared fairly.

The [current general-purpose model catalog](https://developers.openai.com/api/docs/models) lists Luna for cost-sensitive volume, Terra for visual reasoning and writing, Sol for complex work at a lower cost than Astra, and Astra for the most demanding work. All four support the [Responses API and structured outputs](https://developers.openai.com/api/docs/models/compare). At standard API rates per million uncached input/output tokens, the relevant options are:

| Model | Context window | Input / output USD per million tokens | Role in this evaluation |
| --- | ---: | ---: | --- |
| [`gpt-4o-mini`](https://developers.openai.com/api/docs/models/gpt-4o-mini) | 128K tokens | $0.15 / $0.60 | Existing baseline; the catalog marks it deprecated. |
| [`gpt-6-luna`](https://developers.openai.com/api/docs/models/gpt-6-luna) | 1.05M tokens | $0.10 / $0.50 | Low-cost alternative, but a larger window alone does not establish better study quality. |
| [`gpt-6.1-terra`](https://developers.openai.com/api/docs/models/gpt-6.1-terra) | 1.05M tokens | $1 / $5 | Plausible writing-focused candidate, but less direct as the single stronger-model comparison. |
| [`gpt-6.1-sol`](https://developers.openai.com/api/docs/models/gpt-6.1-sol) | 1.05M tokens | $2 / $10 | Chosen candidate to test complex, multi-document synthesis and question quality. |
| [`gpt-6-astra`](https://developers.openai.com/api/docs/models/gpt-6-astra) | 1.05M tokens | $10 / $50 | Flagship quality reference; five times Sol's listed input/output price, so not the first candidate for this prototype. |

These are published standard rates, not measured costs for this app. As an illustration, a call with 25K uncached input tokens and 2K billed output tokens would cost about **$0.00495** on mini or **$0.07** on Sol before retries or other pricing adjustments. Sol may use reasoning tokens that increase billed output. Judge the models by measured quality, total cost per usable study set, and latency, not by context size or list price alone. Specialized image, audio, embedding, moderation, and coding models are outside this text-generation comparison; older general-purpose families remain available in the catalog but are not needed for the first two-model test.

## Experimental variables

| Variable | Candidate comparisons | Question answered |
| --- | --- | --- |
| Input size | About 10K, 25K, 40K, 70K, and 100K characters; log actual request tokens | Where do quality, failures, latency, and cost change? |
| Model | Current `gpt-4o-mini` and `gpt-6.1-sol` at medium reasoning effort | Does a model change improve quality enough to justify its total cost? |
| Processing | Current whole-selection call; per-document or per-section concept extraction followed by synthesis and item generation | Does staged processing preserve coverage better at larger sizes? |
| Output policy | Current 10-question/20-card result; more items split across manageable study sessions | Is low coverage caused by reading the source or by limited output space? |
| Source arrangement | Vary document count, topic mixture, and the position of important concepts | Are middle sections or particular documents neglected? |

Change one major variable at a time after a baseline, rather than running every combination. Sizes above the current 40K limit require an isolated evaluation harness or temporary test configuration; they must not silently change product behavior or saved study data. The 20K per-document upload limit also remains a separate constraint to account for.

### Concrete test matrix and count

For the first evaluation, hold the document count at **five per source set** so input size does not also change the number of documents. Use nested versions of each document: approximately 2K, 5K, 8K, 14K, and 20K characters per document, producing total sizes of **10K, 25K, 40K, 70K, and 100K**. Keep document order fixed within a source set. Use `gpt-6.1-sol` at medium reasoning effort as the stronger-model candidate and record the returned model version. Do not substitute a different model halfway through.

| Stage | Model | Processing | Output policy | Sizes | Distinct configurations |
| --- | --- | --- | --- | --- | ---: |
| 1: current method | `gpt-4o-mini` | Whole-selection call | Current 10-question/20-card caps | 10K, 25K, 40K, 70K, 100K | 5 |
| 1: model comparison | `gpt-6.1-sol` (medium effort) | Whole-selection call | Same caps | Same five sizes | 5 |
| 2: processing comparison | `gpt-4o-mini` | Section/document extraction, then generation | Same caps | 40K, 70K, 100K | 3 |
| 2: processing comparison | `gpt-6.1-sol` (medium effort) | Same staged processing | Same caps | 40K, 70K, 100K | 3 |
| 3: output comparison | Best qualifying model and processing method from stages 1–2 | As selected | Additional quiz/deck sessions to cover more concepts | 70K, 100K | 2 |
| **Maximum planned total** | | | | | **18** |

Stages 2 and 3 are follow-ups; run them where the prior results justify them. Stage 3 compares against the matching capped-output case already run, so its two configurations are the only new ones. If no configuration qualifies, record that result and investigate before expanding the matrix. The number of additional sessions in stage 3 must be set in advance, not chosen after seeing a particular output.

With **three source sets** (for example dense technical notes, conceptual prose, and mixed-topic notes) and **two repetitions** of each configuration, the full 18-configuration plan means `18 × 3 × 2 = 108` case runs. Each run requests Main ideas, Quiz, and Flashcards, for **324 format results**, plus any repair/retry API calls. Stage 1 alone is **10 configurations, 60 case runs, and 180 format results**. These are proposed counts, not completed tests. Source sets and repetitions increase evidence; they do not create new configuration types.

## Test material and reference answers

Use several non-confidential, real study-material sets with different subjects and concept density. Build nested source sets so that larger inputs extend smaller ones; also include multi-document sets and deliberately place important ideas near the beginning, middle, and end. For each set, have a human identify the high-priority concepts, their supporting passages, and any cross-document relationships before seeing generated output. Keep this reference list fixed across model comparisons.

Run each tested configuration more than once. Review generated results without displaying the model or configuration to the reviewer. Keep source material, prompts, output policy, and scoring rubric identical when comparing models. Record model versions and request parameters so results remain interpretable if an API model alias changes.

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

A **configuration** is one combination of input size, model, processing method, and output policy from the test matrix. A **case** is one run of that configuration on a particular source set and repetition. Its **case ID** is a unique, readable identifier for that run, used to group its output files and link them to the comparison report. For example, `tech-40k-sol-whole-capped-r2` means the technical source set, 40K characters, Sol, whole-selection processing, current output caps, repetition 2. The case ID is only a label; `manifest.json` holds the exact model ID, token count, source hashes, and other details. An agent running a case must produce the same artifacts for all three formats. Keep raw artifacts under `data/evaluation/<case-id>/` (the repository already ignores `data/`); do not include API keys. A later comparison report can be added to the repository with only non-confidential aggregates and examples.

| Artifact | Required contents |
| --- | --- |
| `manifest.json` | Case ID; source-set ID and source-content hashes; character and token counts; document count and order; model ID and returned version; processing method; prompt/schema version or code commit; output policy; repetition number; start time. State any change from the baseline explicitly. |
| `calls.json` | One entry per API call, including format, purpose (initial/repair/retry), start/end times, response status or error, validation outcome, input/output token usage when available, and USD cost or `null` with a reason. Include calls that produced no saved result. |
| `outputs.json` | Actual generated Main ideas, quiz, and flashcards; source IDs/citations; validation result; and each format's final success or failure. Preserve failed model outputs when available so failure analysis is possible. |
| `scores.json` | For each format: reference concept IDs with 0/0.5/1 coverage scores; each generated item's correctness class, usefulness score, and supporting source location; duplicates; coverage by document and source third; aggregate numerators and denominators; reviewer identity/type and review status. Use `null` and an explanation for unreviewed measures, never a fabricated zero. |
| `report.md` | A short human-readable account: configuration, results for each measure, concrete good and bad examples linked to item/concept IDs, failures, limitations, and whether the case meets the pre-agreed thresholds. This report describes one case; it does not declare the overall winning configuration. |

Agent-generated judgments can be useful preliminary scores, but label them as agent review. If the reference concepts or factual/usefulness scores have not had the planned human review, mark the case **provisional**. An agent must not claim that generated material improved learning; this evaluation measures output quality only.

After all cases, produce one comparison report with a row per configuration and size. Show the number of repetitions, median and range of coverage, accuracy, usefulness, reliability, latency, and total cost; include source-position gaps and the cost per accurate high-priority concept. Identify configurations that fail pre-agreed thresholds, the best tradeoffs among those that pass, and any uncertainty or missing cost/review data. Keep the raw counts visible so a percentage from a tiny sample is not mistaken for strong evidence.

## Suggested sequence

1. Establish a baseline with the current model and whole-selection method at increasing sizes. Keep the existing output caps initially to measure the current product, then separately test additional study sessions so output capacity does not masquerade as a context problem.
2. At sizes where coverage, correctness, or reliability worsens, compare a stronger model using the same inputs and output policy.
3. Compare staged per-section or per-document processing at those same sizes and models. Measure whether it recovers concepts from neglected positions and whether its extra calls are worth their cost.
4. Select the largest configuration that meets pre-agreed quality and reliability thresholds within an acceptable total cost and wait time. Record the thresholds before scoring results; do not choose them after seeing which configuration wins.

The final decision may specify a space storage limit, a separate per-generation token budget, a threshold for switching to staged processing, and a per-session item count. Do not infer learning improvement from output quality alone; learner testing remains a separate evaluation.

## Results log

No evaluation results yet. Record each run's source-set ID, source characters, complete request tokens, model/version, processing method, output policy, repetition number, scores above, call count, latency, total cost, and reviewer notes. Summarize the chosen configuration and its tradeoffs here after the evaluation.
