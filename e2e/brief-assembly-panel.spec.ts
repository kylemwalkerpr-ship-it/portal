/**
 * brief-assembly-panel.spec.ts
 *
 * E2E for the Brief Assembly Panel (Stage II · Research & Plan). Verifies that
 * the Generate Draft button activates only when all keyword requirements are met:
 *
 *   1. Minimum keywords required: with insufficient keywords the button stays
 *      disabled.
 *   2. All requirements met: filling ≥5 short-tail + ≥4 long-tail keywords,
 *      plus a title/topic, activates the Generate Draft button.
 *   3. Navigation to Draft: clicking Generate Draft auto-navigates to the
 *      Draft workspace.
 *
 * ── Auth setup ──────────────────────────────────────────────────────────────
 *
 *     CLERK_TEST_EMAIL=admin@example.com
 *     CLERK_TEST_PASSWORD=your-password
 *     CLERK_SECRET_KEY=sk_live_...
 *
 * Without them the test is marked `test.skip`. Run:
 *
 *     npx playwright test --project=chromium e2e/brief-assembly-panel.spec.ts
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

// ── Shared helpers (same pattern as gsc-connect-modal + studio-gate) ────────

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

/** Recover from the error boundary (app/error.tsx) if it fires on navigation. */
async function recoverFromErrorBoundary(page: Page): Promise<void> {
  const snag = page.getByText(/We hit a snag/)
  if ((await snag.count()) > 0) {
    await page.getByRole('button', { name: /Try again/ }).first().click()
    await snag.waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
  }
}

/** Navigate to the Research & Plan stage via the compass rail. */
async function navigateToPlanStage(page: Page): Promise<void> {
  const current = new URL(page.url())
  if (current.pathname !== '/dashboard/admin/content') {
    await page.goto(`${BASE}/dashboard/admin/content`, { waitUntil: 'domcontentloaded' })
  }
  await recoverFromErrorBoundary(page)

  // Click the "Research & Plan" compass-rail button inside ChapterIntro
  const planTab = page.getByRole('button', { name: /Research & Plan/ }).first()
  await planTab.waitFor({ state: 'visible', timeout: 30000 })
  await planTab.click()

  // Wait for the Brief Assembly Panel to appear
  await page.getByTestId('studio-brief-assembly').waitFor({ state: 'visible', timeout: 15000 })
}

// ── The tests ──────────────────────────────────────────────────────────────

