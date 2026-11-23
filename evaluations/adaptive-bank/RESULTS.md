# Adaptive bank: provisional results

**Status, 2026-11-23:** All six generation cases and all 30 document review packets are complete. Two packets had an additional independent review, giving 32 validated agent reviews of 4,309 generated items. Six serious flags received separate source-based adjudication. The scores are **provisional agent judgments**, not human-reviewed learning outcomes. This experiment does not justify changing the app's 40K character limit.

## Decision

The exact tested method fails the predeclared complete-study-set gates in **all six cases**. It creates one “main idea” for every extracted concept, yielding 153–416 ideas per case. Five of six cases have mean main-idea usefulness below 1.3; the sixth has serious source-grounding errors. The dynamic quiz and flashcard banks generally pass their individual quality gates, but the full bank takes 8–24 minutes of sequential API time. The result supports testing a concise synthesis alongside a dynamic question/card bank. It does **not** identify an optimal space-size ceiling or prove that 100K is ready for the product.

| Source set | Characters | Ideas / questions / cards | Union reference credit | High-priority union | Serious errors after adjudication | Generation USD | USD/high-priority credit | API time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend 40K | 38,945 | 153 / 149 / 143 | 15/15 | 7/7 | 0 | $0.2913 | $0.0416 | 9.1 min |
| Frontend 100K | 99,540 | 270 / 267 / 254 | 24.5/25 | 10.5/11 | 0 | $0.5687 | $0.0542 | 14.3 min |
| Java 40K | 39,687 | 157 / 131 / 139 | 12/12 | 5/5 | 2 | $0.2537 | $0.0507 | 7.8 min |
| Java 100K | 99,153 | 284 / 251 / 277 | 19.5/20 | 9/9 | 0 | $0.5633 | $0.0626 | 14.6 min |
| Systems 40K | 39,241 | 213 / 206 / 191 | 12.5/14 | 7/8 | 2 | $0.4162 | $0.0595 | 13.1 min |
| Systems 100K | 99,737 | 416 / 413 / 395 | 24.5/25 | 11.5/12 | 0 | $0.9187 | $0.0799 | 24.2 min |

Reference credit uses 0, 0.5, or 1 per approved concept; repeated items count once. The systems 40K denominator excludes one approved concept whose evidence extends beyond the frozen 40K source. The original reference and reviewer score remain preserved in private artifacts. Java data structures has **no approved reference concepts** at either size; its items were reviewed for quality, but its coverage is undefined. These gaps and the small reference lists limit how strongly coverage percentages can be interpreted.

## Format-level checks

Each cell shows raw numerator/denominator. “Usefulness” is the sum of 0–2 item scores divided by item count. “Supported” excludes minor and serious issues. Serious counts use the separate adjudication; original reviewer files remain intact.

| Case | Format | Reference credit | Correct and supported | Usefulness | Serious | Near duplicates |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Frontend 40K | Ideas | 14.5/15 | 153/153 | 172/153 = 1.12 | 0 | 2 |
| | Quiz | 15/15 | 149/149 | 248/149 = 1.66 | 0 | 5 |
| | Cards | 14.5/15 | 143/143 | 219/143 = 1.53 | 0 | 3 |
| Frontend 100K | Ideas | 24/25 | 269/270 | 319/270 = 1.18 | 0 | 4 |
| | Quiz | 24/25 | 267/267 | 401/267 = 1.50 | 0 | 6 |
| | Cards | 24.5/25 | 254/254 | 364/254 = 1.43 | 0 | 3 |
| Java 40K | Ideas | 11.5/12 | 155/157 | 178/157 = 1.13 | 1 | 3 |
| | Quiz | 12/12 | 127/131 | 203/131 = 1.55 | 0 | 3 |
| | Cards | 9/12 | 135/139 | 183/139 = 1.32 | 1 | 2 |
| Java 100K | Ideas | 19/20 | 280/284 | 305/284 = 1.07 | 0 | 7 |
| | Quiz | 19.5/20 | 245/251 | 375/251 = 1.49 | 0 | 8 |
| | Cards | 17/20 | 269/277 | 390/277 = 1.41 | 0 | 8 |
| Systems 40K | Ideas | 12.5/14 | 210/213 | 283/213 = 1.33 | 1 | 4 |
| | Quiz | 12/14 | 200/206 | 318/206 = 1.54 | 1 | 3 |
| | Cards | 11/14 | 189/191 | 266/191 = 1.39 | 0 | 5 |
| Systems 100K | Ideas | 24.5/25 | 412/416 | 495/416 = 1.19 | 0 | 7 |
| | Quiz | 22.5/25 | 412/413 | 646/413 = 1.56 | 0 | 7 |
| | Cards | 24/25 | 391/395 | 567/395 = 1.44 | 0 | 6 |

