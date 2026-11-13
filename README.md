# Adaptive AI Learning Companion

For the current implementation and a new-chat handoff, see [CONTEXT.md](CONTEXT.md).

## Project brief

**Purpose.** Build and release a small, useful AI application while developing demonstrable Applied AI engineering skills. This is a personal software engineering and career development project first. A few real users and their feedback will help guide it; monetization and competing feature-for-feature with existing study tools are not goals.

**Problem.** People can read and collect study material yet struggle to recall, explain, or apply its ideas later. Chatting with an AI assistant about uploaded notes helps, but the learner still has to organize a study session, request worthwhile questions, judge the feedback, and decide what to revisit.

**Product direction.** A subject-independent learning companion that turns a person's material into an active study session: explain or summarize a concept, ask questions that probe understanding, give feedback grounded in the material, and help the learner revisit weak areas. Technical concepts and other subjects should both be possible. Input formats may eventually include notes, PDFs, handwritten pages, and repositories; support for each format is a separate implementation decision.

**First build milestone.** A user can paste a short passage of text, request a concise explanation or summary, answer a few generated questions, and see feedback with references to the passage. The flow should work end to end in a browser. This is a starting slice, not the full product definition.

**What makes the project substantive.** The engineering work should show more than a model call: question and feedback quality, source grounding, failure handling, repeatable evaluation, privacy and security, deployment, and operational visibility as the application grows. Add complexity when it supports a learner need or demonstrates a deliberate engineering trade-off. Document decisions and measured results honestly.

**Early checks.** Try the first flow with varied subjects and real study material. Save examples where a question is trivial, misleading, unsupported, or genuinely reveals a gap. Use those examples to create a small repeatable evaluation set. Observe whether someone finds a session useful enough to finish and return to; do not infer learning improvement from generated output alone.

**Current boundaries.** The exact audience, feature set, stack, AI approach, and infrastructure remain open. The first version does not need every file format, a full progress dashboard, spaced repetition, or complex orchestration. Avoid confidential workplace material in testing and public demonstrations.

**Next steps.** Build the first end-to-end session, test it with several passages, record failures and decisions, then choose the next capability from the evidence. Publish a working demo and a concise technical case study when the application is reliable enough to share.

## Run a saved study space

Requires Node.js 22 or later. Put your OpenAI API key after `OPENAI_API_KEY=` in `.env`, run `npm start`, then open `http://localhost:3000`. Create a study space and add a `.txt` or `.md` document containing 120–20,000 characters. Preview the text, generate a quiz, read a short plain-language overview, and answer three four-option questions. Each question is answered once per round. After finishing, use **Practice missed questions** to retry only the ones you missed, with earlier results saved in history. The selected document is sent to OpenAI once when the quiz is generated; selections and practice rounds are checked locally. Study spaces, documents, questions, selections, and explanations are saved in the ignored local `data/spaces.json` file, so you can return after restarting the app. `npm test` covers the API-backed study flow and persistence with mocked model responses.

The app requires `OPENAI_API_KEY` in the ignored `.env` file and uses the OpenAI API for quiz overviews, questions, answer keys, and explanations. Restart `npm start` after changing the key. `OPENAI_MODEL` can override the default `gpt-4o-mini`. Keep the key on the server; never paste sensitive material into this prototype.

The server saves uploaded document text and study history locally. It sends the selected document text to OpenAI when generating each quiz; quiz selections do not need a model request. The model cites numbered source blocks, and the app derives displayed excerpts from the uploaded text. This ensures the excerpt exists, but does not prove the answer key or explanation is correct. This local prototype has no accounts or deletion UI; remove `data/spaces.json` to erase local study data.

Open **View API request** beside a generated quiz to inspect and copy the JSON body sent to OpenAI. The API key is sent in an authorization header and is never included in this view.
The view also shows token usage reported by the API and an estimated USD cost at standard `gpt-4o-mini` rates. If a different model is configured, usage is shown without a cost estimate until its pricing is added.
Usage and cost remain visible when a generated quiz fails validation, because the API call still occurred.
