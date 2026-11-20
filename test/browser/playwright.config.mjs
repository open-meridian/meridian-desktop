import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /pages\.spec\.mjs/,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: '../../test-results/browser',
  use: { browserName: 'chromium', ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) },
});
