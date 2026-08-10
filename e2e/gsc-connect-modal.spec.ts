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
 *   4. OAuth reconnect — starts connected-but-broken (live:false, mode oauth),
 *      opens the modal in reconnect mode, re-runs Google consent (faked
 *      popup), and asserts the modal waits for the live-heal before showing
 *      CONNECTED and firing the radar refresh.
 *   5. Mode-chip surfacing — connects via the Service account tab from the
 *      studio composer banner, then asserts the SERVICE_ACCOUNT mode chip
 *      surfaces in BOTH the composer banner ("GSC token is failing") and the
 *      command-center Systems card (CONNECTED + TOKEN FAILURE) — the exact
 *      mode label that tells teams which GSC path is live without opening the
 *      modal.
 *
 * All five assert the single refresh path end-to-end:
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
 *     CLERK_SECRET_KEY=sk_live_...            (Backend API — for sign-in tokens)
 *
 * All three are required: `loginAsAdmin` resolves the test user and creates a
 * one-time sign-in token via the Backend API (bypassing the multi-step form
 * and email OTP). `scripts/provision-e2e-admin.mjs` provisions this admin and
 * wires all three into the gitignored `.env.test`.
 *
 * Without them the test is marked `test.skip` (same convention as
 * consultant-settings.spec.ts). Run: npx playwright test --project=chromium
 *
 * @see https://clerk.com/docs/testing/playwright
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'

/** Check if Clerk test credentials are available. */
function hasClerkCredentials(): boolean {
  return !!(process.env.CLERK_TEST_EMAIL && process.env.CLERK_TEST_PASSWORD && process.env.CLERK_SECRET_KEY)
}

/**
 * Sign in as admin using Clerk's Sign-In Token API.
 *
 * Creates a one-time sign-in token via the Backend API, then navigates the
 * browser to `/sign-in/student?__clerk_ticket=<token>&return_to=…` — the
 * exact path convention this app's `<SignIn routing="path"
 * path="/sign-in/student">` consumes (verified empirically: `__session` is
 * set and the redirect lands on the return_to target). This bypasses the
 * multi-step login form, email OTP, and any other factor the production
 * Clerk instance requires.
 *
 * Returns a logged-in Page or null if sign-in failed.
 *
 * @see https://clerk.com/docs/reference/backend-api/tag/Sign-In-Tokens
 */
