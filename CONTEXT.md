# Development handoff

Updated 2026-11-13. `README.md` holds the product brief and run instructions. The code is the source of truth if these notes become stale.

## What exists

- A local Node.js 22 browser app at `http://localhost:3000`, with plain HTML, CSS, and JavaScript and no runtime package dependencies.
- A learner creates a named **study space**, adds one or more `.txt` or `.md` documents, previews their text, and chooses one document for a **study session**. Each document must contain 120–20,000 characters. Documents are currently studied one at a time.
- Starting a new session makes one OpenAI Responses API call for a two-to-four-sentence plain-language overview and three four-option multiple-choice questions. The model supplies an answer key, explanation, and source quote at generation time. Quiz selections are checked and saved locally without further model calls. Each question gets one answer per round; after finishing a round, the learner can practice only the missed questions in a fresh round. There is no overview-style choice.
- Study spaces, document text, sessions, quiz selections, explanations, request bodies, and usage are saved locally in ignored `data/spaces.json`. The app reopens the last space from the URL hash, or the first space. Saved data survives server restarts. Earlier open-ended sessions remain readable and answerable.
- New quizzes cite numbered source blocks, and the server derives displayed excerpts from the uploaded document rather than trusting model-written quotes. Invalid quiz structure produces a retry message while still showing API usage and estimated cost for that call. Legacy open-ended responses still use exact-quote validation. The API key remains server-side.
- **View API request** shows the JSON body and per-call token usage. Standard `gpt-4o-mini` cost is estimated; other models show usage without a price estimate.

## Key files

| File | Responsibility |
| --- | --- |
| `server.js` | Local HTTP server and study-space, document, run, and answer routes |
| `store.js` | Serialized, atomic writes to the local JSON store |
| `model.js` | OpenAI requests, structured output schemas, usage, and cost |
| `study.js` | Source and generated-result validation |
| `public/` | Browser interface |
| `study.test.js` | Original API flow and validation tests |
| `spaces.test.js` | Saved-space API flow, validation, and server-restart persistence test |

## Decisions and boundaries

1. A **study space** is the lasting container. A new **study session** is one generated round of three multiple-choice questions using one document in that space. A learner can start more sessions in the same space.
2. Browser file selection reads `.txt` and `.md` as text and posts the text to the local server. The server validates the extension and length and saves an immutable copy. The initial 6,000-character cap rejected a real 7,013-character React lifecycle note, so the bounded limit is now 20,000 characters. There is no PDF extraction, cross-document retrieval, account system, or hosted deployment yet.
3. The store is a single local JSON file with writes serialized within the process and replaced atomically. This is suitable for the local single-server prototype, not multi-instance deployment. `STUDY_DATA_DIR` can override the storage directory for tests.
4. Saved runs refer to immutable document IDs, so adding a document later does not change past questions or feedback. Quiz attempts record a round number; the current round and its question IDs are saved on the run. A completed question cannot be resubmitted in that round. Earlier quiz attempts remain available under Previous rounds. Legacy quiz attempts without a round number count as round 1; older open-ended runs retain their original reattempt behavior.
5. OpenAI requests set `store: false`. The app still saves source text and the request body locally; users should not test with confidential workplace material. There is no per-space delete UI yet. Deleting `data/spaces.json` erases all local study data.
6. The prior `/api/session` and `/api/answer` routes remain for compatibility and their existing tests, but the browser uses `/api/spaces` routes.
7. Removed the "Start with" dropdown because summary and explanation had no meaningful difference beyond a model style label. New runs show one "Main ideas" overview. Previously saved runs remain readable.
8. Replaced the browser's open-ended question flow with multiple-choice quizzes. A generation call supplies four distinct options, one answer key, a short explanation, and a source-block ID per question. The server validates the structure and block ID, derives the displayed excerpt from the document, then grades selected option indexes locally. Fixed question and option fields in the structured response prevent a variable number of questions or choices. This removes per-answer model calls for new runs. A valid block reference does not prove the generated key or explanation is correct; review examples with real material before treating scores as reliable.
9. **Flashcard direction, not implemented:** Generate editable, source-grounded cards from one selected document. The learner recalls before revealing an answer, then self-rates with a simple Again/Good choice. Save cards and review history so they can return to missed cards. Start with the review loop and consider spaced scheduling or Anki CSV export only after card quality and repeated use are observed. Quizzes are the implementation priority first.
10. Removed the misleading per-question **Try again** submit button. After a quiz answer, the selected option and feedback remain visible and the options are locked. When the round is complete, **Practice missed questions** starts a new round containing only questions missed in the current round, with selections and feedback cleared. The practice round is local and does not generate new questions or call OpenAI.

## Verification and known gaps

- `npm test` covers the legacy API flow and the saved-space quiz flow with mocked OpenAI responses, including create/upload/generate/select/practice missed/restart/reopen, duplicate-answer rejection, a 7,100-character document, and invalid-document cases. The practice interface was checked in a browser against an isolated copy of saved quiz data: a completed round offered the practice action, the next round had no selections or feedback, and answering in that round saved feedback. This did not make a real model request.
- A fresh 7,013-character document produced 422s with the previous quiz schema: one response did not have exactly three questions, and another had three questions but no exact quote matches. After switching to fixed question fields and source-block IDs, one live generation call for that document validated as three four-option questions with source excerpts found in the text. The user's running server must be restarted to load this change.
- Quote matching proves only that the text appears in the source, not that the question or grading is justified. Build a small repeatable quality evaluation set.
- PDF support needs text extraction and a source-preview step. Larger documents and multiple active documents need section selection or retrieval before model calls.
- The local server binds to `127.0.0.1` and has no authentication. Add auth, storage isolation, deletion, and operational controls before any public deployment.
