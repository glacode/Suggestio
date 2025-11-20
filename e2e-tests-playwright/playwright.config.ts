
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000, // 60 seconds
  use: {
    headless: process.env.CI ? true : false, // Run headless in CI, non-headless locally
    trace: 'on-first-retry',
  },
});
