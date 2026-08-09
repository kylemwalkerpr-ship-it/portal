/**
 * gsc-connect-modal.spec.ts
 *
 * E2E for the GSC connect modal (Command Center → Systems → Connect Search
 * Console): mocks `window.open` (Google forbids embedding the consent screen
 * in an iframe — X-Frame-Options: DENY — so the flow opens a popup; the test
 * fakes the popup handle) and the `/api/content-studio/gsc/connect` status
 * endpoint, then asserts that reaching the CONNECTED phase fires the radar
 * refresh: a fresh POST to `/api/seo-factory/war-room` via the single refresh
 * path `modal.onConnected → loadGscStatus → connected false→true transition →
 * loadHealth + loadRadar`.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 * The Command Center lives at /dashboard/admin/content and requires a Clerk
 * session with the **admin** role. Set before running:
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *
 * Without these the test is marked `test.skip` (same convention as
 * consultant-settings.spec.ts). Run: npx playwright test --project=chromium
 *
 * @see https://clerk.com/docs/testing/playwright
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'

/** Check if Clerk test credentials are available. */
function hasClerkCredentials(): boolean {
  return !!(process.env.CLERK_TEST_EMAIL && process.env.CLERK_TEST_PASSWORD)
}

/**
 * Attempt Clerk browser sign-in as an admin via the admin sign-in page.
 * Returns a logged-in Page (or null if sign-in failed).
 */
async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  const page = await browser.newPage()
  try {
    await page.goto(`${BASE}/sign-in/admin?return_to=/dashboard/admin/content`, {
      waitUntil: 'networkidle',
    })

    const emailInput = page.locator('input[type="email"], input[name="identifier"]')
    await emailInput.waitFor({ state: 'visible', timeout: 15000 })
    await emailInput.fill(process.env.CLERK_TEST_EMAIL!)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(2000)

    const passwordInput = page.locator('input[type="password"]')
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(process.env.CLERK_TEST_PASSWORD!)
      await page.locator('button[type="submit"]').first().click()
    }

    await page.waitForURL(/\/dashboard/, { timeout: 20000 })
    return page
  } catch {
    await page.close()
    return null
  }
}

// ── The test ───────────────────────────────────────────────────────────────

test.describe('GSC connect modal (admin)', () => {
  test('CONNECTED phase fires the radar refresh', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mocks ──────────────────────────────────────────────────────────────
    // 1) Fake the consent popup so no real window ever opens. The modal's
    //    startFlow() checks the return of window.open: a truthy handle keeps
    //    the flow in the 'waiting' phase (a null would jump to 'blocked').
    await page.addInitScript(() => {
      const fakePopup = { closed: false, close() { (this as { closed: boolean }).closed = true } }
      window.open = () => fakePopup as unknown as Window
    })

    // 2) Status endpoint: NOT connected until the test flips it after
    //    "Continue to Google", simulating the OAuth consent completing.
    let connected = false
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          connected
            ? {
                connected: true, live: true, mode: 'oauth',
                email: 'estate@yousafeconsultancy.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: null,
              }
            : {
                connected: false, live: false, mode: null, email: null, siteUrl: null,
                connectedAt: null,
                missing: ['client_id', 'client_secret', 'refresh_token', 'site_url'],
                error: null,
              },
        ),
      })
    })

    // Count radar refreshes — the observable of the connect→refresh path.
    let warRoomHits = 0
    page.on('request', (req) => {
      if (req.url().includes('/api/seo-factory/war-room')) warRoomHits++
    })

    // ── Navigate to the Command Center ─────────────────────────────────────
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    const ccButton = page.getByRole('button', { name: /Command Center/ }).first()
    await ccButton.waitFor({ state: 'visible', timeout: 30000 })
    await ccButton.click()

    // Go to the Systems tab.
    const systemsTab = page.locator('button[title="Open Systems"]')
    await systemsTab.waitFor({ state: 'visible', timeout: 30000 })
    await systemsTab.click()

    // Open the connect modal from the Systems card.
    const connectButton = page.getByRole('button', { name: /Connect Search Console \(OAuth\)/ })
    await connectButton.waitFor({ state: 'visible', timeout: 30000 })
    await connectButton.click()

    // Ready phase → Continue to Google (popup is faked → 'waiting').
    await page.getByRole('button', { name: /Continue to Google/ }).click()
    await expect(page.getByText(/Waiting for Google consent/)).toBeVisible({ timeout: 10000 })

    // ── The consent lands: flip the status endpoint ────────────────────────
    // The modal's own 2s poll detects the connection (no manual re-check
    // click — that would race the interval and could land after the modal
    // auto-closes 2.2s into the CONNECTED phase).
    const hitsBefore = warRoomHits
    connected = true

    // The CONNECTED phase appears (modal auto-closes ~2.2s later, so poll
    // fast for it).
    await expect
      .poll(() => page.getByText(/CONNECTED · OAUTH/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // And the radar refresh fired: a fresh war-room POST after the connect.
    await expect.poll(() => warRoomHits, { timeout: 10000 }).toBeGreaterThan(hitsBefore)
  })
})
