/**
 * E2E: Review stage model selector — Entrim Qwen3.6 27B (live review lead).
 *
 * Verifies that the model dropdown in the inline editor sends the correct
 * reviewModel in the PATCH /api/content-studio/reaudit request body. The
 * review lane offers exactly one live family — Entrim Qwen3.6 27B
 * (`entrim-qwen-27b`) — whose model picker value is `qwen3.6-27b`.
 */
import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'

function hasClerkCredentials(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_TEST_EMAIL)
}

async function loginAsAdmin(browser: Browser): Promise<Page | null> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const clerkHeaders = {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  }
  try {
    const userRes = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(process.env.CLERK_TEST_EMAIL!)}`,
      { headers: clerkHeaders },
    )
    if (!userRes.ok) { await page.close(); return null }
    const users = (await userRes.json()) as Array<{ id?: string }>
    const userId = users?.[0]?.id
    if (!userId) { await page.close(); return null }

    const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
      method: 'POST',
      headers: clerkHeaders,
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    })
    if (!tokenRes.ok) { await page.close(); return null }
    const { token } = await tokenRes.json()
    if (!token) { await page.close(); return null }

    const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
    await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 45000 })
    return page
  } catch {
    await page.close()
    return null
  }
}

/** Draft with quality warnings — triggers the Fix all warnings button. */
const DRAFT_WITH_WARNINGS = `---
title: "UK Dependent Visa Guide 2026"
content_type: article
primary_keyword: dependent visa uk
region: UK
publish_mode: pr
---

# UK Dependent Visa Guide 2026

To bring a dependent to the United Kingdom, you must meet specific criteria
set by UK Visas and Immigration. The main visa holder must be in the UK or
applying to come to the UK. This guide covers the eligibility requirements,
documents needed, and the application process for dependent visas.

## In 60 seconds

- Dependents include spouses, civil partners, and children under 18
- Financial requirements apply per dependent
- Applications can be made from inside or outside the UK

## Eligibility

You must demonstrate that your relationship is genuine and subsisting. The
Home Office will assess whether you meet the financial threshold and that
you have adequate accommodation for your dependents.

## Documents

You will need to provide passports, biometric residence permits, and evidence
of your relationship. Each dependent requires their own set of documentation.

## FAQ

### How long does it take?
Processing times vary by application type and location.

### How much does it cost?
The application fee depends on the visa category and number of dependents.

> **Disclaimer:** This content is for educational purposes only and does not constitute legal advice.
`

test.describe('review model selector', () => {
  test('switching to Entrim Qwen sends reviewModel in Fix all warnings API call', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'CLERK_SECRET_KEY + CLERK_TEST_EMAIL required')

    const page = await loginAsAdmin(browser)
    if (!page) return

    // ── Mock the jobs API to return a draft with warnings ──────────────
    const now = new Date().toISOString()
    const job = {
      id: 'test-review-model-job',
      title: 'UK Dependent Visa Guide 2026',
      topic: 'dependent visa uk',
      content_type: 'article',
      tone: 'educational',
      region: 'UK',
      target_repo: 'caseworks',
      status: 'drafting',
      slug: 'uk-dependent-visa-guide',
      content: DRAFT_WITH_WARNINGS,
      word_count: 800,
      seo_score: 65,
      audit_json: {
        score: 65,
        blockers: [],
        warnings: [
          { code: 'dead_internal_link', severity: 'warning', message: 'Internal link does not resolve (HTTP 404)' },
          { code: 'wall_of_text', severity: 'warning', message: 'Several prose blocks are too dense' },
        ],
        humanScore: 100,
      },
      primary_keyword: 'dependent visa uk',
      ship_mode: 'pr',
      indexable: true,
      created_at: now, updated_at: now,
    }

    await page.route('**/api/content-studio/jobs?id=test-review-model-job', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job }) })
    })
    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs: [job] }) })
    })
    await page.route('**/api/content-studio/jobs', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(job) })
        return
      }
      await route.continue()
    })

    // ── Mock reaudit — capture reviewModel on PATCH ────────────────────
    await page.route('**/api/content-studio/reaudit', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true, score: 65, blockers: 0, warnings: 2, humanScore: 100,
            annotations: [],
            warningsData: [
              { code: 'dead_internal_link', message: 'Internal link 404', fix: 'Remove dead link' },
              { code: 'wall_of_text', message: 'Dense prose blocks', fix: 'Break into shorter paragraphs' },
            ],
            depthGate: { ok: true, message: '' },
            shipReady: true,
          }),
        })
        return
      }

      // PATCH — capture reviewModel from the request body
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON()
        await page.evaluate(
          (rm: unknown) => { (window as any).__capturedReviewModel = rm },
          body.reviewModel ?? null,
        )
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true, score: 88, blockers: 0, warnings: 0,
            humanScore: 100, depthGate: { ok: true, message: '' },
            shipReady: true, fixedContent: null, annotations: [],
            warningsData: [], appliedRepairs: ['stripped 1 dead link'],
          }),
        })
        return
      }
      await route.continue()
    })

    // ── Navigate to the studio and open the draft ──────────────────────
    await page.goto(`${BASE}/dashboard/admin/content?job=test-review-model-job`, {
      waitUntil: 'networkidle', timeout: 30000,
    })
    await page.waitForTimeout(3000)

    // Try to find and open the draft
    const draftLink = page.locator('button, a').filter({ hasText: /dependent visa/i }).first()
    if (await draftLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await draftLink.click()
      await page.waitForTimeout(2000)
    }

    // ── Switch model dropdown to Entrim Qwen ────────────────────────────
    const modelSelect = page.locator('select[aria-label="Review AI model"]')
    await expect(modelSelect).toBeVisible({ timeout: 15000 })
    await modelSelect.selectOption('qwen3.6-27b')
    await page.waitForTimeout(500)

    // Verify select value changed
    expect(await modelSelect.inputValue()).toBe('qwen3.6-27b')

    // ── Click Fix all warnings ─────────────────────────────────────────
    const fixWarningsBtn = page.locator('button').filter({ hasText: /Fix all warnings/i }).first()
    await expect(fixWarningsBtn).toBeVisible({ timeout: 5000 })

    // Wait for the PATCH request to fire and be captured (instead of an
    // arbitrary sleep which flakes on cold CI starts).
    const patchPromise = page.waitForRequest(
      (req) => req.method() === 'PATCH' && req.url().includes('/reaudit'),
      { timeout: 30000 },
    )
    await fixWarningsBtn.click()
    await patchPromise
    // Give the route handler a tick to run page.evaluate
    await page.waitForTimeout(200)

    // ── Assert reviewModel was sent ────────────────────────────────────
    const capturedReviewModel = await page.evaluate(() => (window as any).__capturedReviewModel)
    expect(capturedReviewModel).toBe('entrim-qwen-27b')

    await page.close()
  })
})
