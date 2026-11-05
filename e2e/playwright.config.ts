import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration for Wichteln 24 Kollegen.
 * 
 * Configured specifically for Chromium to support Chrome DevTools Protocol (CDP)
 * WebAuthn virtual authenticator emulation (CTAP2, resident credentials, auto-verification).
 */
export default defineConfig({
  testDir: '.',
  testMatch: [
    'tier1-features/**/*.spec.ts',
    'tier2-boundaries/**/*.spec.ts',
    'tier3-interactions/**/*.spec.ts',
    'tier4-scenarios/**/*.spec.ts',
  ],
  /* Maximum time one test can run */
  timeout: 45000,
  expect: {
    timeout: 5000,
  },
  /* Run tests sequentially to preserve deterministic WebAuthn authenticators & SQLite state */
  fullyParallel: false,
  workers: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* Reporter configuration */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  /* Shared settings for all projects */
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    /* Collect trace when retrying the failed test */
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    /* Allow permissions required for sensors and clipboard */
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Pixel 7'],
        hasTouch: true,
      },
    },
  ],
  /* Run local dev server before starting the tests */
  webServer: [
    {
      command: 'npm.cmd run server:dev',
      url: 'http://localhost:3000/api/status',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 30000,
    },
    {
      command: 'npm.cmd run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 30000,
    },
  ],
});
