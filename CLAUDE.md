# CLAUDE.md

## Git workflow
- Open regular pull requests, not drafts.
- Merge the PR yourself (squash) once `npm run build`, `npm run lint` and `npm test -- --run` pass. Lint warnings don't block; errors do.

## TypeScript and ESLint
- `typescript` in `package.json` is an alias for `@typescript/typescript6` (the TS 6 API), because typescript-eslint can't use TypeScript 7, which has no JS API yet. The compiler is TypeScript 7 under the alias `@typescript/native`, so `tsc` and the build use 7. Don't "fix" the alias back to `typescript@7`, or ESLint breaks.
- ESLint config is `eslint.config.js`. The React Compiler rules from `eslint-plugin-react-hooks` v7 (`set-state-in-effect`, `refs`, `globals`) are warnings because existing code predates them.
- Merging to `main` deploys to GitHub Pages automatically.

## Tests
- Vitest unit tests live in `tests/`, one file per source module (`tests/<module>.test.ts`). Run them with `npm test -- --run` (plain `npm test` starts watch mode).
- They run locally only; there's no CI for them, and none should be added.
- `tsc -b` type-checks `tests/` too, so the build fails on a broken test file.
- Covered: `src/utils`, `src/ai` (response validation, prompts' user messages, Gemini error mapping and model fallback), `src/services` (backup, including the share/download export; relay client, relay jobs, db), `src/store` (seed and the `StoreProvider` actions), the hooks in `src/hooks` (with the real `StoreProvider`), `src/components`, `src/screens`, `App`, and the relay Worker.
- Not covered: `src/main.tsx` and `Icons`; how things look (jsdom has no layout or CSS).
- Component and screen tests (`*.test.tsx`) import `tests/helpers/ui.tsx`: fixtures, automatic cleanup, the jsdom stubs, `freezeDate` (fixes the clock without faking timers) and `renderStored` (renders inside a real `StoreProvider` and gives back `store()`). A file using `renderStored` also needs `vi.mock('idb-keyval', () => import('./helpers/idb'))`.
- A confirmed bug that isn't fixed yet is an `it.fails('BUG: ...')` test stating the correct behavior. It turns red once the bug is fixed; then change it to a plain `it`.
- Hook tests (`*.test.tsx`) start with `// @vitest-environment jsdom` and use `renderHook` from `@testing-library/react`, wrapped in `StoreProvider`. Shared fetch/Gemini/relay fakes are in `tests/helpers/network.ts`. To wake a waiting relay request without the 5-second timer, dispatch `window`'s `online` event.
- The relay Worker's tests are in `worker/tests/`, and the root `npm test -- --run` runs them too. `cloudflare:workers` is mocked, Durable Object storage is faked in memory, and upstream calls go to a stubbed `fetch`. `tsc -b` doesn't check them; run `npx tsc -p worker/tsconfig.tests.json` from the root after changing them or `worker/src`.
- Network calls are tested by stubbing `fetch` with `vi.stubGlobal`; IndexedDB by mocking `idb-keyval` (see `tests/db.test.ts`). No real API calls.
- When you change a covered module, update or add its tests in the same PR.
