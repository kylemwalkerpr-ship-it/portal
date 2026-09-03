/**
 * brief-model-selector.spec.ts
 *
 * E2E for the Research-stage brief model dropdown (Entrim Qwen3.6 27B /
 * Entrim DeepSeek V4 Flash). Asserts that selecting **Qwen3.6 27B** in the
 * Brief Assembly panel causes the Generate Full Brief request to
 * `/api/content-studio/suggest-brief` to carry
 * `aiProvider: 'entrim-qwen-27b'` — proving the selectable choice actually
 * reaches the brief endpoint's policy (lib/seoFactory/briefModel), which only
 * honors the two live Entrim pins (Qwen lead, DeepSeek complement).
 *
 * The suggest-brief route is mocked so the test asserts the REQUEST payload
 * without depending on Entrim credits/billing state.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/brief-model-selector.spec.ts
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

/** A complete suggest-brief success response (mirrors the route's return). */
function makeBriefResponse() {
  return {
    ok: true,
    suggestedH1: 'UK Dependent Visa Guide 2026',
    h2Outline: [
      'Eligibility Requirements',
      'Application Process',
      'Required Documents',
      'Timeline & Fees',
      'Frequently Asked Questions',
    ],
    shortTail: ['uk dependent visa', 'dependent visa uk', 'uk visa guide', 'visa requirements', 'apply for visa'],
    longTail: ['uk dependent visa application process', 'uk spouse dependent visa documents'],
    kwH2Map: { 'uk dependent visa': 'Eligibility Requirements' },
    sources: ['https://www.gov.uk/uk-family-visas'],
    interlinkTargets: [
      { label: 'UK Family Visas', url: 'https://legal.yousafeconsultancy.com/uk/family-visas/' },
      { label: 'UK Spouse Visa', url: 'https://legal.yousafeconsultancy.com/uk/spouse-visa-document-checklist/' },
    ],
    targetSlug: 'uk/dependent-visa-guide-2026',
    metaDescription: 'Complete UK dependent visa guide 2026 — eligibility, documents, fees, and timelines.',
    recommendedTone: 'professional',
    recommendedAudience: 'immigration applicants',
    minWords: 2200,
    maxWords: 2800,
    readabilityLevel: 'general audience',
    reasoning: 'GSC demand signals strong for dependent visa queries in the UK region.',
  }
}

test.describe('Research-stage brief model selector (admin)', () => {
  test('selecting Qwen3.6 27B sends aiProvider entrim-qwen-27b on Generate Full Brief', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    let capturedBody: Record<string, unknown> | null = null

    // ── Mock the brief endpoint: capture the payload, return a full brief ──
    await page.route('**/api/content-studio/suggest-brief', async (route) => {
      const req = route.request()
      if (req.method() === 'POST') {
        capturedBody = (req.postDataJSON() || {}) as Record<string, unknown>
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeBriefResponse()),
        })
        return
      }
      await route.continue()
    })

    // Mock the queue-list calls so the studio doesn't crash on mount.
    const emptyQueue = JSON.stringify({
      jobs: [], count: 0, total: 0, hasMore: false, offset: 0, limit: 40,
      summary: { total: 0, pending: 0, drafting: 0, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 0 },
    })
    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueue })
    })
    await page.route('**/api/content-studio/jobs', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueue })
        return
      }
      await route.continue()
    })

    // ── Navigate straight to the Research & Plan stage ─────────────────────
    await page.goto(`${BASE}/dashboard/admin/content?tab=research`, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('studio-brief-assembly')
    await panel.waitFor({ state: 'visible', timeout: 30000 })

    // Topic is required before Generate Full Brief is enabled. (Labels are
    // not htmlFor-associated in this panel — match on the placeholder.)
    await page.getByPlaceholder('What users search for').fill('uk dependent visa')

    // The brief model dropdown (Qwen lead default) — select Qwen3.6 27B.
    const modelSelect = page.locator('select:has(option[value="qwen3.6-27b"])').first()
    await modelSelect.waitFor({ state: 'visible', timeout: 10000 })
    await modelSelect.selectOption('qwen3.6-27b')
    await expect(modelSelect).toHaveValue('qwen3.6-27b')

    // Click Generate Full Brief.
    await page.getByRole('button', { name: /Generate Full Brief/i }).click()

    // ── The request must carry the selected model ──────────────────────────
    await expect.poll(() => capturedBody, { timeout: 10000 }).not.toBeNull()
    expect(capturedBody!.aiProvider).toBe('entrim-qwen-27b')
    // Sanity: the brief still flows into the form (title updated).
    await expect(page.getByPlaceholder('e.g. Complete Guide to the UK Spouse Visa 2026')).toHaveValue('UK Dependent Visa Guide 2026', { timeout: 10000 })
  })

  test('selecting DeepSeek V4 Flash sends aiProvider entrim-deepseek', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    let capturedBody: Record<string, unknown> | null = null

    await page.route('**/api/content-studio/suggest-brief', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = (route.request().postDataJSON() || {}) as Record<string, unknown>
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeBriefResponse()),
        })
        return
      }
      await route.continue()
    })
    const emptyQueue = JSON.stringify({
      jobs: [], count: 0, total: 0, hasMore: false, offset: 0, limit: 40,
      summary: { total: 0, pending: 0, drafting: 0, pr_created: 0, merged: 0, closed: 0, failed: 0, avgScore: 0 },
    })
    await page.route('**/api/content-studio/jobs?status=*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: emptyQueue })
    })

    await page.goto(`${BASE}/dashboard/admin/content?tab=research`, { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('studio-brief-assembly')
    await panel.waitFor({ state: 'visible', timeout: 30000 })

    const modelSelect = page.locator('select:has(option[value="deepseek-v4-flash"])').first()
    await modelSelect.waitFor({ state: 'visible', timeout: 10000 })
    await modelSelect.selectOption('deepseek-v4-flash')
    await expect(modelSelect).toHaveValue('deepseek-v4-flash')

    await page.getByPlaceholder('What users search for').fill('uk dependent visa')
    await page.getByRole('button', { name: /Generate Full Brief/i }).click()

    await expect.poll(() => capturedBody, { timeout: 10000 }).not.toBeNull()
    expect(capturedBody!.aiProvider).toBe('entrim-deepseek')
  })
})
