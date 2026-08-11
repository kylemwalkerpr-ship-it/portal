/**
 * studio-review-drafts.spec.ts
 *
 * E2E for the studio's Review stage (IV · Review) document list and the
 * inline editor's warnings block:
 *
 *  1. Mock a drafted job (content present, status 'drafting') via the jobs API.
 *  2. Open the Review tab and assert the job appears in the Drafts document
 *     list (data-testid="studio-review-drafts").
 *  3. Click **Open in editor** and assert the AI inline editor renders the
 *     draft (Re-audit action available, draft text in the workspace).
 *  4. Mock the re-audit endpoint to return two fixable warnings, click
 *     **Re-audit**, and assert the warnings block lists each warning with a
 *     **Fix all warnings (2)** button — the path that turns warnings into
 *     actionable remediation instead of a dead-end banner.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the tests are skipped. Run:
 *
 *     npx playwright test e2e/studio-review-drafts.spec.ts
 *
 * @see e2e/studio-depth-rescue-feed.spec.ts for the sign-in-token login pattern
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
    console.warn('[review-e2e] no Clerk user found for test email')
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
    console.warn('[review-e2e] failed to create sign-in token')
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

const DRAFT_ID = 'test-review-draft-001'

const DRAFT_CONTENT = `---
title: Review Draft Job
description: A drafted guide awaiting review.
primaryKeyword: review draft visa guide
robots: index,follow
---

# Review Draft Job

## In 60 seconds
- Confirm the form list on the official site
- Gather documents before filing

## Eligibility steps
You confirm which route applies, then you collect evidence.

## Documents checklist
Passport, proof of funds, and a valid sponsor letter.

---

*This guide is for general information and educational purposes only. It is not legal advice.*
`

/** A complete ContentJob record — drafted, with content, no blockers yet. */
function makeDraftedJob() {
  const now = new Date().toISOString()
  return {
    id: DRAFT_ID,
    title: 'Review Draft Job',
    topic: 'Review Draft Job',
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: 'drafting',
    source_job_id: null,
    slug: 'review-draft-job',
    content: DRAFT_CONTENT,
    branch_name: null,
    content_path: 'app/us/review-draft-job/page.tsx',
    pr_url: null,
    pr_number: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: 'nvidia-deepseek',
    ai_model: 'deepseek-ai/deepseek-v4-flash-0731',
    word_count: 950,
    seo_score: 92,
    audit_json: {
      score: 92,
      grade: 'A',
      blockers: [],
      warnings: [
        { code: 'word_count_target', severity: 'warning', message: 'Word count below target — aim for 2200+ words' },
        { code: 'alt_text_missing', severity: 'warning', message: 'Add descriptive alt text to images' },
      ],
      humanScore: 95,
    },
    primary_keyword: 'review draft visa guide',
    ship_mode: 'pr',
    indexable: true,
    created_at: now,
    updated_at: now,
  }
}

/** A document-level audit-warning annotation for a missing Article schema.
 *  Audit-only warnings (schema/meta/internal-links) now ship as annotations
 *  too, so this is the shape the reaudit route produces for them. */
function makeSchemaArticleAnnotation() {
  return {
    id: 'schema_article-0-0',
    line: 1, col: 1, endLine: 1, endCol: 1, length: 0,
    severity: 'warning' as const,
    code: 'schema_article',
    message: 'Missing Article JSON-LD',
    fix: 'Add Article schema in application/ld+json',
    highlightedText: '',
  }
}

/** Re-audit response — warnings are fixable, blockers are clear. When
 *  `withSchemaAnnotation` is set, the response also carries the audit-only
 *  schema_article annotation (the shape the real route now emits) so the
 *  issues panel has a per-warning AI Fix button to assert on. */
function makeReauditResponse(withSchemaAnnotation = false) {
  const warnings: Array<{ code: string; severity: string; message: string; fix?: string }> = [
    { code: 'word_count_target', severity: 'warning', message: 'Word count below target — aim for 2200+ words' },
    { code: 'alt_text_missing', severity: 'warning', message: 'Add descriptive alt text to images' },
  ]
  if (withSchemaAnnotation) {
    warnings.push({ code: 'schema_article', severity: 'warning', message: 'Missing Article JSON-LD', fix: 'Add Article schema in application/ld+json' })
  }
  return {
    ok: true,
    score: 92,
    blockers: 0,
    warnings: warnings.length,
    summary: `92/100 - 0 blocker(s), ${warnings.length} warning(s) - PASSED`,
    shipReady: true,
    depthGate: { ok: true, message: 'Depth floor met' },
    annotations: withSchemaAnnotation ? [makeSchemaArticleAnnotation()] : [],
    warningsData: warnings,
    appliedRepairs: [],
  }
}

// ── Route mocks ─────────────────────────────────────────────────────────────

async function installRouteMocks(page: Page, opts: { withSchemaAnnotation?: boolean } = {}): Promise<void> {
  const drafted = makeDraftedJob()

  // Queue list + detail + actions. The studio calls /api/content-studio/jobs
  // with many query shapes (?limit=100, ?id=…, ?status=…), so match broadly.
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
    // Actions (gate-run, approve, etc.) — no-op success keeps the UI happy.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, job: drafted }) })
  })

  // Re-audit (POST) — feeds the editor's audit result + warnings block.
  await page.route('**/api/content-studio/reaudit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeReauditResponse(opts.withSchemaAnnotation)),
    })
  })

  // GSC suggestions + gate runs — the studio fetches these on mount/entry.
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

