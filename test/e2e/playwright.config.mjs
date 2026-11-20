import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /desktop\.spec\.mjs|soak\.spec\.mjs/,
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '../../test-results/desktop.json' }]],
  outputDir: '../../test-results/desktop',
});
