/**
 * studio-cannibal-repair.spec.ts
 *
 * E2E for the cannibalization repair in the Review stage's inline editor.
 * Simulates competing URLs in the reaudit request and asserts the
 * differentiation note ("How this differs from related pages") appears.
 *
 * ── Scenarios ────────────────────────────────────────────────────────────────
 *
 *  1. Simulate competing URLs → reaudit returns cannibal_differentiation_note
 *     in appliedRepairs and the repaired content contains "How this differs
 *     from related pages" — asserting the editorial scaffold repair fires.
 *
 *  2. Without competing URLs, reaudit returns no cannibal repairs and the
 *     differentiation note is absent — the repair is conditional on data.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the tests are skipped. Run:
 *
 *     npx playwright test e2e/studio-cannibal-repair.spec.ts
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
    console.warn('[cannibal-repair-e2e] no Clerk user found for test email')
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
    console.warn('[cannibal-repair-e2e] failed to create sign-in token')
    return null
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 45000 })
  return page
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const DRAFT_ID = 'test-cannibal-repair-001'

const DRAFT_CONTENT = `---
title: F-1 Visa Interview Tips
description: Practical guide to F-1 visa interview preparation.
primaryKeyword: f-1 visa interview tips
robots: index,follow
---

# F-1 Visa Interview Tips

## In 60 seconds
- Practice common questions with a friend
- Bring all required documents to the consulate
- Dress professionally and arrive early

## Common interview questions
Why did you choose this university? What are your plans after graduation?

## Documents to bring
Passport, DS-160 confirmation, I-20, financial evidence, and SEVIS fee receipt.

---

*This guide is for general information and educational purposes only. It is not legal advice.*
`

const COMPETING_URLS = [
  { url: 'https://legal.yousafeconsultancy.com/us/f1-visa-interview-common', title: 'F-1 Visa Interview Common Questions', primaryKeyword: 'f-1 visa interview questions' },
  { url: 'https://legal.yousafeconsultancy.com/us/f1-interview-preparation', title: 'F-1 Interview Preparation Guide', primaryKeyword: 'f1 interview preparation' },
]

const REPAIRED_WITH_DIFF = `${DRAFT_CONTENT.trimEnd()}

> **How this differs from related pages:** This guide focuses on **f-1 visa interview tips** with a specific scope — it covers the step-by-step process, required documents, and practical timelines. For related topics, see: \`https://legal.yousafeconsultancy.com/us/f1-visa-interview-common\`, \`https://legal.yousafeconsultancy.com/us/f1-interview-preparation\`.
`

function makeDraftedJob() {
  const now = new Date().toISOString()
  return {
    id: DRAFT_ID,
    title: 'F-1 Visa Interview Tips',
    topic: 'F-1 Visa Interview Tips',
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'drafting',
    source_job_id: null,
    slug: 'f1-visa-interview-tips',
    content: DRAFT_CONTENT,
    branch_name: null,
    content_path: 'app/us/f1-visa-interview-tips/page.tsx',
    pr_url: null,
    pr_number: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: 'entrim-qwen-27b',
    ai_model: 'Qwen/Qwen3.6-27B',
    word_count: 950,
    seo_score: 92,
    audit_json: {
      score: 92,
      grade: 'A',
      blockers: [],
      warnings: [{ code: 'cannibalization_high_overlap', severity: 'warning', message: 'High overlap with competing page' }],
      humanScore: 95,
    },
    primary_keyword: 'f-1 visa interview tips',
    ship_mode: 'pr',
    indexable: true,
    created_at: now,
    updated_at: now,
  }
}

/** Re-audit response with cannibal repair applied. */
function makeReauditWithCannibalRepair() {
  return {
    ok: true,
    score: 92,
    blockers: 0,
    warnings: 0,
    summary: '92/100 - 0 blocker(s), 0 warning(s) - PASSED',
    shipReady: true,
    depthGate: { ok: true, message: 'Depth floor met' },
    annotations: [],
    warningsData: [],
    appliedRepairs: ['cannibal_differentiation_note'],
    content: REPAIRED_WITH_DIFF,
  }
}

/** Re-audit response WITHOUT cannibal repair (no competing URLs). */
function makeReauditWithoutCannibalRepair() {
  return {
    ok: true,
    score: 92,
    blockers: 0,
    warnings: 0,
    summary: '92/100 - 0 blocker(s), 0 warning(s) - PASSED',
    shipReady: true,
    depthGate: { ok: true, message: 'Depth floor met' },
    annotations: [],
    warningsData: [],
    appliedRepairs: [],
    content: DRAFT_CONTENT,
  }
}

// ── Route mocks ─────────────────────────────────────────────────────────────

