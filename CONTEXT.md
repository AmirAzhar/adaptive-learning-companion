# Development handoff

Updated 2026-11-12. This file records the current state for a new chat. `README.md` holds the product brief and run instructions; the code is the source of truth when either document is stale.

## What exists

- A local browser app at `http://localhost:3000` built with Node.js 22 and plain HTML, CSS, and JavaScript. There are no runtime package dependencies.
- A learner pastes 120–6,000 characters, selects a concise summary or plain explanation, and starts a session. One OpenAI Responses API call returns the overview and three questions.
- Each **Check answer** action makes one separate OpenAI call. It returns a support level, feedback, and a source quote. A full three-answer session makes four model calls.
- The server checks that every generated quote appears in the pasted passage. Invalid quotes produce a retry message. The API request panel still shows usage and cost for a completed model call whose quote failed validation.
- **View API request** shows and copies the JSON body sent for that step. The API key is only in the server-side authorization header.
- The request panel shows API-reported input, cached input, output, and total tokens. It estimates USD cost using standard `gpt-4o-mini` rates. Other models show usage without a cost estimate.

## Work completed

1. Started from the README project brief and built the first browser flow with a small Node server.
2. Added `.env` loading, then removed the temporary local text-matching demo so summaries, questions, and feedback use the OpenAI API.
3. Added copyable request bodies for both session generation and answer feedback.
4. Added per-call token usage and estimated cost, including when a model result fails quote validation.

## Key files and boundaries

| File | Responsibility |
| --- | --- |
| `server.js` | Local HTTP server, input checks, routes, and response handling |
| `model.js` | OpenAI request bodies, structured output schemas, usage, and cost calculation |
| `study.js` | Source, session, feedback, and quote validation |
| `public/` | Browser interface and copyable request panels |
| `study.test.js` | API-route tests with mocked model responses and cost checks |

`npm start` loads the ignored `.env` file. `OPENAI_API_KEY` is required; `OPENAI_MODEL` can override the default `gpt-4o-mini`. The server does not persist passages or answers, and it sends them to OpenAI for processing. Never commit `.env` or test with confidential workplace material.

## Decisions so far

1. Keep the first slice small: pasted text and a complete study flow, without accounts, file uploads, progress tracking, or orchestration.
2. Use the model for free-text feedback. A generated answer key plus local word matching would be unreliable for paraphrases and misconceptions. Batched grading could reduce call count later, but would delay feedback until all answers are submitted.
3. Use Structured Outputs for predictable response shapes and validate quoted evidence against the source in application code.
4. Show the actual request body and per-call usage for developer transparency. Cost is an estimate based on published rates, not a bill from OpenAI.

## Verification and known gaps

- `npm test` checks science and database passages with mocked OpenAI responses, source-quote rejection, and cost calculation. Live browser checks generated questions and feedback for both subjects and confirmed the request and cost panels.
- A model can still return a quote that is not an exact passage excerpt. The app rejects it and asks the learner to retry, but the paid call has already occurred. Improving citation reliability is a concrete next quality issue.
- A verified quote proves that text exists in the passage, not that the model's interpretation or grading is correct. Question quality and feedback quality need a small repeatable evaluation set before broader claims.
- There is no deployment or persistent session history yet. The app runs locally and `.env` stays untracked.

## Starting a new chat

Open the repository in Codex and describe the next task. `AGENTS.md` directs the new chat to this file and the README. If needed, say: “Read `CONTEXT.md` and continue from the current study-session implementation.”
