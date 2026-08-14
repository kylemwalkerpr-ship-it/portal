/**
 * track-rollback-revert.spec.ts
 *
 * E2E for the Track stage's ROLLBACK action. A merged job (status 'merged'
 * with a canonical_url + shipped file path) renders a stamp in the publication
 * ledger with a ↩ ROLLBACK button. Clicking it must dispatch
 * `PATCH /api/content-studio/jobs` with `{ id, action: 'revert', dryRun: false }`
 * — the exact payload the rollback endpoint (lib/seoFactory/ship.ts →
 * revertContent) consumes to restore the pre-ship content or delete a net-new
 * page via PR→CI→merge.
 *
 * The jobs route is mocked (a "dry-run" ship: no real GitHub/Supabase
 * mutation), so the test asserts the dispatched payload + the confirm dialog.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/track-rollback-revert.spec.ts
 */
import { test, expect, type Browser, type Page, type Route } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'

function hasClerkCredentials(): boolean {
  return !!(process.env.CLERK_TEST_EMAIL && process.env.CLERK_TEST_PASSWORD && process.env.CLERK_SECRET_KEY)
}

async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  const page = await browser.newPage()
  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
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

    const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
    await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })

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

function makeJob(overrides: Record<string, unknown>) {
  return {
    id: 'job-1',
    title: 'UK Dependent Visa Guide 2026',
    topic: 'uk dependent visa',
    content_type: 'article',
    tone: 'educational',
    region: 'UK',
    target_repo: 'caseworks',
    status: 'merged',
    source_job_id: null,
    slug: 'uk/dependent-visa-guide-2026',
    content: '---\ntitle: UK Dependent Visa Guide 2026\n---\n\n# UK Dependent Visa Guide 2026\n',
    branch_name: 'seo-factory/uk-dependent-visa-guide-2026',
    content_path: 'app/uk/dependent-visa-guide-2026/page.tsx',
    pr_url: 'https://github.com/yousafe/caseworks/pull/42',
    pr_number: 42,
    canonical_url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa-guide-2026/',
    owner_host: 'legal.yousafeconsultancy.com',
    merged_at: new Date().toISOString(),
    deploy_sha: 'abc1234def5678abc1234def5678abc1234def',
    closed_at: null,
    error_message: null,
    ai_provider: null,
    ai_model: null,
    word_count: 2500,
    seo_score: 88,
    audit_json: null,
    primary_keyword: 'uk dependent visa',
    ship_mode: 'autodeploy',
    indexable: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/** A merged, live job — the publication ledger's stamp with a rollback button. */
const MERGED_JOB = makeJob({ id: 'job-merged' })

function queueBody(jobs: unknown[]) {
  return JSON.stringify({
    jobs,
    count: jobs.length,
    total: jobs.length,
    hasMore: false,
    offset: 0,
    limit: 40,
    summary: { total: jobs.length, pending: 0, drafting: 0, pr_created: 0, merged: jobs.length, closed: 0, failed: 0, avgScore: 88 },
  })
}

/**
 * Mock the jobs route: serve the merged job on GET (any query variant) and
 * capture PATCH bodies so the test can assert the exact revert payload.
 * Also stub the ledger's trend/divergence lookups so the stamp renders without
 * un-mocked network noise.
 */
async function mockStudio(page: Page, queue: unknown[], patches: Array<Record<string, unknown>>) {
  const fulfillQueue = async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: queueBody(queue) })
  }
  await page.route('**/api/content-studio/jobs?limit=100*', fulfillQueue)
  await page.route('**/api/content-studio/jobs?status=*', fulfillQueue)
  await page.route('**/api/content-studio/jobs', async (route) => {
    const req = route.request()
    if (req.method() === 'PATCH') {
      patches.push((req.postDataJSON() || {}) as Record<string, unknown>)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          message: 'Rollback merged — restored app/uk/dependent-visa-guide-2026/page.tsx',
          revert: { action: 'restored', status: 'reverted' },
        }),
      })
      return
    }
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: queueBody(queue) })
      return
    }
    await route.continue()
  })
  await page.route('**/api/content-studio/position-trend', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, source: 'mock', trends: [] }) })
  })
  await page.route('**/api/content-studio/forecast-divergence', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, entries: [] }) })
  })
}

test.describe('Track stage rollback (admin)', () => {
  test('clicking ROLLBACK dispatches the revert PATCH payload { id, action: revert, dryRun: false }', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    const patches: Array<Record<string, unknown>> = []
    await mockStudio(page, [MERGED_JOB], patches)

    await page.goto(`${BASE}/dashboard/admin/content?tab=approve`, { waitUntil: 'domcontentloaded' })

    // The publication ledger (Track half of Approve & Track) renders the stamp.
    const ledger = page.getByTestId('studio-publish-ledger')
    await ledger.waitFor({ state: 'visible', timeout: 30000 })

    const rollback = page.getByTestId('studio-revert-cta-job-merged')
    await expect(rollback).toBeVisible({ timeout: 15000 })
    await expect(rollback).toContainText('ROLLBACK')

    // The rollback action guards with a confirm dialog — accept it so the
    // revert proceeds (Playwright auto-dismisses unhandled dialogs → no PATCH).
    page.on('dialog', (dialog) => dialog.accept())

    await rollback.click()

    // The dispatched PATCH must be the exact revert payload.
    await expect.poll(() => patches.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(patches[0]).toEqual({ id: 'job-merged', action: 'revert', dryRun: false })

    // The stamp surfaces the mocked rollback result.
    await expect(ledger).toContainText('Rollback merged', { timeout: 10000 })
  })
})