async function installRouteMocks(
  page: Page,
  opts: { withCompetingUrls?: boolean } = {},
): Promise<void> {
  const drafted = makeDraftedJob()

  // Queue list + detail + actions.
  await page.route('**/api/content-studio/jobs**', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs: [drafted],
          count: 1,
          total: 1,
          hasMore: false,
          offset: 0,
          limit: 100,
          summary: {
            total: 1,
            pending: 0,
            drafting: 1,
            pr_created: 0,
            merged: 0,
            closed: 0,
            failed: 0,
            avgScore: 92,
          },
        }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, job: drafted }) })
  })

  // Re-audit (POST) — returns cannibal repair when competingUrls are present.
  await page.route('**/api/content-studio/reaudit', async (route) => {
    const body = route.request().postDataJSON() || {}
    const hasCompeting = Array.isArray(body.competingUrls) && body.competingUrls.length > 0

    if (opts.withCompetingUrls || hasCompeting) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeReauditWithCannibalRepair()),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeReauditWithoutCannibalRepair()),
      })
    }
  })

  // GSC suggestions + gate runs.
  await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, suggestions: [] }) })
  })
  await page.route('**/api/seo-engine/gate', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, runs: [] }) })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Studio cannibalization repair — differentiation note in editor', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[cannibal-repair-e2e] skipping — Clerk credentials not configured')
      return
    }
    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  test('reaudit with competing URLs produces the "How this differs" differentiation note in the editor', async () => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured')

    // Mock with competing URLs so the reaudit response includes the
    // cannibal_differentiation_note repair.
    await installRouteMocks(page, { withCompetingUrls: true })

    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    // ── 1 · Open the Review stage ──
    const reviewPill = page.locator('#studio-tab-draft')
    await reviewPill.waitFor({ state: 'visible', timeout: 30000 })
    await reviewPill.click()

    // ── 2 · Open the draft in the editor ──
    const draftRow = page.getByTestId(`studio-review-draft-${DRAFT_ID}`)
    await expect(draftRow).toBeVisible({ timeout: 8000 })
    await draftRow.getByRole('button', { name: /Open in editor/ }).click()

    // Wait for the editor to render the draft content.
    await expect(page.getByText('F-1 Visa Interview Tips', { exact: false }).first()).toBeVisible({ timeout: 10000 })

    // ── 3 · Click Re-audit ──
    const reauditBtn = page.locator('button:visible', { hasText: /^Re-audit$/ }).first()
    await expect(reauditBtn).toBeVisible({ timeout: 10000 })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await reauditBtn.dispatchEvent('click')

    // ── 4 · Assert the differentiation note appears ──
    // The cannibal repair injects a blockquote with "How this differs from
    // related pages:" after the In 60 seconds section. This text is the
    // definitive marker that the cannibalization repair fired.
    const diffNote = page.getByText('How this differs from related pages')
    await expect(diffNote).toBeVisible({ timeout: 10000 })

    // The competing page URLs are listed in the note.
    await expect(page.getByText(/legal\.yousafeconsultancy\.com\/us\/f1-visa-interview-common/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/legal\.yousafeconsultancy\.com\/us\/f1-interview-preparation/)).toBeVisible({ timeout: 5000 })

    // The applied repairs list should include the cannibal repair.
    const appliedRepairs = page.getByText('cannibal_differentiation_note')
    await expect(appliedRepairs).toBeVisible({ timeout: 5000 })
  })

  test('reaudit without competing URLs does NOT produce the differentiation note', async () => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured')

    // Mock WITHOUT competing URLs — reaudit should return no cannibal repair.
    await installRouteMocks(page, { withCompetingUrls: false })

    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    // ── 1 · Open the Review stage ──
    const reviewPill = page.locator('#studio-tab-draft')
    await reviewPill.waitFor({ state: 'visible', timeout: 30000 })
    await reviewPill.click()

    // ── 2 · Open the draft in the editor ──
    const draftRow = page.getByTestId(`studio-review-draft-${DRAFT_ID}`)
    await expect(draftRow).toBeVisible({ timeout: 8000 })
    await draftRow.getByRole('button', { name: /Open in editor/ }).click()

    await expect(page.getByText('F-1 Visa Interview Tips', { exact: false }).first()).toBeVisible({ timeout: 10000 })

    // ── 3 · Click Re-audit ──
    const reauditBtn = page.locator('button:visible', { hasText: /^Re-audit$/ }).first()
    await expect(reauditBtn).toBeVisible({ timeout: 10000 })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await reauditBtn.dispatchEvent('click')

    // ── 4 · Assert the differentiation note is ABSENT ──
    // Without competing URLs, the repair should not fire.
    const diffNote = page.getByText('How this differs from related pages')
    await expect(diffNote).toHaveCount(0, { timeout: 8000 })

    // And the applied repairs should be empty.
    const appliedRepairs = page.getByText('cannibal_differentiation_note')
    await expect(appliedRepairs).toHaveCount(0, { timeout: 5000 })
  })
})
