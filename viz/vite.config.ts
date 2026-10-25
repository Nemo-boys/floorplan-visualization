import { defineConfig } from 'vitest/config';

export default defineConfig({
  // /api goes to the AegisPlan server (aegis/), when it runs. FI_OFFLINE=1 (the e2e tests) keeps the design's stand-in.
  server: {
    port: 5173,
    strictPort: true,
    proxy: process.env.FI_OFFLINE ? undefined : { '/api': 'http://127.0.0.1:8000' }
  },
  preview: { port: 5173, strictPort: true },
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts'],
    passWithNoTests: true
  }
});
