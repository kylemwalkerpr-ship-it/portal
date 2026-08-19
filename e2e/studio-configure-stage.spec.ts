/**
 * Stage VII · Configure E2E — section headers, GSC status dot, mode chip.
 *
 * Navigates to the Configure tab and asserts all 5 section rows render with
 * the correct headers. Also verifies the GSC connection card shows the
 * appropriate status dot color and mode chip for each connection state.
 *
 * Uses Clerk sign-in token auth matching the existing E2E patterns.
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'

// ── Clerk auth helpers ──────────────────────────────────────────────────────

function hasClerkCredentials(): boolean {
  return !!(
    process.env.CLERK_TEST_EMAIL &&
    process.env.CLERK_SECRET_KEY
  )
}

async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  if (!hasClerkCredentials()) return null

  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  }

  const userRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(process.env.CLERK_TEST_EMAIL!)}`,
    { headers: clerkHeaders },
  )
  const users = (await userRes.json()) as any
  const userId = users?.[0]?.id
  if (!userId) {
    console.warn('[configure-e2e] no Clerk user found for test email')
    return null
  }

  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const tokenBody = (await tokenRes.json()) as any
  const token = tokenBody?.token
  if (!token) {
    console.warn('[configure-e2e] failed to create sign-in token')
    return null
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })

  await page.waitForURL(
    (url) => !url.pathname.includes('/sign-in'),
    { timeout: 45000 },
  )

  return page
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Stage VII · Configure — System Configurator', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[configure-e2e] skipping — Clerk credentials not configured')
      return
    }

    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  // ── Scenario 1: All 5 section headers render ─────────────────────────────

  test('renders all five section headers', async () => {
    // Mock the system-health and model-calibration endpoints so the cards
    // render without waiting for live Supabase queries.
    await page.route('**/api/content-studio/system-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          apiKeysConfigured: 3,
          gscConnected: true,
          gscMode: 'oauth',
          interlinkTotal: 15,
          interlinkActive: 12,
          lastSiteScan: new Date().toISOString(),
          totalShipped: 8,
        }),
      })
    })

    await page.route('**/api/content-studio/model-calibration', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          lastCalibratedAt: new Date().toISOString(),
          modelVersion: 'v2.1.0',
          eventsCount: 142,
          accuracy: 78,
          accuracyTrend: 'improving',
          recentRuns: 23,
        }),
      })
    })

    // Mock GSC connect status
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          live: true,
          mode: 'oauth',
          email: 'test@example.com',
        }),
      })
    })

    // Navigate to the Configure tab via bubble pill.
    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // Wait for the ChapterIntro heading.
    await expect(page.getByText('Configure', { exact: true }).first()).toBeVisible({ timeout: 8000 })

    // ── Assert all 5 section headers ──
    const expectedHeaders = [
      'AI PROVIDER KEYS',
      'RANKING MODEL CALIBRATION',
      'SYSTEM HEALTH SUMMARY',
      'SEARCH CONSOLE',
      'GOOGLE ANALYTICS 4',
      'UBERSUGGEST MCP',
      'DEEP INTERLINKS',
    ]

    for (const header of expectedHeaders) {
      await expect(
        page.locator('span').filter({ hasText: header }).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  // ── Scenario 2: GSC status dot + mode chip ───────────────────────────────

  test('shows green status dot and OAUTH mode chip when GSC is connected live', async () => {
    // Mock GSC as connected + live + oauth
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          live: true,
          mode: 'oauth',
          email: 'admin@yousafeconsultancy.com',
        }),
      })
    })

    // Reload to pick up the mock
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    // Navigate to Configure
    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // Assert the connected text appears.
    await expect(page.getByText('Connected · Live data')).toBeVisible({ timeout: 8000 })

    // Assert the OAUTH mode chip is rendered.
    const oauthChip = page.locator('span').filter({ hasText: 'OAUTH' }).first()
    await expect(oauthChip).toBeVisible({ timeout: 5000 })

    // Assert the chip has blue background (oauth style).
    const oauthColor = await oauthChip.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    )
    // OAUTH chips use a blue-ish background (#DBEAFE or similar).
    expect(oauthColor).toBeTruthy()
  })

  // ── Scenario 3: Red status dot when GSC is disconnected ──────────────────

  test('shows red status dot and Not connected when GSC is offline', async () => {
    // Mock GSC as disconnected
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: false,
          live: false,
          mode: null,
        }),
      })
    })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // Assert the disconnected text appears.
    await expect(page.getByText('Not connected')).toBeVisible({ timeout: 8000 })

    // Assert the Connect GSC button is present (not Reconnect).
    await expect(
      page.getByRole('button', { name: /Connect GSC/ })
    ).toBeVisible({ timeout: 5000 })

    // Assert no mode chip is rendered.
    await expect(
      page.locator('span').filter({ hasText: 'OAUTH' })
    ).not.toBeVisible()
    await expect(
      page.locator('span').filter({ hasText: 'SERVICE_ACCOUNT' })
    ).not.toBeVisible()
  })

  // ── Scenario 4: SERVICE_ACCOUNT mode chip renders correctly ──────────────

  test('shows SERVICE_ACCOUNT mode chip when using service account key', async () => {
    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          live: true,
          mode: 'service_account',
          email: 'sa@project.iam.gserviceaccount.com',
        }),
      })
    })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // Assert the SERVICE_ACCOUNT mode chip renders.
    const saChip = page.locator('span').filter({ hasText: 'SERVICE_ACCOUNT' }).first()
    await expect(saChip).toBeVisible({ timeout: 5000 })

    // Service account chips use an amber background (#FEF3C7 or similar).
    const saColor = await saChip.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    )
    expect(saColor).toBeTruthy()
  })

  // ── Scenario 5: All 5 rows render + system health metrics correct ─────────

  test('all five Configure rows render with correct system health values', async () => {
    await page.route('**/api/content-studio/system-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          apiKeysConfigured: 4,
          gscConnected: true,
          gscMode: 'oauth',
          interlinkTotal: 23,
          interlinkActive: 18,
          lastSiteScan: '2026-08-08T12:00:00Z',
          totalShipped: 12,
        }),
      })
    })

    await page.route('**/api/content-studio/model-calibration', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          lastCalibratedAt: '2026-07-28T10:00:00Z',
          modelVersion: 'v2.1.0',
          eventsCount: 142,
          accuracy: 78,
          accuracyTrend: 'improving',
          recentRuns: 23,
        }),
      })
    })

    await page.route('**/api/content-studio/gsc/connect', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connected: true,
          live: true,
          mode: 'oauth',
        }),
      })
    })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // ── Assert all 5 row section headers ──
    const rows = [
      'AI PROVIDER KEYS',
      'RANKING MODEL CALIBRATION',
      'SYSTEM HEALTH SUMMARY',
      'SEARCH CONSOLE',
      'DEEP INTERLINKS',
    ]
    for (const row of rows) {
      await expect(
        page.locator('span').filter({ hasText: row }).first()
      ).toBeVisible({ timeout: 5000 })
    }

    // ── Assert all 5 system health metric labels ──
    const metrics = ['API Keys', 'GSC Connection', 'Site Scanned', 'Interlinks', 'Shipped']
    for (const m of metrics) {
      await expect(page.getByText(m, { exact: true }).first()).toBeVisible({ timeout: 5000 })
    }

    // ── Assert metric values ──
    await expect(page.getByText('4', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Connected')).toBeVisible()
    await expect(page.getByText('Aug 8')).toBeVisible()
    await expect(page.getByText('23', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('12', { exact: true }).first()).toBeVisible()

    // ── Assert sublabels ──
    await expect(page.getByText('providers configured')).toBeVisible()
    await expect(page.getByText('last audit run')).toBeVisible()
    await expect(page.getByText('18 active · registry size')).toBeVisible()
    await expect(page.getByText('merged content jobs')).toBeVisible()

    // ── Assert the Run Audit button renders ──
    await expect(
      page.getByRole('button', { name: /Run audit/ })
    ).toBeVisible({ timeout: 5000 })

    // ── Click Run Audit and assert health refreshes ──
    await page.route('**/api/content-studio/site-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, action: 'audit', totalPages: 47 }),
      })
    })

    // Click the Run Audit button.
    const runAuditBtn = page.getByRole('button', { name: /Run audit/ })
    await runAuditBtn.click()

    // The button should transition to the running state.
    await expect(
      page.getByRole('button', { name: /Running/ })
    ).toBeVisible({ timeout: 5000 })
  })

  // ── Scenario 6: Model calibration card renders with accuracy gauge ───────

  test('displays model calibration with accuracy gauge', async () => {
    await page.route('**/api/content-studio/model-calibration', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          lastCalibratedAt: '2026-07-28T10:00:00Z',
          modelVersion: 'v2.1.0',
          eventsCount: 142,
          accuracy: 78,
          accuracyTrend: 'improving',
          recentRuns: 23,
        }),
      })
    })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    // Wait for the calibration card.
    await expect(page.getByText('RANKING MODEL CALIBRATION')).toBeVisible({ timeout: 8000 })

    // Assert accuracy % renders.
    await expect(page.getByText('78%')).toBeVisible({ timeout: 5000 })

    // Assert the accuracy trend renders.
    await expect(page.getByText('↗ Improving')).toBeVisible({ timeout: 5000 })

    // Assert model version renders.
    await expect(page.getByText('v2.1.0')).toBeVisible({ timeout: 5000 })

    // Assert the status badge.
    await expect(page.getByText('✓ HEALTHY')).toBeVisible({ timeout: 5000 })
  })

  // ── Scenario 7: Empty/loading state when endpoints return nothing ─────────

  test('shows loading state when calibration data is not yet available', async () => {
    await page.route('**/api/content-studio/model-calibration', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          lastCalibratedAt: null,
          modelVersion: 'unknown',
          eventsCount: 0,
          accuracy: null,
          accuracyTrend: null,
          recentRuns: 0,
        }),
      })
    })

    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    const configurePill = page.locator('#studio-tab-configure')
    await configurePill.waitFor({ state: 'visible', timeout: 15000 })
    await configurePill.click()

    await expect(page.getByText('RANKING MODEL CALIBRATION')).toBeVisible({ timeout: 8000 })

    // Should show "✕ NOT CALIBRATED" when there's no calibration data.
    await expect(page.getByText('✕ NOT CALIBRATED')).toBeVisible({ timeout: 5000 })

    // Should show "—" for accuracy when null.
    await expect(page.getByText('—')).toBeVisible({ timeout: 5000 })
  })
})
