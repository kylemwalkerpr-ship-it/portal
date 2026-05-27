import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

/** Load auth credentials from .env.test */
/* Clerk test keys: https://clerk.com/docs/testing/playwright */
dotenv.config({ path: '.env.test' })

/**
 * Playwright E2E test configuration for YouSafe Portal.
 *
 * Tests run against the local dev server (assumes `pnpm dev` is running).
 * Auth-gated tests (consultant dashboard) require Clerk credentials.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? {
        command: 'pnpm dev',
        url: 'http://localhost:3002',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
      }
    : undefined,
})
