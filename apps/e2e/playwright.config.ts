import { defineConfig, devices } from '@playwright/test';

// Runs against locally-running dev servers (frontend :5173, backend :4000) and Postgres
// (docker compose up -d postgres) — not started by this config itself. See
// docs/stage-6-testing-qa.md for the exact pre-flight commands.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 'list' locally (fast, no report dir to clean up); 'html' on CI so a failure has an
  // uploadable report - see .github/workflows/e2e.yml's "Upload Playwright report" step.
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
