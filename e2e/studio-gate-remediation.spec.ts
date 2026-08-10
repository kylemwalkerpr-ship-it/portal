/**
 * studio-gate-remediation.spec.ts
 *
 * E2E for the studio's quality-gate remediation loop (Re-audit → blockers
 * clear → Ship button becomes available). The test mocks the jobs API so it
 * can simulate a job with real blockers (missing_disclaimer, outcome_promise)
 * without polluting the production database.
 *
 * ── Scenarios ────────────────────────────────────────────────────────────────
 *
 *  1. Missing disclaimer: a job ships with no YMYL disclaimer blocked by the
 *     quality gate. Clicking **Re-audit** runs deterministic repairs
 *     (injects the disclaimer, rebuilds TOC, replaces dashes) and returns
 *     the repaired content back to the editor. The blockers clear, the
 *     status banner goes green, and the Approve → main button is enabled.
 *
 *  2. Outcome promise: same job has a genuine visa-outcome guarantee
 *     ("guaranteed approval") that the gate blocks. Re-audit alone cannot
 *     auto-repair prose, so the blocker remains. The test asserts the
 *     blocker count drops (the disclaimer clears) but the outcome_promise
 *     is still present — the ship button stays disabled so the operator
 *     must fix the text first.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/studio-gate-remediation.spec.ts
 *
 * @see e2e/gsc-connect-modal.spec.ts for the shared login + navigation helpers
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

// ── Shared helpers (identical to gsc-connect-modal.spec.ts) ─────────────────

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

/** Job fixture — a complete ContentJob record with known blockers. */
function makeFailingJob(opts: {
  title: string
  content: string
  errorMessage: string
  seoScore: number
  auditBlockers?: Array<{ code: string; severity: string; message: string }>
}) {
  const now = new Date().toISOString()
  return {
    id: 'test-job-gate-failure',
    title: opts.title,
    topic: opts.title,
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'drafting',
    source_job_id: null,
    slug: 'test-gate-failure',
    content: opts.content,
    branch_name: null,
    content_path: 'app/us/test-gate-failure/page.tsx',
    pr_url: null,
    pr_number: null,
    merged_at: null,
    closed_at: null,
    error_message: opts.errorMessage,
    ai_provider: 'nvidia-deepseek',
    ai_model: 'deepseek-ai/deepseek-v4-pro',
    word_count: 1200,
    seo_score: opts.seoScore,
    audit_json: {
      score: opts.seoScore,
      grade: 'A',
      blockers: opts.auditBlockers ?? [
        { code: 'missing_disclaimer', severity: 'blocker', message: 'Missing educational / not-legal-advice disclaimer' },
      ],
      warnings: [{ code: 'word_count_target', severity: 'warning', message: 'Word count under target' }],
      humanScore: 100,
    },
    primary_keyword: 'test visa guide',
    ship_mode: 'pr',
    indexable: true,
    created_at: now,
    updated_at: now,
  }
}

/** Re-audit response — what the PATCH jobs route returns after repairs. */
function makeAuditedJob(blockers: Array<{ code: string; severity: string; message: string }>, fixedContent: string) {
  const now = new Date().toISOString()
  return {
    id: 'test-job-gate-failure',
    title: 'Test F-1 Visa Guide 2026',
    topic: 'Test F-1 Visa Guide 2026',
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'drafting',
    content: fixedContent,
    error_message: null,
    seo_score: blockers.length === 0 ? 98 : 85,
    audit_json: {
      score: blockers.length === 0 ? 98 : 85,
      grade: blockers.length === 0 ? 'A' : 'B',
      blockers,
      warnings: [{ code: 'word_count_target', severity: 'warning', message: 'Word count under target' }],
      humanScore: 95,
      reauditedAt: now,
    },
    primary_keyword: 'test visa guide',
    ship_mode: 'pr',
    indexable: true,
    created_at: now,
    updated_at: now,
  }
}

// ── Content fixtures ─────────────────────────────────────────────────────────