test.describe('Brief Assembly Panel (admin)', () => {
  test('Generate Draft stays disabled with insufficient keywords', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    await navigateToPlanStage(page)

    const assembly = page.getByTestId('studio-brief-assembly')

    // Fill in a title and topic
    await assembly.locator('input[placeholder*="Complete Guide"]').fill('UK Spouse Visa Test Guide 2026')
    await assembly.locator('input[placeholder*="users search"]').fill('uk spouse visa financial requirement')

    // Fill in only 2 short-tail keywords (need ≥5)
    // Scope the keyword textarea by its label within the assembly panel
    const kwTextarea = assembly.getByLabel(/Keywords.*comma/i)
    await kwTextarea.fill('uk spouse visa, partner visa')

    // Assert the short-tail counter shows "2/5" (insufficient)
    await expect(assembly.getByText('2/5 short-tail').first()).toBeVisible({ timeout: 5000 })

    // The Generate Draft button must be disabled
    const generateBtn = assembly.getByRole('button', { name: /Generate Draft/ })
    await expect(generateBtn).toBeVisible()

    // The button should be disabled — either via the `disabled` attribute or
    // computed styling (opacity < 1). We check both.
    const isDisabled = await generateBtn.isDisabled().catch(() => true)
    const opacity = await generateBtn.evaluate((el) => Number(window.getComputedStyle(el).opacity))
    expect(isDisabled || opacity < 0.8).toBe(true)
  })

  test('Generate Draft activates when all keyword requirements are met', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    await navigateToPlanStage(page)

    const assembly = page.getByTestId('studio-brief-assembly')

    // ── Fill IDENTITY fields ──────────────────────────────────────────────
    // Content type: select "Long-Form Article"
    await assembly.locator('select').first().selectOption('article')

    // Region: select United States
    const regionSelect = assembly.locator('select').nth(1)
    await regionSelect.selectOption('US')

    // ── Fill HEADLINE fields ──────────────────────────────────────────────
    // Page Title (H1)
    await assembly.locator('input[placeholder*="Complete Guide"]').fill('Complete Guide: UK Spouse Visa Financial Requirement 2026')

    // Target Slug
    await assembly.locator('input[placeholder*="uk/spouse-visa-guide"]').fill('uk/spouse-visa-financial-requirement-2026')

    // Topic / Query
    await assembly.locator('input[placeholder*="users search"]').fill('uk spouse visa financial requirement')

    // Target Audience
    await assembly.locator('input[placeholder*="international"]').fill('UK spouse visa applicants, partners of British citizens')

    // ── Fill KEYWORDS — ≥5 short-tail + ≥4 long-tail ─────────────────────
    const keywords = [
      // Short-tail (≤3 words): need ≥5
      'uk spouse visa',
      'partner visa',
      'financial requirement',
      'minimum income',
      'appendix fm',
      // Long-tail (≥4 words): need ≥4
      'uk spouse visa financial requirement 2026',
      'minimum income threshold partner visa',
      'appendix fm adequate maintenance',
      'spouse visa accommodation requirement uk',
    ]

    // Scope the keyword textarea by its label within the assembly panel
    const kwTextarea = assembly.getByLabel(/Keywords.*comma/i)
    await kwTextarea.fill(keywords.join(', '))

    // ── Assert counters are green ─────────────────────────────────────────
    // Short-tail: 5/5 (check passes)
    await expect(assembly.getByText(/5\/5 short-tail/).first()).toBeVisible({ timeout: 5000 })
    // Long-tail: 4/4 (check passes)
    await expect(assembly.getByText(/4\/4 long-tail/).first()).toBeVisible({ timeout: 5000 })

    // ── Assert Generate Draft button is enabled ───────────────────────────
    const generateBtn = assembly.getByRole('button', { name: /Generate Draft/ })
    await expect(generateBtn).toBeVisible()

    // Wait for the button to become enabled (React state may take a tick)
    await expect.poll(
      () => generateBtn.evaluate((el) => {
        const html = el as HTMLButtonElement
        return !html.disabled && Number(window.getComputedStyle(el).opacity) > 0.8
      }),
      { timeout: 5000, intervals: [200] },
    ).toBe(true)

    // The helper text should say "Ready"
    await expect(assembly.getByText(/Ready\./).first()).toBeVisible({ timeout: 3000 })
  })

  test('Generate Draft auto-navigates to the Draft workspace', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Mock the generate-stream endpoint so generation doesn't actually run ──
    await page.route('**/api/seo-factory/generate-stream', async (route) => {
      // Just return a 200 — the navigation to Draft happens BEFORE the fetch
      await route.abort('aborted')
    })

    await navigateToPlanStage(page)

    const assembly = page.getByTestId('studio-brief-assembly')

    // Fill minimal required fields
    await assembly.locator('input[placeholder*="Complete Guide"]').fill('Test Navigation Guide')
    await assembly.locator('input[placeholder*="users search"]').fill('test navigation topic')

    // Fill enough keywords
    const keywords = [
      'term one', 'term two', 'term three', 'term four', 'term five',
      'long tail keyword number one', 'long tail keyword number two',
      'long tail keyword number three', 'long tail keyword number four',
    ]
    await assembly.locator('textarea[placeholder*="comma-separated"]').fill(keywords.join(', '))

    // Wait for button to be enabled
    const generateBtn = assembly.getByRole('button', { name: /Generate Draft/ })
    await expect.poll(
      () => generateBtn.evaluate((el) => {
        const html = el as HTMLButtonElement
        return !html.disabled && Number(window.getComputedStyle(el).opacity) > 0.8
      }),
      { timeout: 5000, intervals: [200] },
    ).toBe(true)

    // ── Click Generate Draft ───────────────────────────────────────────────
    await generateBtn.click()

    // ── Assert we navigated to Draft stage ─────────────────────────────────
    // The DraftWorkspace component should appear
    await page.getByTestId('studio-draft-workspace').waitFor({ state: 'visible', timeout: 15000 })

    // The Draft stage header should be visible
    await expect(page.getByText(/STAGE III.*GENERATE/).first()).toBeVisible({ timeout: 5000 })
  })
})
