// SPDX-License-Identifier: GPL-3.0-or-later
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'webpack.config.mjs', 'playwright.config.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // e2e specs drive the page via `(window as any)` evaluate hooks, so `any`
    // is idiomatic here; they run in the browser context (browser globals).
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
