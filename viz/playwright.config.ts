import { defineConfig, devices } from '@playwright/test';

// E2E_TARGET=reference runs the same tests against design/reference.html.
const reference = process.env.E2E_TARGET === 'reference';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: reference ? 'http://localhost:5174/reference.html' : 'http://localhost:5173/?look=reference',
    reducedMotion: 'reduce'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: reference
    ? {
        command: 'node tools/serve-reference.mjs',
        url: 'http://localhost:5174/reference.html',
        reuseExistingServer: true
      }
    : { command: 'FI_OFFLINE=1 VITE_FI_LOOK=reference npx vite', url: 'http://localhost:5173/', reuseExistingServer: true }
});
