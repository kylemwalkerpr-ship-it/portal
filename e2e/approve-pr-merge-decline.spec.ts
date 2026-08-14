/**
 * approve-pr-merge-decline.spec.ts
 *
 * E2E for the Approve & Track PR rows. A job with an open PR (status
 * `pr_created` + pr_url/pr_number) must:
 *   1. MERGE the *existing* PR via `PATCH /api/content-studio/jobs`
 *      `{ id, action: 'merge_pr' }` — NOT re-ship a fresh branch (the 2026-08
 *      bug where the row called bulk_approve → shipContent and stranded the
 *      original PR).
 *   2. DECLINE via `PATCH ... { id, action: 'close_pr' }` — closing the PR on
 *      GitHub + marking the job closed.
 *
 * The jobs route is mocked so the test asserts the exact PATCH payloads without
 * touching GitHub or Supabase.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/approve-pr-merge-decline.spec.ts
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
    status: 'pr_created',
    source_job_id: null,
    slug: null,
    content: '---\ntitle: UK Dependent Visa Guide 2026\n---\n\n# UK Dependent Visa Guide 2026\n',
    branch_name: 'seo-factory/uk-dependent-visa-guide-2026',
    content_path: 'app/uk/dependent-visa-guide-2026/page.tsx',
    pr_url: 'https://github.com/yousafe/caseworks/pull/42',
    pr_number: 42,
    canonical_url: null,
    owner_host: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: null,
    ai_model: null,
    word_count: 2500,
    seo_score: 88,
    audit_json: null,
    primary_keyword: 'uk dependent visa',
    ship_mode: null,
    indexable: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/** A job whose generation shipped an open PR — the Approve panel's PR row. */
const PR_JOB = makeJob({ id: 'job-pr' })

function queueBody(jobs: unknown[]) {
  return JSON.stringify({
    jobs,
    count: jobs.length,
    total: jobs.length,
    hasMore: false,
    offset: 0,
    limit: 40,
    summary: { total: jobs.length, pending: 0, drafting: 0, pr_created: jobs.length, merged: 0, closed: 0, failed: 0, avgScore: 0 },
  })
}

/**
 * Mock the jobs route: serve the PR job on GET (any query variant) and capture
 * PATCH bodies so the test can assert the exact action dispatched.
 */
async function mockJobsRoute(page: Page, queue: unknown[], patches: Array<Record<string, unknown>>) {
  const fulfillQueue = async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: queueBody(queue) })
  }
  await page.route('**/api/content-studio/jobs?limit=100*', fulfillQueue)
  await page.route('**/api/content-studio/jobs?status=*', fulfillQueue)
  await page.route('**/api/content-studio/jobs', async (route) => {
    const req = route.request()
    if (req.method() === 'PATCH') {
      patches.push((req.postDataJSON() || {}) as Record<string, unknown>)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'ok' }) })
      return
    }
    if (req.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: queueBody(queue) })
      return
    }
    await route.continue()
  })
}

test.describe('Approve & Track PR rows (admin)', () => {
  test('the PR row CTA merges the existing PR via PATCH merge_pr (no re-ship)', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    const patches: Array<Record<string, unknown>> = []
    await mockJobsRoute(page, [PR_JOB], patches)

    await page.goto(`${BASE}/dashboard/admin/content?tab=approve`, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('studio-approve-panel')
    await panel.waitFor({ state: 'visible', timeout: 30000 })

    // The PR row renders with the merge CTA labelled for a real merge.
    const row = page.getByTestId('studio-approve-row-job-pr')
    await expect(row).toBeVisible({ timeout: 15000 })
    const cta = page.getByTestId('studio-approve-cta-job-pr')
    await expect(cta).toContainText('MERGE PR')

    await cta.click()

    // The dispatched PATCH must be merge_pr — never bulk_approve / reship.
    await expect.poll(() => patches.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(patches[0]).toEqual({ id: 'job-pr', action: 'merge_pr' })
  })

  test('the DECLINE PR button closes the PR via PATCH close_pr', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    const patches: Array<Record<string, unknown>> = []
    await mockJobsRoute(page, [PR_JOB], patches)

    await page.goto(`${BASE}/dashboard/admin/content?tab=approve`, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('studio-approve-panel')
    await panel.waitFor({ state: 'visible', timeout: 30000 })

    const row = page.getByTestId('studio-approve-row-job-pr')
    await expect(row).toBeVisible({ timeout: 15000 })

    const decline = page.getByTestId('studio-approve-decline-job-pr')
    await expect(decline).toContainText('DECLINE PR')
    await decline.click()

    // The dispatched PATCH must be close_pr — closing the PR on GitHub.
    await expect.poll(() => patches.length, { timeout: 10000 }).toBeGreaterThan(0)
    expect(patches[0]).toEqual({ id: 'job-pr', action: 'close_pr' })

    // The row's terminal state must read DECLINED — not the pre-fix '✕ FAILED'.
    await expect(page.getByTestId('studio-approve-row-job-pr')).toContainText('DECLINED · PR CLOSED')
  })
})
