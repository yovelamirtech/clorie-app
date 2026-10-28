# CLAUDE.md

## Git workflow
- Open regular pull requests, not drafts.
- Merge the PR yourself (squash) once `npm run build` and `npm test -- --run` pass. The project has no linter; the build (`tsc -b && vite build`) and the unit tests are the checks.
- Merging to `main` deploys to GitHub Pages automatically.

## Tests
- Vitest unit tests live in `tests/`, one file per source module (`tests/<module>.test.ts`). Run them with `npm test -- --run` (plain `npm test` starts watch mode).
- They run locally only; there's no CI for them, and none should be added.
- `tsc -b` type-checks `tests/` too, so the build fails on a broken test file.
- Covered: `src/utils`, `src/ai` (response validation, prompts' user messages, Gemini error mapping and model fallback), `src/services` (backup, including the share/download export; relay client, relay jobs, db), `src/store` (seed and the `StoreProvider` actions), the hooks in `src/hooks` (with the real `StoreProvider`), and the relay Worker.
- Not covered: React components and screens.
- Hook tests (`*.test.tsx`) start with `// @vitest-environment jsdom` and use `renderHook` from `@testing-library/react`, wrapped in `StoreProvider`. Shared fetch/Gemini/relay fakes are in `tests/helpers/network.ts`. To wake a waiting relay request without the 5-second timer, dispatch `window`'s `online` event.
- The relay Worker's tests are in `worker/tests/`, and the root `npm test -- --run` runs them too. `cloudflare:workers` is mocked, Durable Object storage is faked in memory, and upstream calls go to a stubbed `fetch`. `tsc -b` doesn't check them; run `npx tsc -p worker/tsconfig.tests.json` from the root after changing them or `worker/src`.
- Network calls are tested by stubbing `fetch` with `vi.stubGlobal`; IndexedDB by mocking `idb-keyval` (see `tests/db.test.ts`). No real API calls.
- When you change a covered module, update or add its tests in the same PR.
