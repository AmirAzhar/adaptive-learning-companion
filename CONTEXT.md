# Development handoff

Updated 2026-11-14. `README.md` holds the product brief and run instructions. The code is the source of truth if these notes become stale.

## What exists

- A local Node.js 22 browser app at `http://localhost:3000`, with plain HTML, CSS, and JavaScript and no runtime package dependencies.
- A learner creates a named **study space**, adds one or more `.txt` or `.md` documents, previews their text, and chooses one document for a **study session**. Each document must contain 120–20,000 characters. Documents are currently studied one at a time.
- For a document without either format, the primary Generate action starts independent quiz and flashcard requests. If one fails, the successful result stays saved and the missing format can be generated separately. Independent **Generate quiz/flashcards** and **New quiz/deck** actions work for any selected document. A quiz generation makes one OpenAI Responses API call for a two-to-four-sentence overview and three four-option questions. Quiz selections are checked locally; missed questions can be practiced in a fresh round.
- Flashcard generation makes a separate OpenAI call for five cards tied to one immutable document. Cards have editable questions and answers and a displayed source excerpt derived from the document. The learner reveals each answer, rates Again or Good, and can review Again cards or all cards in another round. Edits, ratings, rounds, and history persist locally; reviewing makes no model call.
- A header **Library** button opens a native modal `<dialog>` drawer for spaces and documents at every viewport width. It closes from its button, Escape, backdrop click, or document selection. Native dialog behavior supplies focus containment and background inertness without a UI dependency. The workspace header shows the selected document, source preview, and generation actions. A Quiz/Flashcards switch shows one mode at a time, and a picker selects one saved run or deck when there are multiple for that document. Quiz practice shows the next unanswered question and the latest answered question with feedback; earlier answers are in a disclosure. The source text and card editor are also disclosures.
- Study spaces, document text, sessions, decks, quiz selections, flashcard reviews, explanations, request bodies, and usage are saved locally in ignored `data/spaces.json`. The app reopens the last space from the URL hash, or the first space. Saved data survives server restarts. Earlier open-ended sessions remain readable and answerable.
- New quizzes cite numbered source blocks, and the server derives displayed excerpts from the uploaded document rather than trusting model-written quotes. Invalid quiz structure produces a retry message while still showing API usage and estimated cost for that call. Legacy open-ended responses still use exact-quote validation. The API key remains server-side.
- **View API request** shows the JSON body and per-call token usage. Standard `gpt-4o-mini` cost is estimated; other models show usage without a price estimate.

## Key files

| File | Responsibility |
| --- | --- |
| `server/index.js` | HTTP entrypoint, route dispatch, static assets, and top-level errors |
| `server/routes/spaces.js` | Study-space and document routes |
| `server/routes/quizzes.js` | Quiz generation, answers, and missed-question practice routes |
| `server/routes/flashcards.js` | Deck generation, card editing, and review routes |
| `server/routes/legacy.js` | Compatibility routes for the original open-ended API |
| `server/http.js` | Shared request parsing and JSON/model-result responses |
| `server/store.js` | Serialized, atomic writes to the local JSON store |
| `server/model.js` | OpenAI requests, structured output schemas, usage, and cost |
| `server/study.js` | Source and generated-result validation |
| `public/` | Browser interface |
| `tests/study.test.js` | Original API flow and validation tests |
| `tests/spaces.test.js` | Saved-space API flow, validation, and server-restart persistence test |
| `tests/flashcards.test.js` | Flashcard generation, editing, review, and persistence tests |

## Decisions and boundaries

