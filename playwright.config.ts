import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 1,
  reporter: [['html', { outputFolder: 'tests/e2e/report' }], ['list']],

  use: {
    baseURL: 'http://localhost:3402',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // Start the server before E2E tests
  webServer: {
    command: 'npm run dev:server',
    url: 'http://localhost:3402',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
