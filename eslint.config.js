import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

// typescript-eslint needs the TypeScript 6 API, so `typescript` in package.json is the
// @typescript/typescript6 compat package; `tsc` (the build) comes from TypeScript 7 via @typescript/native.
export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'worker/node_modules', 'worker/.wrangler', 'worker/worker-configuration.d.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      // `const { key: _dropped, ...rest } = obj` is how the code drops a key.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    rules: {
      // React Compiler rules (react-hooks v7). The existing code predates them; warnings until it's refactored.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/globals': 'warn',
    },
  },
  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Tests export helpers and fixtures alongside components; Fast Refresh doesn't apply to them.
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
