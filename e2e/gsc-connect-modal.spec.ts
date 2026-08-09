/**
 * gsc-connect-modal.spec.ts
 *
 * E2E for the GSC connect modal (Command Center → Systems → Connect Search
 * Console). Three connect paths are exercised:
 *
 *   1. OAuth — mocks `window.open` (Google forbids embedding the consent
 *      screen in an iframe — X-Frame-Options: DENY — so the flow opens a
 *      popup; the test fakes the popup handle) and the status endpoint, then
 *      asserts reaching CONNECTED fires the radar refresh.
 *   2. Service account — switches to the Service account tab, pastes a JSON
 *      key + site URL, mocks the POST, and asserts CONNECTED · SERVICE_ACCOUNT
 *      fires the radar refresh.
 *   3. Service-account reconnect — starts connected-but-broken (live:false,
 *      mode service_account), opens the modal in reconnect mode, swaps the
 *      key, and asserts the live-heal (live false→true) fires the radar
 *      refresh even though `connected` never changed.
 *
 * All three assert the single refresh path end-to-end:
 * `modal.onConnected → loadGscStatus → (connected false→true | live
 * false→true) transition → loadHealth + loadRadar` (observable as a fresh
 * POST to `/api/seo-factory/war-room`).
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

/**
 * Drive the UI to the connect modal: open the studio, open the Command
 * Center, switch to the Systems tab, and click the Systems-card CTA.
 * When `reconnect` is true the card shows the broken-token Re-connect CTA
 * instead of the fresh Connect CTA.
 */
async function navigateToConnectModal(page: Page, opts: { reconnect?: boolean } = {}): Promise<void> {
  await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

  const ccButton = page.getByRole('button', { name: /Command Center/ }).first()
  await ccButton.waitFor({ state: 'visible', timeout: 30000 })
  await ccButton.click()

  const systemsTab = page.locator('button[title="Open Systems"]')
  await systemsTab.waitFor({ state: 'visible', timeout: 30000 })
  await systemsTab.click()

  const cta = opts.reconnect
    ? page.getByRole('button', { name: /Re-connect \(re-authorize\)/ })
    : page.getByRole('button', { name: /Connect Search Console \(OAuth\)/ })
  await cta.waitFor({ state: 'visible', timeout: 30000 })
  await cta.click()
}

/** Attach a counter for radar refreshes (the observable of the refresh path). */
function countWarRoomRefreshes(page: Page): { hits: () => number } {
  let hits = 0
  page.on('request', (req) => {
    if (req.url().includes('/api/seo-factory/war-room')) hits++
  })
  return { hits: () => hits }
}

// ── The tests ──────────────────────────────────────────────────────────────

