
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000, // 60 seconds
  workers: 1,
  fullyParallel: false,
  use: {
    headless: false, // Show the browser window
    trace: 'on-first-retry',
  },
});