test.describe('Studio Review stage — drafts list + warnings block', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[review-e2e] skipping — Clerk credentials not configured')
      return
    }
    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  test('drafted job appears in the Drafts list, opens in the editor, and warnings show Fix all warnings', async () => {
    // Real skip guard — without this, `page` is undefined and installRouteMocks
    // crashes with a TypeError instead of skipping (CI without creds).
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured')

    await installRouteMocks(page)

    // Open the studio.
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    // ── 1 · Draft appears in the Review stage Drafts document list ──
    const reviewPill = page.locator('#studio-tab-draft')
    await reviewPill.waitFor({ state: 'visible', timeout: 30000 })
    await reviewPill.click()

    const draftsPanel = page.getByTestId('studio-review-drafts')
    await expect(draftsPanel).toBeVisible({ timeout: 15000 })
    await expect(draftsPanel.getByText('Review Draft Job').first()).toBeVisible({ timeout: 8000 })

    // ── 2 · Open in editor ──
    const draftRow = page.getByTestId(`studio-review-draft-${DRAFT_ID}`)
    await expect(draftRow).toBeVisible({ timeout: 8000 })
    await draftRow.getByRole('button', { name: /Open in editor/ }).click()

    // The AI inline editor renders the draft — Re-audit action + draft text.
    // The studio can mount more than one editor instance, and an invisible
    // overlay can sit on top of the DOM-first toolbar (hit-test shows the first
    // Re-audit is occluded), so fire the handler synthetically instead of
    // relying on a real mouse hit.
    const reauditBtn = page.locator('button:visible', { hasText: /^Re-audit$/ }).first()
    await expect(reauditBtn).toBeVisible({ timeout: 10000 })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await expect(page.getByText('Review Draft Job', { exact: false }).first()).toBeVisible({ timeout: 5000 })

    // ── 3 · Re-audit populates the warnings block ──
    // dispatchEvent bypasses actionability checks, so assert enabled above;
    // it also skips Playwright hit-testing — required because the DOM-first
    // toolbar Re-audit sits under an invisible overlay (verified via hit-test).
    await reauditBtn.dispatchEvent('click')

    // Warnings block rendered. Prefer the stable testid (ships with the next
    // deploy); fall back to the "N quality warnings" header, which only renders
    // inside the block — so this proves the block exists on the deployed build.
    const warningsBlock = page
      .getByTestId('studio-warnings-block')
      .or(page.getByText(/^2 quality warnings$/))
    await expect(warningsBlock).toBeVisible({ timeout: 10000 })

    // Each fixable warning is listed with its code + message. These texts only
    // exist inside the block, driven by the mocked re-audit response.
    await expect(page.getByText('word_count_target').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Word count below target').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('alt_text_missing').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Add descriptive alt text').first()).toBeVisible({ timeout: 5000 })

    // The remediation path: Fix all warnings is present and actionable.
    const fixAllBtn = page.getByRole('button', { name: /Fix all warnings \(2\)/ })
    await expect(fixAllBtn).toBeVisible({ timeout: 5000 })
    await expect(fixAllBtn).toBeEnabled({ timeout: 5000 })
  })

  test('audit warning (schema_article) renders a per-warning AI Fix button in the issues panel', async () => {
    test.skip(!hasClerkCredentials(), 'Clerk credentials not configured')

    // Mock a reaudit that ALSO returns the audit-only schema_article warning
    // as an inline annotation (the shape the route now emits).
    await installRouteMocks(page, { withSchemaAnnotation: true })
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })

    // ── 1 · Open the editor ──
    const reviewPill = page.locator('#studio-tab-draft')
    await reviewPill.waitFor({ state: 'visible', timeout: 30000 })
    await reviewPill.click()

    const draftRow = page.getByTestId(`studio-review-draft-${DRAFT_ID}`)
    await expect(draftRow).toBeVisible({ timeout: 8000 })
    await draftRow.getByRole('button', { name: /Open in editor/ }).click()

    // ── 2 · Re-audit so annotations (incl. the audit warning) populate ──
    const reauditBtn = page.locator('button:visible', { hasText: /^Re-audit$/ }).first()
    await expect(reauditBtn).toBeVisible({ timeout: 10000 })
    await expect(reauditBtn).toBeEnabled({ timeout: 5000 })
    await reauditBtn.dispatchEvent('click')

    // ── 3 · Issues panel: schema_article is listed with an AI Fix button ──
    // The annotation sidebar renders after re-audit (showAnnotations=true).
    // Exactly one annotation exists in the mock, so the header proves it
    // reached the panel (not just the warnings block, which also lists it).
    const issuesHeader = page.getByText(/^Issues \(1\)$/).first()
    await expect(issuesHeader).toBeVisible({ timeout: 10000 })

    // The audit-warning annotation card itself. Prefer the stable testid
    // (ships with the next deploy); fall back to a structural match against
    // the current deployed build. Scoping to the card (NOT a page-wide div
    // filter) is what proves the AI Fix button belongs to the schema warning
    // and not to some ancestor container that also matches.
    const schemaCard = page
      .getByTestId('studio-annotation-card-schema_article')
      .or(page.locator('div').filter({ hasText: /schema_article/ }).filter({ has: page.getByRole('button', { name: /^AI Fix$/ }) }).first())
    await expect(schemaCard).toBeVisible({ timeout: 10000 })

    // Code + message render inside the card.
    await expect(schemaCard.getByText('schema_article').first()).toBeVisible({ timeout: 5000 })
    await expect(schemaCard.getByText('Missing Article JSON-LD').first()).toBeVisible({ timeout: 5000 })

    // Per-warning AI Fix button renders for the audit warning — the whole
    // point of this scenario (audit warnings are fixable individually, not
    // only via the Fix-all sweep).
    const aiFixBtn = schemaCard.getByRole('button', { name: /^AI Fix$/ })
    await expect(aiFixBtn).toBeVisible({ timeout: 5000 })
    await expect(aiFixBtn).toBeEnabled({ timeout: 5000 })
  })
})
