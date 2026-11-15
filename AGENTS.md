# Project context for Codex

Read `README.md` for the product brief and setup, then `CONTEXT.md` for the current implementation, decisions, and known gaps before changing the app.

After a consequential behavior or architecture change, update `CONTEXT.md` so a new chat can pick up the project. Run `npm test` after changing JavaScript. Keep `.env` and API keys out of commits.

## Code placement for feature work

- Keep `app/api/[...path]/route.js` as the Next.js API entrypoint and `app/api/_server/index.js` as the request dispatcher and top-level error handler. Put study-space and document routes in `app/api/_server/routes/spaces.js`, quiz routes in `app/api/_server/routes/quizzes.js`, flashcard routes in `app/api/_server/routes/flashcards.js`, and compatibility routes in `app/api/_server/routes/legacy.js`.
- A route handler returns a Web `Response` when its route matches and `null` otherwise. `app/api/_server/http.js` owns request JSON parsing, JSON responses, and the common generated-result response. Keep route-specific validation and saved-state changes in the relevant route module.
- Keep OpenAI request construction and schemas in `app/api/_server/model.js`, source and generated-content validation in `app/api/_server/study.js`, and local JSON persistence in `app/api/_server/store.js`. Change these shared modules only for responsibilities they own.
- Keep Next route files and global CSS at the root of `app/`. Study UI implementation, API client, and browser response types live together in `app/_study/`; `app/_study/study-app.tsx` owns shared selection and refresh state, while library, quiz, and flashcard views own their interactions. Keep browser code in TypeScript and leave API keys server-side.
- Put behavior and API flow tests in `tests/`, named for the workflow they cover. Exercise `app/api/_server/index.js` through the HTTP test adapter in `tests/server.js`. Keep tests focused on externally visible behavior and saved-data compatibility.
- Before adding a feature, trace its browser action, route, model call if any, validation, and saved state. Put each change at its existing owner. Create a new directory only when multiple related files have a real reason to change together; avoid empty or speculative layers.
- Preserve the documented legacy API routes and saved-data compatibility unless a deliberate migration removes them. After moving code, update imports and affected documentation, then run `npm test`.

For a broader restructuring review, invoke the installed `untangle-codebase` skill. Its output informs a concrete plan; these placement rules remain the standing guidance for ordinary feature work.
