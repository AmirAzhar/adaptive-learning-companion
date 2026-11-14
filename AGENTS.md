# Project context for Codex

Read `README.md` for the product brief and setup, then `CONTEXT.md` for the current implementation, decisions, and known gaps before changing the app.

After a consequential behavior or architecture change, update `CONTEXT.md` so a new chat can pick up the project. Run `npm test` after changing JavaScript. Keep `.env` and API keys out of commits.

## Code placement for feature work

- Keep `server/index.js` as the HTTP entrypoint, route dispatcher, static-file server, and top-level error handler. Put study-space and document routes in `server/routes/spaces.js`, quiz routes in `server/routes/quizzes.js`, flashcard routes in `server/routes/flashcards.js`, and compatibility routes in `server/routes/legacy.js`.
- A route handler returns `true` after responding and `false` when its route does not match. `server/http.js` owns request JSON parsing, JSON responses, and the common generated-result response. Keep route-specific validation and saved-state changes in the relevant route module.
- Keep OpenAI request construction and schemas in `server/model.js`, source and generated-content validation in `server/study.js`, and local JSON persistence in `server/store.js`. Change these shared modules only for responsibilities they own.
- Browser markup, styles, and behavior live in `public/`. The current browser state and rendering are in `public/app.js`; place related behavior beside its existing quiz, flashcard, or library functions. Split a browser module only when it has a clear state and call interface, and update static serving if it adds a file.
- Put behavior and API flow tests in `tests/`, named for the workflow they cover. Import the server through `server/index.js`. Keep tests focused on externally visible behavior and saved-data compatibility.
- Before adding a feature, trace its browser action, route, model call if any, validation, and saved state. Put each change at its existing owner. Create a new directory only when multiple related files have a real reason to change together; avoid empty or speculative layers.
- Preserve the documented legacy API routes and saved-data compatibility unless a deliberate migration removes them. After moving code, update imports and affected documentation, then run `npm test`.

For a broader restructuring review, invoke the installed `untangle-codebase` skill. Its output informs a concrete plan; these placement rules remain the standing guidance for ordinary feature work.