async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  const page = await browser.newPage()
  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
    // 1. Resolve the Clerk user id from the test email.
    const userRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(process.env.CLERK_TEST_EMAIL!)}`,
      { headers: clerkHeaders },
    )
    if (!userRes.ok) {
      console.error(`[loginAsAdmin] user lookup returned ${userRes.status}`)
      await page.close()
      return null
    }
    const users = (await userRes.json()) as Array<{ id?: string }>
    const userId = users?.[0]?.id
    if (!userId) {
      console.error('[loginAsAdmin] no Clerk user found for test email')
      await page.close()
      return null
    }

    // 2. Create a one-time sign-in token via the Clerk Backend API.
    const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
      method: 'POST',
      headers: clerkHeaders,
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    })
    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error(`[loginAsAdmin] sign-in token API returned ${tokenRes.status}: ${body.slice(0, 200)}`)
      await page.close()
      return null
    }
    const { token } = await tokenRes.json()
    if (!token) {
      console.error('[loginAsAdmin] sign-in token API returned no token')
      await page.close()
      return null
    }

    // 3. Navigate the browser to the ticket URL on the path Clerk's <SignIn>
    //    component actually routes on. The token is consumed client-side: a
    //    session is created, __session is set, and the user is redirected to
    //    return_to (safeReturnTo allows /dashboard/admin/content).
    const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
    await page.goto(ticketUrl, {
      waitUntil: 'domcontentloaded',
    })

    // 4. Wait for the redirect to finish — the user should land on the
    //    dashboard (pathname no longer /sign-in).
    await page.waitForURL(
      (url) => !url.pathname.includes('/sign-in'),
      { timeout: 45000 },
    )

    return page
  } catch (err) {
    console.error(`[loginAsAdmin] error: ${err}`)
    await page.close()
    return null
  }
}

/**
 * The studio's app/error.tsx boundary. The ticket login already lands on
 * /dashboard/admin/content; re-navigating to the SAME url with a hard goto
 * aborts the in-flight RSC payload and trips the boundary. Recover by
 * clicking "Try again" (the boundary's retry button re-mounts the page).
 */
async function recoverFromErrorBoundary(page: Page): Promise<void> {
  const snag = page.getByText(/We hit a snag/)
  if ((await snag.count()) > 0) {
    await page.getByRole('button', { name: /Try again/ }).first().click()
    await snag.waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
  }
}

/**
 * Drive the UI to the connect modal: open the studio, open the Command
 * Center, switch to the Systems tab, and click the Systems-card CTA.
 * When `reconnect` is true the card shows the broken-token Re-connect CTA
 * instead of the fresh Connect CTA.
 */
async function navigateToConnectModal(page: Page, opts: { reconnect?: boolean } = {}): Promise<void> {
  // The sign-in token flow lands the user straight on /dashboard/admin/content
  // (return_to). Only hard-navigate when we're somewhere else — a second goto
  // to the same URL aborts the in-flight RSC stream and trips app/error.tsx.
  const current = new URL(page.url())
  if (current.pathname !== '/dashboard/admin/content') {
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })
  }
  await recoverFromErrorBoundary(page)

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
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

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
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

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
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

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

  test('OAuth reconnect: re-running Google consent heals the token and fires the live-heal radar refresh', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mocks ──────────────────────────────────────────────────────────────
    // 1) Fake the consent popup (same as the fresh-OAuth test) so the flow
    //    reaches the 'waiting' phase without a real window opening.
    await page.addInitScript(() => {
      const fakePopup = { closed: false, close() { (this as { closed: boolean }).closed = true } }
      window.open = () => fakePopup as unknown as Window
    })

    // 2) Method-state status endpoint simulating a connected-but-broken OAuth
    //    connection: connected=true, live=false (stored token can't mint —
    //    invalid_grant) until the consent completes, which flips live→true
    //    while connected stays true. The modal must wait for that heal.
    let live = false
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          live
            ? {
                connected: true, live: true, mode: 'oauth',
                email: 'estate@yousafeconsultancy.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: null,
              }
            : {
                connected: true, live: false, mode: 'oauth',
                email: 'estate@yousafeconsultancy.com',
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

    // Reconnect copy is shown and the consent CTA reads 'Re-authorize'.
    await expect(page.getByText(/The stored token can't mint an access token/)).toBeVisible()
    await page.getByRole('button', { name: /Re-authorize/ }).click()
    await expect(page.getByText(/Waiting for Google consent/)).toBeVisible({ timeout: 10000 })

    // ── Regression guard: while the token is still broken the modal must
    //    NOT claim CONNECTED — the pre-fix poll short-circuited on
    //    `connected` alone. One poll tick (2s) is enough to catch that bug:
    //    still waiting (positive) and no CONNECTED (negative).
    await page.waitForTimeout(2600)
    await expect(page.getByText(/Waiting for Google consent/)).toBeVisible()
    await expect(page.getByText(/CONNECTED · OAUTH/)).toHaveCount(0)

    // ── The consent lands: the backend mints → live-heal ───────────────────
    const hitsBefore = warRoom.hits()
    live = true

    // CONNECTED · OAUTH appears (auto-closes ~2.2s later, so poll fast).
    await expect
      .poll(() => page.getByText(/CONNECTED · OAUTH/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // And the live-heal fired the radar refresh even though `connected` was
    // already true — a fresh war-room POST after the re-authorization.
    await expect.poll(() => warRoom.hits(), { timeout: 10000 }).toBeGreaterThan(hitsBefore)
  })

  test('Mode chip surfaces the connect path in the Systems card and composer banner (SERVICE_ACCOUNT)', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mocks ──────────────────────────────────────────────────────────────
    // Method-aware status endpoint. The SA POST registers a connection that is
    // connected but cannot mint a token yet (live:false) — the exact state the
    // composer-banner mode chip exists to label ("GSC token is failing" +
    // SERVICE_ACCOUNT) while the Systems card shows the chip whenever
    // connected. The GET serves the same state to every poller (studio 30s,
    // command-center 15s + mount).
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
                  connected: true, live: false, mode: 'service_account',
                  siteUrl: body.siteUrl,
                  email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                  connectedAt: new Date().toISOString(),
                  missing: [], error: 'invalid_grant',
                }
              : { error: 'No service account key available' },
          ),
        })
        return
      }
      // GET — every poller reads the current connection state.
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          connected
            ? {
                connected: true, live: false, mode: 'service_account',
                email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
                siteUrl: 'sc-domain:yousafeconsultancy.com',
                connectedAt: new Date().toISOString(),
                missing: [], error: 'invalid_grant',
              }
            : {
                connected: false, live: false, mode: null, email: null, siteUrl: null,
                connectedAt: null, missing: ['site_url'], error: null,
              },
        ),
      })
    })

    // The exact-mode chip — the text that distinguishes OAUTH from
    // SERVICE_ACCOUNT on both surfaces.
    const modeChip = page.getByText('SERVICE_ACCOUNT', { exact: true })

    // ── Before connecting: no mode chip anywhere ───────────────────────────
    await expect(modeChip).toHaveCount(0)

    // ── Connect through the STUDIO's composer banner modal ─────────────────
    // Scoped to the banner (background #FFFBEB is unique to it on the Create
    // tab) so we never hit the radar panel's twin "Connect GSC →" CTA. The
    // studio modal's onConnected → loadGscStatus refreshes the banner's own
    // gscStatus immediately — no 30s studio poll wait.
    const bannerCta = page.locator('div[style*="FFFBEB"]').getByRole('button', { name: 'Connect GSC →' })
    await bannerCta.waitFor({ state: 'visible', timeout: 30000 })
    await bannerCta.click()

    // Service account tab → paste key + URL → connect.
    await page.getByRole('button', { name: 'Service account', exact: true }).click()
    const dialog = page.getByRole('dialog').last()
    const SA_KEY = JSON.stringify({
      type: 'service_account',
      project_id: 'yousafe-gsc-reader',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
      client_email: 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
    })
    await dialog.locator('textarea').fill(SA_KEY)
    await dialog.locator('input').fill('sc-domain:yousafeconsultancy.com')
    await page.getByRole('button', { name: /Connect service account/ }).click()

    // CONNECTED · SERVICE_ACCOUNT phase (auto-closes ~2.2s later, poll fast).
    await expect
      .poll(() => page.getByText(/CONNECTED · SERVICE_ACCOUNT/).isVisible(), { timeout: 8000, intervals: [250] })
      .toBe(true)

    // ── Composer banner surfaces the mode chip ─────────────────────────────
    // connected-but-not-live → banner swaps to the broken-token copy and
    // labels the path with the SERVICE_ACCOUNT chip.
    await expect(page.getByText(/GSC token is failing/)).toBeVisible({ timeout: 10000 })
    await expect(modeChip).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Re-connect GSC →' })).toBeVisible()

    // ── Systems card surfaces the same chip ────────────────────────────────
    // Open the Command Center → Systems. Its mount poll reads the same
    // connected state → CONNECTED + SERVICE_ACCOUNT chip + TOKEN FAILURE.
    await page.getByRole('button', { name: /Command Center/ }).first().click()
    const systemsTab = page.locator('button[title="Open Systems"]')
    await systemsTab.waitFor({ state: 'visible', timeout: 30000 })
    await systemsTab.click()

    await expect(page.getByText('CONNECTED', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/TOKEN FAILURE/)).toBeVisible()
    // Both surfaces now label the same path — banner + Systems card.
    await expect(modeChip).toHaveCount(2)
    await expect(page.getByRole('button', { name: /Re-connect \(re-authorize\)/ })).toBeVisible()
  })
})
