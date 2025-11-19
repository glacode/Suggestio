
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60000, // 60 seconds
  use: {
    headless: false, // Show the browser window
  },
});