1. A **study space** is the lasting container. A new **study session** is one generated round of three multiple-choice questions using one document in that space. A learner can start more sessions in the same space.
2. Browser file selection reads `.txt` and `.md` as text and posts the text to the local server. The server validates the extension and length and saves an immutable copy. The initial 6,000-character cap rejected a real 7,013-character React lifecycle note, so the bounded limit is now 20,000 characters. There is no PDF extraction, cross-document retrieval, account system, or hosted deployment yet.
3. The store is a single local JSON file with writes serialized within the process and replaced atomically. This is suitable for the local single-server prototype, not multi-instance deployment. `STUDY_DATA_DIR` can override the storage directory for tests.
4. Saved runs refer to immutable document IDs, so adding a document later does not change past questions or feedback. Quiz attempts record a round number; the current round and its question IDs are saved on the run. A completed question cannot be resubmitted in that round. Earlier quiz attempts remain available under Previous rounds. Legacy quiz attempts without a round number count as round 1; older open-ended runs retain their original reattempt behavior.
5. OpenAI requests set `store: false`. The app still saves source text and the request body locally; users should not test with confidential workplace material. There is no per-space delete UI yet. Deleting `data/spaces.json` erases all local study data.
6. The prior `/api/session` and `/api/answer` routes remain for compatibility and their existing tests, but the browser uses `/api/spaces` routes.
7. Removed the "Start with" dropdown because summary and explanation had no meaningful difference beyond a model style label. New runs show one "Main ideas" overview. Previously saved runs remain readable.
8. Replaced the browser's open-ended question flow with multiple-choice quizzes. A generation call supplies four distinct options, one answer key, a short explanation, and a source-block ID per question. The server validates the structure and block ID, derives the displayed excerpt from the document, then grades selected option indexes locally. Fixed question and option fields in the structured response prevent a variable number of questions or choices. This removes per-answer model calls for new runs. A valid block reference does not prove the generated key or explanation is correct; review examples with real material before treating scores as reliable.
9. Flashcard decks are independent of quiz runs but use the same selected immutable document. Initial generation calls both routes, and each request validates and saves separately. A deck has five editable cards and saved review rounds. The server accepts one Again/Good rating per card in a round; a completed round can start again with only Again cards or with all cards. Edits preserve card IDs and review history. Answer reveal is browser state; the server cannot verify that a learner revealed before rating. Source-block validation proves the displayed excerpt belongs to the document, not that the answer is correct. Spaced scheduling, Anki export, and deletion are deferred.
10. Removed the misleading per-question **Try again** submit button. After a quiz answer, the selected option and feedback remain visible and the options are locked. When the round is complete, **Practice missed questions** starts a new round containing only questions missed in the current round, with selections and feedback cleared. The practice round is local and does not generate new questions or call OpenAI.
11. Grouped runtime files under `server/` and behavior tests under `tests/`. `server/index.js` is the startup and test entrypoint; the former all-in-one HTTP routes are split by workflow under `server/routes/`. Each route handler returns `true` after sending a response or `false` when unmatched. Shared JSON parsing and generated-result responses live in `server/http.js`. `server/store.js` still writes to root `data/spaces.json`. The browser remains in `public/`, with shared selection state in `public/app.js`; split it only when a clear module interface reduces coupling. `AGENTS.md` records placement rules for future feature chats.

## Verification and known gaps

- `npm test` covers the legacy API flow and the saved-space quiz flow with mocked OpenAI responses, including create/upload/generate/select/practice missed/restart/reopen, duplicate-answer rejection, a 7,100-character document, and invalid-document cases. The practice interface was checked in a browser against an isolated copy of saved quiz data: a completed round offered the practice action, the next round had no selections or feedback, and answering in that round saved feedback. This did not make a real model request.
- `tests/flashcards.test.js` covers generation, invalid edits, editing, one rating per card per round, Again-only review, persistence across a server restart, and creating a second deck, with mocked model responses. The browser flashcard flow has not yet been checked against a live model response.
- The revised browser workspace was visually checked at 1200px and 390px against isolated fixture data. Switching between Quiz and Flashcards, revealing a card answer, and rating Good showed the next card without losing the selected mode. No live model request was made for this check.
- The sidebar layout was checked at 1200px and 390px with isolated fixture data. On mobile, opening the library and selecting a different document closed the chooser and changed the workspace header, generation actions, and empty study state to that document. No live model request was made.
- A later internal-browser pass checked desktop and mobile layouts, quiz answer feedback and missed-question practice, flashcard reveal/rating, document switching, empty-space creation, and the add-document control. It found that saving an edit to the current flashcard left its visible review face stale; the browser now updates that face immediately. The pass showed no horizontal overflow or browser console warnings/errors. It used isolated fixture data and no live model generation.
- The drawer redesign was checked in the internal browser at 1200px and 390px. Both add-control SVGs measured exactly centered in their buttons. Close button, Escape, backdrop click, and document selection closed the drawer; the selected document changed correctly. No UI package was added.
- A fresh 7,013-character document produced 422s with the previous quiz schema: one response did not have exactly three questions, and another had three questions but no exact quote matches. After switching to fixed question fields and source-block IDs, one live generation call for that document validated as three four-option questions with source excerpts found in the text. The user's running server must be restarted to load this change.
- Quote matching proves only that the text appears in the source, not that the question or grading is justified. Build a small repeatable quality evaluation set.
- PDF support needs text extraction and a source-preview step. Larger documents and multiple active documents need section selection or retrieval before model calls.
- The local server binds to `127.0.0.1` and has no authentication. Add auth, storage isolation, deletion, and operational controls before any public deployment.
