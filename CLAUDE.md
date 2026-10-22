# CLAUDE.md

## Git workflow
- Open regular pull requests, not drafts.
- Merge the PR yourself (squash) once `npm run build` and `npm test -- --run` pass. The project has no linter; the build (`tsc -b && vite build`) and the unit tests are the checks.
- Merging to `main` deploys to GitHub Pages automatically.

## Tests
- Vitest unit tests live in `tests/`, one file per source module (`tests/<module>.test.ts`). Run them with `npm test -- --run` (plain `npm test` starts watch mode).
- They run locally only; there's no CI for them, and none should be added.
- `tsc -b` type-checks `tests/` too, so the build fails on a broken test file.
- Covered: `src/utils`, `src/ai` (response validation, prompts' user messages, Gemini error mapping and model fallback), `src/services` (backup, relay client, relay jobs, db), `src/store/seed`.
- Not covered: React components, screens and hooks (`src/hooks`, `src/store/store.tsx`), and the relay Worker in `worker/` (its own package).
- Network calls are tested by stubbing `fetch` with `vi.stubGlobal`; IndexedDB by mocking `idb-keyval` (see `tests/db.test.ts`). No real API calls.
- When you change a covered module, update or add its tests in the same PR.
