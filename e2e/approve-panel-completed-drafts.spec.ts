/**
 * approve-panel-completed-drafts.spec.ts
 *
 * E2E for the Approve & Track panel surfacing completed drafts. A job whose
 * generation finished (status 'drafting' WITH content) must render as an
 * actionable "APPROVE → SHIP" row — the 2026-08 regression where completed
 * drafts only got a passive footnote and never appeared for approval.
 *
 * The jobs API is mocked so the test asserts the RENDERING without needing a
 * real job row. A still-generating job (status 'drafting' with NO content) is
 * asserted NOT to render an approve row.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/approve-panel-completed-drafts.spec.ts
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

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
    status: 'drafting',
    source_job_id: null,
    slug: null,
    content: null,
    branch_name: null,
    content_path: null,
    pr_url: null,
    pr_number: null,
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

/** Completed draft: status drafting WITH content (ready to approve). */
const COMPLETED_DRAFT = makeJob({ id: 'job-completed', content: '---\ntitle: UK Dependent Visa Guide 2026\n---\n\n# UK Dependent Visa Guide 2026\n\n## In 60 seconds\n- Confirm the form list on the official site.\n\n## Eligibility\nYou confirm which route applies, then you collect evidence.\n', word_count: 2500 })
/** Still generating: status drafting with NO content (must NOT be approvable). */
const GENERATING_JOB = makeJob({ id: 'job-generating', content: null, word_count: 0 })

function emptyQueueBody(jobs: unknown[]) {
  return JSON.stringify({
    jobs,
    count: jobs.length,
    total: jobs.length,
    hasMore: false,
    offset: 0,
    limit: 40,
    summary: { total: jobs.length, pending: 0, drafting: jobs.length, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 0 },
  })
}

test.describe('Approve & Track surfaces completed drafts (admin)', () => {
  test('a completed drafting job renders an APPROVE → SHIP row; a still-generating job does not', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mock the jobs list: one completed draft + one still-generating job ──
    const queue = [COMPLETED_DRAFT, GENERATING_JOB]
    await page.route('**/api/content-studio/jobs?limit=100*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueueBody(queue) })
    })
    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueueBody(queue) })
    })
    await page.route('**/api/content-studio/jobs', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueueBody(queue) })
        return
      }
      await route.continue()
    })

    // ── Navigate straight to Approve & Track ────────────────────────────────
    await page.goto(`${BASE}/dashboard/admin/content?tab=approve`, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('studio-approve-panel')
    await panel.waitFor({ state: 'visible', timeout: 30000 })

    // The completed draft renders an actionable approve row with the CTA.
    const completedRow = page.getByTestId('studio-approve-draft-row-job-completed')
    await expect(completedRow).toBeVisible({ timeout: 15000 })
    await expect(completedRow).toContainText('APPROVE → SHIP')
    await expect(completedRow).toContainText('UK Dependent Visa Guide 2026')
    await expect(completedRow).toContainText('2500 words')

    // The READY TO APPROVE section header counts exactly one completed draft.
    await expect(panel).toContainText('READY TO APPROVE · 1 COMPLETED DRAFT')

    // The still-generating job (no content) must NOT render an approve row.
    await expect(page.getByTestId('studio-approve-draft-row-job-generating')).toHaveCount(0)
  })
})