The predeclared gates are idea coverage ≥70% overall/80% high priority, quiz ≥35%/50%, cards ≥50%/60%; each format also requires ≥95% correct and supported, zero serious errors, and mean usefulness ≥1.3. All 18 format results pass the measured coverage and supported-item gates, but **eight fail at least one gate overall**: five idea results fail usefulness, and Java 40K ideas/cards plus systems 40K ideas/quiz fail on serious errors (with overlap on two of those idea results). No case passes every format gate. Java 100K and systems 100K have no serious errors after adjudication but still fail on idea usefulness.

## Paired 40K versus 100K evidence

For approved concepts supported by **both** frozen sizes, union credit is frontend 15 to 15/15, Java 12 to 12/12, and systems 12.5 to 13.5/14. Thus the larger source did not lose shared-concept union coverage in this one run; systems improved by one credit. The 100K cases also contain additional source and additional reference concepts, so their larger absolute credit is expected and should not be described as a controlled coverage gain from size alone. The Java data-structures reference gap and sparse concept lists remain.

The three 40K cases together used 91 calls, $0.9613, and 30.0 minutes of summed API time. The three 100K cases used 141 calls, $2.0506, and 53.1 minutes. Across all six: **232 recorded generation API attempts**, $3.0119052 known standard-rate cost, and no unknown-cost calls. Agent-review token cost was not recorded and is not included in those USD figures. Seven call attempts in the 40K cases failed validation or runner preservation; the three 100K cases had none. Some 40K interruptions were harness bugs or strict display-format checks, so this one repetition cannot establish a model reliability advantage for 100K.

The two independent reviewers of one frontend 40K packet and its paired 100K packet agreed on concept credit and correctness. They differed on 26 item-level usefulness ratings across 201 distinct items; the original reviews and differences are preserved. The other 28 packets have one agent review each. These ratings are not a human study or a measured learning benefit.

Union coverage by source-position third (beginning / middle / end) is frontend 40K **5/5, 5/5, 5/5** and 100K **13/13, 7/7, 4.5/5**; Java 40K **4/4, 5/5, 3/3** and 100K **9/9, 6/6, 4.5/5**; systems 40K **4.5/5, 4.5/5, 3.5/4** and 100K **11.5/12, 8/8, 5/5**. Group sizes are small, so these do not prove uniform source-position behavior. Document-level scores remain in the validated packet reviews.

## Error examples and next test

Four adjudicated serious items remain: Java 40K M098/F083 and systems 40K M111/Q110. In both documents, the model supplied a plausible correction to a questionable study note but treated outside knowledge as if the note supported it. Q230 in Java 100K was downgraded to a minor wording issue because its keyed declaration is valid; Q296 in systems 100K was judged correct because discarding attributes would not store the specified 500 KB content. No adjudicated wrong quiz key remains. Preserve the original agent judgments alongside the adjudication.

The next experiment should **keep content-sized question/card banks but test a concise summary policy**, such as a small set of priority ideas per document plus a cross-document synthesis. Measure whether it raises main-idea usefulness without losing high-priority coverage. Separately test whether staged or on-demand bank generation can reduce the 8–24 minute whole-bank wait. Before using coverage to choose a product character limit, expand and approve the reference concepts, including Java data structures, and repair the one unsupported systems 40K reference. Keep the current 40K product limit while these questions remain open.

Private per-item reviews, overlap comparisons, serious-item adjudication, and adjusted aggregates are under ignored `data/evaluation/experiments/adaptive-bank/`. The tracked [plan](PLAN.md) and [review rubric](REVIEW_RUBRIC.md) describe the method and thresholds.
