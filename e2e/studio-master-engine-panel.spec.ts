/**
 * studio-master-engine-panel.spec.ts
 *
 * E2E for the Master SEO Engine panel (Review stage) v2 report surface:
 *
 *  1. Mock a drafted job via the jobs API and open it in the editor.
 *  2. Mock the engine endpoint (`POST /api/seo-engine/master`) with a full v2
 *     report carrying the probability ladder, derived features and governance.
 *  3. Click **Run full analysis** and assert the panel renders:
 *       · the ranking probability ladder (top-100 → #1 labels + EV chip)
 *       · the derived-features grid (Competitive gap / Information-gain / …)
 *       · the model-governance card (confidence % + data caveats)
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the tests are skipped. Run:
 *
 *     npx playwright test e2e/studio-master-engine-panel.spec.ts
 *
 * @see e2e/studio-review-drafts.spec.ts for the shared Review-stage login pattern
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3002'

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
    console.warn('[engine-panel-e2e] no Clerk user found for test email')
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
    console.warn('[engine-panel-e2e] failed to create sign-in token')
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

const DRAFT_ID = 'test-engine-panel-001'

const DRAFT_CONTENT = `---
title: Engine Panel Job
description: A drafted guide for the engine panel test.
primaryKeyword: engine panel visa guide
robots: index,follow
---

# Engine Panel Job

## In 60 seconds
- Confirm the eligibility route on the official site
- Gather documents before filing

## Documents checklist
Passport, proof of funds, and a valid sponsor letter.

---

*This guide is for general information and educational purposes only. It is not legal advice.*
`

function makeDraftedJob() {
  const now = new Date().toISOString()
  return {
    id: DRAFT_ID,
    title: 'Engine Panel Job',
    topic: 'Engine Panel Job',
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'drafting',
    source_job_id: null,
    slug: 'engine-panel-job',
    content: DRAFT_CONTENT,
    branch_name: null,
    content_path: 'app/us/engine-panel-job/page.tsx',
    pr_url: null,
    pr_number: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: 'nvidia-deepseek',
    ai_model: 'deepseek-ai/deepseek-v4-flash-0731',
    word_count: 950,
    seo_score: 92,
    audit_json: { score: 92, grade: 'A', blockers: [], warnings: [], humanScore: 95 },
    primary_keyword: 'engine panel visa guide',
    ship_mode: 'pr',
    indexable: true,
    created_at: now,
    updated_at: now,
  }
}

const SUBS = {
  intent: { score: 0.72, coverage: 0.5 },
  content: { score: 0.74, coverage: 0.5 },
  semantic: { score: 0.6, coverage: 0.4 },
  technical: { score: 0.8, coverage: 0.3 },
  links: { score: 0.55, coverage: 0.4 },
  eeat: { score: 0.7, coverage: 0.5 },
  schema: { score: 0.4, coverage: 0.5 },
  serp: { score: 0.5, coverage: 0.3 },
  freshness: { score: 0.65, coverage: 0.5 },
  experience: { score: 0.7, coverage: 0.4 },
}

/** A full v2 engine report — ladder, derived features and governance present. */
function makeEngineReport() {
  return {
    generatedAt: new Date().toISOString(),
    intent: 'procedural',
    intentLabel: 'PROCEDURAL · YMYL',
    composite: 74,
    grade: 'B',
    weights: {
      intent: 0.06, content: 0.26, semantic: 0.12, technical: 0.1, links: 0.1,
      eeat: 0.1, schema: 0.1, serp: 0.06, freshness: 0.05, experience: 0.05,
    },
    subsystems: SUBS,
    deltas: {
      intent: 0.02, content: 0.14, semantic: 0.05, technical: 0.2, links: 0.05,
      eeat: 0.15, schema: -0.1, serp: 0, freshness: 0.05, experience: 0.1,
    },
    baseline: {
      intent: 0.7, content: 0.6, semantic: 0.55, technical: 0.6, links: 0.5,
      eeat: 0.55, schema: 0.5, serp: 0.5, freshness: 0.6, experience: 0.6,
    },
    coverage: { computed: 110, total: 240, pct: 46 },
    risks: [{ code: 'cannibalization', severity: 'warning', message: '1 other URL(s) target the same intent' }],
    recommendations: [
      { code: 'faq_schema', open: true, priority: 90, subsystem: 'schema', action: 'Add FAQPage JSON-LD', lift: 0.09, confidence: 0.7, effort: 'low', value: 1 },
    ],
    prediction: {
      top100Probability: 99,
      top20Probability: 97,
      top10Probability: 95,
      top3Probability: 82,
      position1Probability: 58,
      clickProbability: 91,
      conversionProbability: 5,
      expectedLift: 9,
      expectedTrafficLift: 120,
      expectedValue: 88,
    },
    derived: {
      competitiveGap: 0.08,
      contentSuperiority: 0.9,
      informationGainAdvantage: 0.72,
      authorityGap: 0.2,
      linkGap: 0.2,
      freshnessAdvantage: 0.6,
      experienceAdvantage: 0.7,
      trustAdvantage: 0.85,
      intentFitAdvantage: 0.55,
      evidenceAdvantage: 0.7,
      optimizationHeadroom: 0.26,
    },
    governance: {
      confidence: 0.74,
      modelVersion: '2.0.0',
      caveats: ['No GSC data — SERP performance slots are dark'],
    },
    adaptation: { usedLearned: false },
    computedSignals: [],
    trace: [],
  }
}