test.describe('GSC connect modal (admin)', () => {
  test('OAuth: CONNECTED phase fires the radar refresh', async ({ browser }) => {
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

    const warRoom = countWarRoomRefreshes(page)

    await navigateToConnectModal(page)

    // Ready phase → Continue to Google (popup is faked → 'waiting').
    await page.getByRole('button', { name: /Continue to Google/ }).click()
    await expect(page.getByText(/Waiting for Google consent/)).toBeVisible({ timeout: 10000 })

    // ── The consent lands: flip the status endpoint ────────────────────────
    // The modal's own 2s poll detects the connection (no manual re-check
    // click — that would race the interval and could land after the modal
    // auto-closes 2.2s into the CONNECTED phase).
    const hitsBefore = warRoom.hits()
    connected = true

    // The CONNECTED phase appears (modal auto-closes ~2.2s later, so poll
    // fast for it).
    await expect
      .poll(() => page.getByText(/CONNECTED · OAUTH/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // And the radar refresh fired: a fresh war-room POST after the connect.
    await expect.poll(() => warRoom.hits(), { timeout: 10000 }).toBeGreaterThan(hitsBefore)
  })

  test('Service account: pasted key + URL connect fires the radar refresh', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mocks ──────────────────────────────────────────────────────────────
    // Method-aware status endpoint: the SA tab POSTs the pasted key + site
    // URL (we accept it and flip `connected`), while the parent's GET polls
    // (initial status + the post-connect transition) serve the current state.
    let connected = false
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        const body = (request.postDataJSON?.() ?? {}) as Record<string, unknown>
        const ok =
          typeof body.siteUrl === 'string' &&
          typeof body.serviceAccountKey === 'string' &&
          body.serviceAccountKey.includes('private_key')
        if (ok) connected = true
        await route.fulfill({
          status: ok ? 200 : 400,
          contentType: 'application/json',
          body: JSON.stringify(
            ok
              ? {
                  connected: true, live: true, mode: 'service_account',
                  siteUrl: body.siteUrl,
                  email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                  missing: [], error: null,
                }
              : { error: 'No service account key available' },
          ),
        })
        return
      }
      // GET — parent loadGscStatus polls + modal initial status.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          connected
            ? {
                connected: true, live: true, mode: 'service_account',
                email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: null,
              }
            : {
                connected: false, live: false, mode: null, email: null, siteUrl: null,
                connectedAt: null, missing: ['site_url'], error: null,
              },
        ),
      })
    })

    const warRoom = countWarRoomRefreshes(page)

    await navigateToConnectModal(page)

    // Switch to the Service account tab (exact match — the connect CTA below
    // also contains "service account").
    await page.getByRole('button', { name: 'Service account', exact: true }).click()

    // Paste the JSON key into the textarea and set the property URL.
    // Scope via getByRole('dialog').last() so the locators stay unambiguous
    // even if another dialog mounts elsewhere in the studio tree.
    const dialog = page.getByRole('dialog').last()
    const SA_KEY = JSON.stringify({
      type: 'service_account',
      project_id: 'yousafe-gsc-reader',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
      client_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
    })
    await dialog.locator('textarea').fill(SA_KEY)
    await dialog.locator('input').fill('sc-domain:yousafeconsultancy.com')

    // ── Connect: the POST returns connected → onConnected fires once ───────
    const hitsBefore = warRoom.hits()
    await page.getByRole('button', { name: /Connect service account/ }).click()

    // CONNECTED · SERVICE_ACCOUNT appears (auto-closes ~2.2s later, so poll
    // fast for it).
    await expect
      .poll(() => page.getByText(/CONNECTED · SERVICE_ACCOUNT/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // And the radar refresh fired via the same single refresh path.
    await expect.poll(() => warRoom.hits(), { timeout: 10000 }).toBeGreaterThan(hitsBefore)
  })

  test('Service account reconnect: swapping a broken key fires the live-heal radar refresh', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL and CLERK_TEST_PASSWORD (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mocks ──────────────────────────────────────────────────────────────
    // Method-aware status endpoint simulating a connected-but-broken SA
    // connection: connected=true, live=false (revoked key) until a valid
    // replacement key is POSTed, which heals live→true while connected stays
    // true. The command center's live-heal transition (`!prev?.live &&
    // data.live`) must fire the radar refresh even though `connected` never
    // changed.
    let live = false
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        const body = (request.postDataJSON?.() ?? {}) as Record<string, unknown>
        const ok =
          typeof body.siteUrl === 'string' &&
          typeof body.serviceAccountKey === 'string' &&
          body.serviceAccountKey.includes('private_key')
        if (ok) live = true
        await route.fulfill({
          status: ok ? 200 : 400,
          contentType: 'application/json',
          body: JSON.stringify(
            ok
              ? {
                  connected: true, live: true, mode: 'service_account',
                  siteUrl: body.siteUrl,
                  email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                  missing: [], error: null,
                }
              : { error: 'No service account key available' },
          ),
        })
        return
      }
      // GET — parent loadGscStatus polls + modal initial status.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          live
            ? {
                connected: true, live: true, mode: 'service_account',
                email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: null,
              }
            : {
                connected: true, live: false, mode: 'service_account',
                email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: 'invalid_grant',
              },
        ),
      })
    })

    const warRoom = countWarRoomRefreshes(page)

    // Systems card shows the broken-token state → Re-connect CTA opens the
    // modal in reconnect mode (no already-connected short-circuit).
    await navigateToConnectModal(page, { reconnect: true })

    // Switch to the Service account tab and paste a replacement key.
    // The property URL is prefilled from the stored siteUrl.
    await page.getByRole('button', { name: 'Service account', exact: true }).click()

    const dialog = page.getByRole('dialog').last()
    const REPLACEMENT_KEY = JSON.stringify({
      type: 'service_account',
      project_id: 'yousafe-gsc-reader',
      private_key: '-----BEGIN PRIVATE KEY-----\nNEWKEY\n-----END PRIVATE KEY-----\n',
      client_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
    })
    await dialog.locator('textarea').fill(REPLACEMENT_KEY)
    await expect(dialog.locator('input')).toHaveValue('sc-domain:yousafeconsultancy.com')

    // ── Swap the key: POST heals live → onConnected → live-heal refresh ────
    const hitsBefore = warRoom.hits()
    await page.getByRole('button', { name: /Connect service account/ }).click()

    // CONNECTED · SERVICE_ACCOUNT appears (auto-closes ~2.2s later, so poll
    // fast for it).
    await expect
      .poll(() => page.getByText(/CONNECTED · SERVICE_ACCOUNT/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // And the live-heal fired the radar refresh even though `connected` was
    // already true — a fresh war-room POST after the key swap.
    await expect.poll(() => warRoom.hits(), { timeout: 10000 }).toBeGreaterThan(hitsBefore)
  })
})
