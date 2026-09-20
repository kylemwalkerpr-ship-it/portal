/**
 * studio-cannibal-resolve.spec.ts
 *
 * E2E for the Work Plan's P4 cannibal *evidence review*.
 *
 * The Discover stage's "WORK PLAN — ALL SIGNALS AGGREGATED" table lists
 * cannibalization alerts from `radarMeta.cannibalization`. Each CANNIBAL row
 * renders a "🔍 Review evidence" button that POSTs the read-only
 * /api/seo-factory/cannibal-pages endpoint and surfaces an action notice.
 *
 * P4 contract asserted here: destructive consolidation is NOT reachable from
 * the Work Plan. The row must never POST /api/seo-factory/cannibal-merge, the
 * cluster must stay on the Work Plan after a review, and the toolbar sweep is
 * a read-only review too.
 *
 * ── Scenario ─────────────────────────────────────────────────────────────────
 *  1. Mock GSC suggestions → one cannibalization cluster (term + pages).
 *  2. Mock cannibal-pages → qualified evidence; mock cannibal-merge to record
 *     any (unexpected) call.
 *  3. Open Discover, click the row's Review button.
 *  4. Assert only the read-only endpoint was called and the notice appears.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_SECRET_KEY=sk_live_...
 * Without them the tests are skipped. Run:
 *     npx playwright test e2e/studio-cannibal-resolve.spec.ts
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'

// ── Clerk auth helpers (sign-in token pattern) ──────────────────────────────

function hasClerkCredentials(): boolean {
  return !!(process.env.CLERK_TEST_EMAIL && process.env.CLERK_SECRET_KEY)
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
  const users = (await userRes.json()) as Array<{ id?: string }>
  const userId = users?.[0]?.id
  if (!userId) {
    console.warn('[cannibal-resolve-e2e] no Clerk user found for test email')
    return null
  }

  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const tokenBody = (await tokenRes.json()) as { token?: string }
  const token = tokenBody?.token
  if (!token) {
    console.warn('[cannibal-resolve-e2e] failed to create sign-in token')
    return null
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content?tab=discover')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 45_000 })
  return page
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const CANNIBAL_TERM = 'uk dependent visa'
const WINNER_URL = 'https://legal.yousafeconsultancy.com/uk/dependent-visa'

// ── Route mocks ─────────────────────────────────────────────────────────────
//
// Playwright matches routes in reverse order of registration, so the broad
// catch-all is registered FIRST and the specific routes AFTER — the specific
// ones win.

interface MockState {
  destructiveRequests: Array<Record<string, unknown>>
  evidenceRequests: Array<Record<string, unknown>>
}

async function installRouteMocks(page: Page): Promise<MockState> {
  const state: MockState = { destructiveRequests: [], evidenceRequests: [] }

  // Catch-all: benign responses for every API the studio touches on mount
  // (jobs, gate runs, engine status, backlinks, visibility, merge history…).
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() === 'GET' && url.includes('/api/content-studio/jobs')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: [], count: 0, total: 0, hasMore: false, offset: 0, limit: 100, summary: {} }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, merges: [], suggestions: [], opportunities: [], runs: [], warnings: [], coverageStats: {}, cannibalization: [] }),
    })
  })

  // GSC suggestions → one cannibalization cluster so the Work Plan renders a
  // CANNIBAL row.
  await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        region: 'UK',
        source: 'snapshot',
        suggestions: [],
        opportunities: [],
        coverageStats: {},
        cannibalization: [
          {
            term: CANNIBAL_TERM,
            pages: [
              'https://legal.yousafeconsultancy.com/uk/dependent-visa-guide',
              'https://legal.yousafeconsultancy.com/uk/dependent-visa-2026',
            ],
          },
        ],
        warnings: [],
      }),
    })
  })

  // Destructive endpoint: recorded and hard-failed if a Work Plan action ever
  // reaches it. P4 requires an explicit decision record + review PR instead.
  await page.route('**/api/seo-factory/cannibal-merge', async (route) => {
    state.destructiveRequests.push(route.request().postDataJSON() || {})
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'P4 destructive consolidation is PR-only.', blockers: ['pr_mode_required'] }),
    })
  })

  // Read-only competing-page evidence.
  await page.route('**/api/seo-factory/cannibal-pages', async (route) => {
    state.evidenceRequests.push(route.request().postDataJSON() || {})
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        term: CANNIBAL_TERM,
        pages: [
          { url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa', impressions: 120, clicks: 4, position: 6.2 },
          { url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa-guide', impressions: 40, clicks: 1, position: 11.4 },
        ],
        source: 'gsc_live',
        evidenceSource: 'gsc_live',
        window: { startDate: '2026-06-22', endDate: '2026-09-19', capturedAt: '2026-09-20T05:39:02Z' },
        metricsSynthetic: false,
        eligibleForDestructiveAction: true,
        destructiveEligible: true,
        blockingReasons: [],
        blockers: [],
        suggestedWinner: null,
        winnerSelection: 'authoritative_p3_owner_only',
      }),
    })
  })

  return state
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Studio cannibalization — Work Plan evidence review (P4, non-destructive)', () => {
  test('a cannibal row review requests evidence only — never a destructive merge', async ({ browser }) => {
    const page = await loginAsAdmin(browser)
    if (!page) {
      console.warn('[cannibal-resolve-e2e] skipping — Clerk credentials not configured')
      return
    }

    const { destructiveRequests, evidenceRequests } = await installRouteMocks(page)

    // Reload with mocks active so the studio mounts against them.
    await page.goto(`${BASE}/dashboard/admin/content?tab=discover`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    // ── 1 · Discover panel + Work Plan table render ──
    await page.locator('#studio-panel-discover').waitFor({ state: 'visible', timeout: 30_000 })

    // The cannibal row shows its "Consolidate: <term>" title.
    await expect(page.getByText(`Consolidate: ${CANNIBAL_TERM}`)).toBeVisible({ timeout: 10_000 })

    // ── 2 · Click the row's read-only evidence review ──
    // Unambiguous selector: the row button carries the P3-owner review title;
    // the toolbar's "Review all (N)" button has a different title.
    const reviewBtn = page.locator('button[title*="Inspect qualified GSC overlap"]').first()
    await expect(reviewBtn).toBeVisible({ timeout: 8_000 })
    await reviewBtn.click()

    // ── 3 · Only the read-only evidence endpoint was called ──
    await expect.poll(() => evidenceRequests.length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(evidenceRequests[0]?.term).toBe(CANNIBAL_TERM)
    expect(destructiveRequests).toHaveLength(0)

    // ── 4 · Assert the review notice appears ──
    await expect(page.getByText(/P4 evidence/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/no destructive/i)).toHaveCount(0)

    await page.close()
  })

  test('a reviewed cluster stays on the Work Plan — nothing is auto-cleared', async ({ browser }) => {
    const page = await loginAsAdmin(browser)
    if (!page) {
      console.warn('[cannibal-resolve-e2e] skipping — Clerk credentials not configured')
      return
    }

    const { destructiveRequests } = await installRouteMocks(page)

    await page.goto(`${BASE}/dashboard/admin/content?tab=discover`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    await page.locator('#studio-panel-discover').waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.getByText(`Consolidate: ${CANNIBAL_TERM}`)).toBeVisible({ timeout: 10_000 })

    const reviewBtn = page.locator('button[title*="Inspect qualified GSC overlap"]').first()
    await expect(reviewBtn).toBeVisible({ timeout: 8_000 })

    await reviewBtn.click()

    // P4: the cluster remains visible until a reviewed PR (or the ledger)
    // clears it. A review must never hide it and never call the destructive API.
    await expect(page.getByText(`Consolidate: ${CANNIBAL_TERM}`)).toBeVisible({ timeout: 5_000 })
    await expect(reviewBtn).toBeVisible({ timeout: 5_000 })
    expect(destructiveRequests).toHaveLength(0)

    await page.close()
  })
})