// ── Route mocks ─────────────────────────────────────────────────────────────

async function installRouteMocks(page: Page): Promise<void> {
  const drafted = makeDraftedJob()

  await page.route('**/api/content-studio/jobs**', async (route) => {
    if (route.request().method() === 'GET') {
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
          summary: { total: 1, pending: 0, drafting: 1, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 92 },
        }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, job: drafted }) })
  })

  // The Master SEO Engine endpoint — returns the full v2 report.
  await page.route('**/api/seo-engine/master', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, report: makeEngineReport(), learn: null }),
    })
  })

  // Other studio mount fetches — keep the UI quiet.
  await page.route('**/api/content-studio/reaudit', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, score: 92, blockers: 0, warnings: 0, annotations: [], warningsData: [] }) })
  })
  await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, suggestions: [] }) })
  })
  await page.route('**/api/seo-engine/gate', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, runs: [] }) })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Test
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Studio Master Engine panel — ladder, derived features, governance', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[engine-panel-e2e] skipping — Clerk credentials not configured')
      return
    }
    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  test('Run full analysis renders the ladder, derived features and governance', async () => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured')

    await installRouteMocks(page)

    // Open the studio Review stage and the drafted job in the editor.
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })
    const reviewPill = page.locator('#studio-tab-draft')
    await reviewPill.waitFor({ state: 'visible', timeout: 30000 })
    await reviewPill.click()

    const draftRow = page.getByTestId(`studio-review-draft-${DRAFT_ID}`)
    await expect(draftRow).toBeVisible({ timeout: 8000 })
    await draftRow.getByRole('button', { name: /Open in editor/ }).click()

    // The engine panel mounts once a job with content is selected.
    const panel = page.getByTestId('studio-master-engine')
    await expect(panel).toBeVisible({ timeout: 15000 })

    // Run the engine — the mocked endpoint returns the full v2 report.
    const runBtn = panel.getByRole('button', { name: /Run full analysis/ })
    await expect(runBtn).toBeVisible({ timeout: 8000 })
    await expect(runBtn).toBeEnabled({ timeout: 5000 })
    await runBtn.dispatchEvent('click')

    // ── Ranking probability ladder ──
    await expect(panel.getByText('Ranking probability ladder')).toBeVisible({ timeout: 10000 })
    // '#1' also labels the top recommendation's rank badge, so pin each ladder
    // label to its first occurrence (the ladder renders before the recs list).
    for (const label of ['top-100', 'top-20', 'top-10', 'top-3', '#1']) {
      await expect(panel.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 5000 })
    }
    await expect(panel.getByText('EV index')).toBeVisible({ timeout: 5000 })

    // ── Derived features grid ──
    await expect(panel.getByText('Derived features — higher-order math')).toBeVisible({ timeout: 5000 })
    for (const label of ['Competitive gap', 'Content superiority', 'Information-gain', 'Authority gap', 'Headroom']) {
      await expect(panel.getByText(label)).toBeVisible({ timeout: 5000 })
    }

    // ── Model governance card ──
    await expect(panel.getByText('Model governance · v2.0.0')).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('Confidence', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('74%', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('No GSC data — SERP performance slots are dark')).toBeVisible({ timeout: 5000 })
  })
})
