# Development handoff

Updated 2026-11-13. `README.md` holds the product brief and run instructions. The code is the source of truth if these notes become stale.

## What exists

- A local Node.js 22 browser app at `http://localhost:3000`, with plain HTML, CSS, and JavaScript and no runtime package dependencies.
- A learner creates a named **study space**, adds one or more `.txt` or `.md` documents, previews their text, and chooses one document for a **study session**. Each document must contain 120–20,000 characters. Documents are currently studied one at a time.
- Starting a session makes one OpenAI Responses API call for a two-to-four-sentence plain-language overview of the main ideas and three questions. Each answer makes one separate call for feedback and a source quote. There is no overview-style choice.
- Study spaces, document text, sessions, answers, feedback, request bodies, and usage are saved locally in ignored `data/spaces.json`. The app reopens the last space from the URL hash, or the first space. Saved data survives server restarts.
- Every generated quote must appear in the document text. An invalid quote produces a retry message while still showing API usage and estimated cost for that call. The API key remains server-side.
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

1. A **study space** is the lasting container. A **study session** is one generated round of three questions using one document in that space. A learner can start more sessions in the same space.
2. Browser file selection reads `.txt` and `.md` as text and posts the text to the local server. The server validates the extension and length and saves an immutable copy. The initial 6,000-character cap rejected a real 7,013-character React lifecycle note, so the bounded limit is now 20,000 characters. There is no PDF extraction, cross-document retrieval, account system, or hosted deployment yet.
3. The store is a single local JSON file with writes serialized within the process and replaced atomically. This is suitable for the local single-server prototype, not multi-instance deployment. `STUDY_DATA_DIR` can override the storage directory for tests.
4. Saved runs refer to immutable document IDs, so adding a document later does not change past questions or feedback. Reattempts are allowed and saved on the same question.
5. OpenAI requests set `store: false`. The app still saves source text and the request body locally; users should not test with confidential workplace material. There is no per-space delete UI yet. Deleting `data/spaces.json` erases all local study data.
6. The prior `/api/session` and `/api/answer` routes remain for compatibility and their existing tests, but the browser uses `/api/spaces` routes.
7. Removed the "Start with" dropdown because summary and explanation had no meaningful difference beyond a model style label. New runs show one "Main ideas" overview. Previously saved runs remain readable.

## Verification and known gaps

- `npm test` passes with mocked OpenAI responses, including create/upload/study/answer/restart/reopen, a 7,100-character document, and invalid-document cases. A browser upload of an 8,281-character synthetic Markdown file succeeded after the limit fix; the earlier short-document flow was also checked live through feedback and reload.
- Quote matching proves only that the text appears in the source, not that the question or grading is justified. Build a small repeatable quality evaluation set.
- PDF support needs text extraction and a source-preview step. Larger documents and multiple active documents need section selection or retrieval before model calls.
- The local server binds to `127.0.0.1` and has no authentication. Add auth, storage isolation, deletion, and operational controls before any public deployment.
