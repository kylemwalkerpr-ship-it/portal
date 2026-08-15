/**
 * studio-cannibal-resolve.spec.ts
 *
 * E2E for the Work Plan's one-click cannibal resolution.
 *
 * The Discover stage's "WORK PLAN — ALL SIGNALS AGGREGATED" table lists
 * cannibalization alerts from `radarMeta.cannibalization`. Each CANNIBAL row
 * renders a "⚠ Resolve" button that POSTs /api/seo-factory/cannibal-merge
 * with the alert's search term and surfaces an action notice ("Cannibal
 * resolved: …") in the admin shell banner.
 *
 * ── Scenario ─────────────────────────────────────────────────────────────────
 *  1. Mock GSC suggestions → one cannibalization cluster (term + pages).
 *  2. Mock the cannibal-merge POST → success (winner + 1 redirect).
 *  3. Open Discover, click the row's ⚠ Resolve button.
 *  4. Assert the merge endpoint was called with the right term, and the
 *     "Cannibal resolved" notice appears.
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
  mergeRequests: Array<Record<string, unknown>>
}

async function installRouteMocks(page: Page): Promise<MockState> {
  const state: MockState = { mergeRequests: [] }

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

  // Cannibal merge → success, capturing the request body for assertion.
  await page.route('**/api/seo-factory/cannibal-merge', async (route) => {
    state.mergeRequests.push(route.request().postDataJSON() || {})
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        winnerUrl: WINNER_URL,
        redirectsAdded: [{ from: 'https://legal.yousafeconsultancy.com/uk/dependent-visa-guide', to: WINNER_URL }],
        commits: [],
        skipped: [],
      }),
    })
  })

  return state
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Studio cannibalization — Work Plan Resolve button', () => {
  test('clicking a cannibal row Resolve button posts the merge and shows the notice', async ({ browser }) => {
    const page = await loginAsAdmin(browser)
    if (!page) {
      console.warn('[cannibal-resolve-e2e] skipping — Clerk credentials not configured')
      return
    }

    const { mergeRequests } = await installRouteMocks(page)

    // Reload with mocks active so the studio mounts against them.
    await page.goto(`${BASE}/dashboard/admin/content?tab=discover`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})

    // ── 1 · Discover panel + Work Plan table render ──
    await page.locator('#studio-panel-discover').waitFor({ state: 'visible', timeout: 30_000 })

    // The cannibal row shows its "Consolidate: <term>" title.
    await expect(page.getByText(`Consolidate: ${CANNIBAL_TERM}`)).toBeVisible({ timeout: 10_000 })

    // ── 2 · Click the row's Resolve button ──
    // Unambiguous selector: the row button carries the "Auto-resolve" title;
    // the toolbar's "Resolve all (N)" button has a different title.
    const resolveBtn = page.locator('button[title*="Auto-resolve"]').first()
    await expect(resolveBtn).toBeVisible({ timeout: 8_000 })
    await resolveBtn.click()

    // ── 3 · Assert the merge endpoint was called with the right term ──
    await expect.poll(() => mergeRequests.length, { timeout: 10_000 }).toBeGreaterThan(0)
    expect(mergeRequests[0]?.term).toBe(CANNIBAL_TERM)
    expect(mergeRequests[0]?.mode).toBe('merge')

    // ── 4 · Assert the action notice appears ──
    await expect(page.getByText(/Cannibal resolved/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/legal\.yousafeconsultancy\.com\/uk\/dependent-visa/)).toBeVisible({ timeout: 5_000 })

    await page.close()
  })
})
