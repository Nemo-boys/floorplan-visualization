import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // The specification and generated output are never linted.
    ignores: [
      'node_modules/',
      'dist/',
      'design/',
      'reference-src/',
      'contracts/',
      'samples/',
      'tools/',
      'tests/golden/*.json',
      'tests/visual/reference/',
      'tests/visual/output/',
      'tests/visual/diff/',
      'playwright-report/',
      'test-results/'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/**', '*.config.ts', '*.config.js'],
    languageOptions: { globals: { ...globals.node } }
  }
);
