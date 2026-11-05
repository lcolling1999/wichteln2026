import { defineConfig, devices } from '@playwright/test';

/**
 * Root Playwright E2E Configuration pointing to e2e test suite.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'tier1-features/**/*.spec.ts',
    'tier2-boundaries/**/*.spec.ts',
    'tier3-interactions/**/*.spec.ts',
    'tier4-scenarios/**/*.spec.ts',
  ],
  timeout: 45000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
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
  webServer: [
    {
      command: 'npm.cmd run server:dev',
      url: 'http://localhost:3000/api/status',
      reuseExistingServer: !process.env.CI,
      cwd: '.',
      timeout: 30000,
    },
    {
      command: 'npm.cmd run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '.',
      timeout: 30000,
    },
  ],
});
