/**
 * Stage VI · Track E2E — publication ledger, metrics bar, stamp cards.
 *
 * Two scenarios:
 *  1. Empty state — no stamps yet, Citation Ledger Awaits Its First Entry
 *  2. Stamps present — metrics bar renders, stamp cards visible, verify CTA clickable
 *
 * Content Studio Operations lives at /dashboard/admin/content and requires a Clerk
 * session with the **admin** role. We create that session programmatically using
 * Clerk's Sign-In Token API so the test never touches a multi-step login form.
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

// ── Config ──────────────────────────────────────────────────────────────────
const BASE =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'

// ── Clerk auth helpers (shared with gsc-connect-modal.spec.ts) ──────────────

/** Check if Clerk test credentials are available. */
function hasClerkCredentials(): boolean {
  return !!(
    process.env.CLERK_TEST_EMAIL &&
    process.env.CLERK_SECRET_KEY
  )
}

/**
 * Sign in as admin using Clerk's Sign-In Token API.
 *
 * This bypasses the multi-step login form, email OTP, and all the factors a live
 * Clerk instance requires.
 */
async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  if (!hasClerkCredentials()) return null

  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  }

  // 1. Resolve the Clerk user id from the test email.
  const userRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(process.env.CLERK_TEST_EMAIL!)}`,
    { headers: clerkHeaders },
  )
  const users = (await userRes.json()) as any
  const userId = users?.[0]?.id
  if (!userId) {
    console.warn('[loginAsAdmin] no Clerk user found for test email')
    return null
  }

  // 2. Create a one-time sign-in token via the Clerk Backend API.
  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const tokenBody = (await tokenRes.json()) as any
  const token = tokenBody?.token
  if (!token) {
    console.warn('[loginAsAdmin] failed to create sign-in token')
    return null
  }

  // 3. Navigate the browser to the ticket URL on the path Clerk's <SignIn>
  //    component expects. The return_to parameter redirects the user to the
  //    Content Studio workspace after the session is created.
  const context = await browser.newContext()
  const page = await context.newPage()

  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, {
    waitUntil: 'domcontentloaded',
  })

  // 4. Wait for the client-side session creation + redirect to finish.
  await page.waitForURL(
    (url) => !url.pathname.includes('/sign-in'),
    { timeout: 45000 },
  )

  return page
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Stage VI · Track — Publication Ledger', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[track-e2e] skipping — Clerk credentials not configured')
      return
    }

    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  // ── Scenario 1: Empty state ──────────────────────────────────────────────

  test('renders empty state when no stamps are present', async ({ browser }) => {
    // Pre-condition: no stamps in the ledger — the studio starts with an empty
    // merge list on fresh loads. We intercept the position-trend endpoint to
    // return an empty result so the empty state path is deterministic.
    await page.route('**/api/content-studio/position-trend', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, source: 'mock', trends: [] }),
      })
    })

    // Navigate to the Track tab via the bubble pill.
    const trackPill = page.locator('#studio-tab-track')
    await trackPill.waitFor({ state: 'visible', timeout: 15000 })
    await trackPill.click()

    // Assert the Track panel is visible.
    const publishLedger = page.locator('[data-testid=\"studio-publish-ledger\"]')
    await expect(publishLedger).toBeVisible({ timeout: 10000 })

    // Assert the Ship Ledger header shows 0 stamps.
    await expect(page.locator('h3').filter({ hasText: /Ship Ledger/ })).toBeVisible()
    await expect(page.locator('h3').filter({ hasText: /0 verified stamp/ })).toBeVisible()

    // Assert the empty state renders with the scroll icon and guidance.
    await expect(page.getByText('Citation Ledger Awaits Its First Entry')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('I · Discover → gaps & opportunities')).toBeVisible()
    await expect(page.getByText('V · Approve → merge to main')).toBeVisible()
    await expect(page.getByText('VI · Track → stamp appears here')).toBeVisible()

    // Assert the REFRESH TRENDS button is visible but the metrics bar is NOT.
    await expect(page.locator('[data-testid=\"studio-publish-refresh\"]')).toBeVisible()
    // Metrics bar only renders when stamps.length > 0 — should be absent.
    await expect(page.getByText('Total Merged')).not.toBeVisible()
    await expect(page.getByText('Avg Position')).not.toBeVisible()
  })

  // ── Scenario 2: Stamps present — metrics bar + stamp cards ───────────────

  test('renders metrics bar and stamp cards when stamps are present', async ({ browser }) => {
    // Mock position-trend to return realistic GSC data for 2 merged stamps.
    await page.route('**/api/content-studio/position-trend', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          source: 'mock',
          trends: [
            {
              url: 'https://legal.yousafeconsultancy.com/us/student-visas/f1-interview-tips',
              found: true,
              position: 8.4,
              impressions: 3200,
              clicks: 156,
              ctr: 0.04875,
              deltaPosition: -2.1,
              direction: 'up',
              points: [
                { date: '2026-08-01', clicks: 20, impressions: 450, position: 10.2, ctr: 0.044 },
                { date: '2026-08-10', clicks: 24, impressions: 510, position: 8.4, ctr: 0.047 },
              ],
            },
            {
              url: 'https://legal.yousafeconsultancy.com/uk/spouse-visa-financial-evidence',
              found: true,
              position: 15.1,
              impressions: 1800,
              clicks: 42,
              ctr: 0.02333,
              deltaPosition: 1.5,
              direction: 'down',
              points: [
                { date: '2026-08-01', clicks: 5, impressions: 220, position: 13.6, ctr: 0.022 },
                { date: '2026-08-10', clicks: 6, impressions: 260, position: 15.1, ctr: 0.023 },
              ],
            },
          ],
        }),
      })
    })

    // Mock the verify-published endpoint so stamp verification works.
    await page.route('**/api/content-studio/verify-published', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          stamp: { status: 'verified', message: 'HTTP 200 · canonical intact' },
          result: { httpStatus: 200, verifiedAt: new Date().toISOString() },
        }),
      })
    })

    // Mock forecast-divergence to prevent errors from un-mocked calls.
    await page.route('**/api/content-studio/forecast-divergence', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, entries: [] }),
      })
    })

    // Navigate to the Track tab.
    const trackPill = page.locator('#studio-tab-track')
    await trackPill.waitFor({ state: 'visible', timeout: 15000 })
    await trackPill.click()

    // Wait for the publish ledger container.
    const publishLedger = page.locator('[data-testid=\"studio-publish-ledger\"]')
    await expect(publishLedger).toBeVisible({ timeout: 15000 })

    // ── Metrics bar assertions ──
    // The metrics bar should render when stamps.length > 0.
    // (Note: the actual stamp count depends on the studio's merge state;
    //  the mocked position-trend ensures trend data renders correctly.)
    await expect(page.getByText('Total Merged')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Avg Position')).toBeVisible()
    await expect(page.getByText('Total Clicks')).toBeVisible()
    await expect(page.getByText('Avg CTR')).toBeVisible()

    // The metrics values should reflect the mocked trend data.
    // Avg Position: (8.4 + 15.1) / 2 = 11.8
    await expect(page.getByText('11.8')).toBeVisible()
    // Total Clicks: 156 + 42 = 198
    await expect(page.getByText('198')).toBeVisible()
    // Avg CTR: 198 / 5000 = 3.96%
    await expect(page.getByText('4.0%')).toBeVisible()

    // ── Stamp card assertions ──
    // Each mocked canonical URL should render a stamp card.
    const stampCards = page.locator('[data-testid^=\"studio-verify-stamp-\"]')
    const stampCount = await stampCards.count()
    expect(stampCount).toBeGreaterThanOrEqual(1)

    // The first stamp card should show:
    // - The canonical URL (domain + path)
    // - A verify CTA button
    // - The divergence chip
    const firstStamp = stampCards.first()
    await expect(firstStamp).toBeVisible()

    // Verify the first stamp's canonical URL is rendered.
    await expect(firstStamp.locator('text=legal.yousafeconsultancy.com')).toBeVisible()
    await expect(firstStamp.locator('text=/us/student-visas/f1-interview-tips')).toBeVisible()

    // The verify CTA should be present and clickable.
    const verifyCta = firstStamp.locator('[data-testid^=\"studio-verify-cta-\"]')
    await expect(verifyCta).toBeVisible()
    await expect(verifyCta).toBeEnabled()

    // The REFRESH TRENDS button should be visible.
    const refreshBtn = page.locator('[data-testid=\"studio-publish-refresh\"]')
    await expect(refreshBtn).toBeVisible()
    await expect(refreshBtn).toBeEnabled()

    // ── Click verify on a stamp and assert it updates ──
    await verifyCta.first().click()
    // After verification, the stamp should show the verified state.
    await expect(
      firstStamp.locator('[data-stage=\"ok\"]')
    ).toBeVisible({ timeout: 8000 })
    // The verify text should reflect success.
    await expect(
      firstStamp.locator('text=HTTP 200')
    ).toBeVisible()

    // ── Sparkline metric tabs should be present ──
    await expect(firstStamp.locator('[role=\"tablist\"]')).toBeVisible()
    await expect(firstStamp.getByRole('tab', { name: /position/i })).toBeVisible()
    await expect(firstStamp.getByRole('tab', { name: /impressions/i })).toBeVisible()
    await expect(firstStamp.getByRole('tab', { name: /clicks/i })).toBeVisible()
  })

  // ── Scenario 3: Backward navigation from Track → Approve ─────────────────

  test('allows navigation from Track back to Approve via bubble pill', async () => {
    // Click on the Approve pill (studio-tab-approve).
    const approvePill = page.locator('#studio-tab-approve')
    await approvePill.waitFor({ state: 'visible', timeout: 10000 })
    await approvePill.click()

    // Assert the Approve panel renders.
    await expect(
      page.locator('[data-testid=\"studio-approve-panel\"]')
    ).toBeVisible({ timeout: 8000 })

    // Navigate back to Track.
    const trackPill = page.locator('#studio-tab-track')
    await trackPill.click()

    // Assert the publish ledger is visible again.
    await expect(
      page.locator('[data-testid=\"studio-publish-ledger\"]')
    ).toBeVisible({ timeout: 8000 })
  })
})