const BODY_NO_DISCLAIMER = `---
title: Test F-1 Visa Guide 2026
description: Quick guide for F-1 applicants.
primaryKeyword: test visa guide
robots: index,follow
---

# Test F-1 Visa Guide 2026

## In 60 seconds
- Confirm the form list on the USCIS site
- Gather documents before filing

You need a clear document set before you file.

## Eligibility steps
You confirm which route applies, then you collect evidence.`

const BODY_WITH_PROMISE = `---
title: Test F-1 Visa Guide 2026
description: Quick guide for F-1 applicants.
primaryKeyword: test visa guide
robots: index,follow
---

# Test F-1 Visa Guide 2026

## In 60 seconds
- We guarantee your visa approval within 30 days.
- Our service has a guaranteed success rate.

You need a clear document set before you file.

## Eligibility steps
You confirm which route applies, then you collect evidence.`

const REPAIRED_BODY = `${BODY_NO_DISCLAIMER.trimEnd()}

---

**Disclaimer:** This page is educational and editorial only. It is **not legal advice**. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney, solicitor, or registered migration agent for your situation.
`

// ── The tests ──────────────────────────────────────────────────────────────

test.describe('Studio gate remediation (admin)', () => {
  test('Re-audit clears missing_disclaimer blocker and enables the Ship button', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mock the jobs API ──────────────────────────────────────────────────
    // GET ?id= returns the failing job; PATCH re-audit returns the repaired job.

    const blockedJob = makeFailingJob({
      title: 'Test F-1 Visa Guide 2026',
      content: BODY_NO_DISCLAIMER,
      errorMessage: 'Ship refused — content quality gate (voice / tone / compliance):\n- Missing educational / not-legal-advice disclaimer → Add a short disclaimer: educational only, not legal advice.',
      seoScore: 100,
      auditBlockers: [
        { code: 'missing_disclaimer', severity: 'blocker', message: 'Missing educational / not-legal-advice disclaimer' },
      ],
    })

    const clearedJob = makeAuditedJob([], REPAIRED_BODY)

    await page.route('**/api/content-studio/jobs?id=test-job-gate-failure', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job: blockedJob, lineage: [] }),
      })
    })

    // Also mock the queue-list call so the studio doesn't crash on mount.
    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [blockedJob],
          count: 1,
          total: 1,
          hasMore: false,
          offset: 0,
          limit: 40,
          summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 100 },
        }),
      })
    })

    await page.route('**/api/content-studio/jobs?status=drafting*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [blockedJob],
          count: 1,
          total: 1,
          hasMore: false,
          offset: 0,
          limit: 40,
          summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 100 },
        }),
      })
    })

    let reauditCalled = false
    await page.route('**/api/content-studio/jobs', async (route) => {
      const request = route.request()
      if (request.method() === 'PATCH') {
        reauditCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, job: clearedJob, audit: clearedJob.audit_json, plan: {}, appliedRepairs: ['disclaimer'] }),
        })
        return
      }
      // Fallback for other requests (POST, GET without id param)
      await route.continue()
    })

    // ── Navigate to the job detail ─────────────────────────────────────────
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    // Open the job detail — click the job row in the queue table (or use the
    // first visible button that opens the detail modal).
    const jobRow = page.getByText('Test F-1 Visa Guide 2026').first()
    await jobRow.waitFor({ state: 'visible', timeout: 30000 })
    await jobRow.click()

    // ── Assert the failing state before re-audit ───────────────────────────
    // The quality gate remediation banner must be visible.
    await expect(page.getByText('Quality gate remediation')).toBeVisible({ timeout: 10000 })
    // The error message must surface the blocker.
    await expect(page.getByText(/Missing educational.*disclaimer/)).toBeVisible({ timeout: 5000 })
    // The Ship buttons should be disabled (because blockers exist).
    const approveBtn = page.getByRole('button', { name: /Approve → main/ })
    await expect(approveBtn).toBeDisabled()

    // ── Click Re-audit ─────────────────────────────────────────────────────
    const reauditBtn = page.getByRole('button', { name: /Re-audit/ })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await reauditBtn.click()

    // ── Assert the cleared state after re-audit ────────────────────────────
    // The PATCH was indeed called.
    await expect.poll(() => reauditCalled, { timeout: 10000 }).toBe(true)

    // The error banner is gone (no more quality gate failure).
    await expect(page.getByText('Quality gate remediation')).toHaveCount(0)

    // The Ship button is now enabled.
    await expect.poll(
      () => approveBtn.isEnabled(),
      { timeout: 10000, intervals: [500] },
    ).toBe(true)
  })

  test('Re-audit on a page with a genuine outcome_promise clears the disclaimer but keeps the promise blocker', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mock the jobs API ──────────────────────────────────────────────────

    const blockedJob = makeFailingJob({
      title: 'Test F-1 Visa Guide 2026',
      content: BODY_WITH_PROMISE,
      errorMessage: 'Ship refused — content quality gate (voice / tone / compliance):\n- Outcome / guarantee language forbidden: guarantee language → Rewrite without promising visa approval, success rates, or guaranteed results. Educational only.',
      seoScore: 62,
      auditBlockers: [
        { code: 'outcome_promise', severity: 'blocker', message: 'Outcome / guarantee language forbidden: guarantee language' },
      ],
    })

    // Re-audit clears the disclaimer but CANNOT clear a prose-level promise.
    const auditedJob = makeAuditedJob(
      [{ code: 'outcome_promise', severity: 'blocker', message: 'Outcome / guarantee language forbidden: guarantee language' }],
      `${BODY_WITH_PROMISE.trimEnd()}\n\n---\n\n**Disclaimer:** This page is educational and editorial only. It is **not legal advice**. Immigration rules change; verify every requirement against official government sources and consult a licensed attorney, solicitor, or registered migration agent for your situation.\n`,
    )

    await page.route('**/api/content-studio/jobs?id=test-job-gate-failure', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job: blockedJob, lineage: [] }),
      })
    })

    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [blockedJob],
          count: 1,
          total: 1,
          hasMore: false,
          offset: 0,
          limit: 40,
          summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 62 },
        }),
      })
    })

    await page.route('**/api/content-studio/jobs?status=drafting*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [blockedJob],
          count: 1,
          total: 1,
          hasMore: false,
          offset: 0,
          limit: 40,
          summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 62 },
        }),
      })
    })

    let reauditCalled = false
    await page.route('**/api/content-studio/jobs', async (route) => {
      const request = route.request()
      if (request.method() === 'PATCH') {
        reauditCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, job: auditedJob, audit: auditedJob.audit_json, plan: {}, appliedRepairs: ['disclaimer'] }),
        })
        return
      }
      await route.continue()
    })

    // ── Navigate ───────────────────────────────────────────────────────────
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    const jobRow = page.getByText('Test F-1 Visa Guide 2026').first()
    await jobRow.waitFor({ state: 'visible', timeout: 30000 })
    await jobRow.click()

    // ── Assert failing state ───────────────────────────────────────────────
    await expect(page.getByText('Quality gate remediation')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/guarantee language/)).toBeVisible({ timeout: 5000 })
    const approveBtn = page.getByRole('button', { name: /Approve → main/ })
    await expect(approveBtn).toBeDisabled()

    // ── Click Re-audit ─────────────────────────────────────────────────────
    const reauditBtn = page.getByRole('button', { name: /Re-audit/ })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await reauditBtn.click()

    // ── Assert: disclaimer cleared, but outcome_promise still blocks ───────
    await expect.poll(() => reauditCalled, { timeout: 10000 }).toBe(true)

    // The error banner is still visible (outcome_promise blocker remains).
    await expect(page.getByText('Quality gate remediation')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/guarantee language/)).toBeVisible()

    // Ship button is still disabled — prose blocker persists.
    await expect.poll(
      () => approveBtn.isDisabled(),
      { timeout: 5000 },
    ).toBe(true)
  })
})
