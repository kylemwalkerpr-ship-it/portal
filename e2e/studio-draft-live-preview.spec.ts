/**
 * Stage III · Draft — live AI writing preview E2E.
 *
 * Mocks the SSE generation stream with delta text chunks and asserts the
 * ✍️ AI WRITING LIVE panel renders the streamed content in real-time,
 * including the blinking cursor bar animation.
 *
 * Uses Clerk sign-in token auth matching existing E2E patterns.
 */

import { test, expect, type Browser, type Page } from '@playwright/test'

const BASE =
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'

// ── Clerk auth helpers ──────────────────────────────────────────────────────

function hasClerkCredentials(): boolean {
  return !!(
    process.env.CLERK_TEST_EMAIL &&
    process.env.CLERK_SECRET_KEY
  )
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
  const users = (await userRes.json()) as any
  const userId = users?.[0]?.id
  if (!userId) {
    console.warn('[draft-e2e] no Clerk user found for test email')
    return null
  }

  const tokenRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
    method: 'POST',
    headers: clerkHeaders,
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
  })
  const tokenBody = (await tokenRes.json()) as any
  const token = tokenBody?.token
  if (!token) {
    console.warn('[draft-e2e] failed to create sign-in token')
    return null
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content')}`
  await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })

  await page.waitForURL(
    (url) => !url.pathname.includes('/sign-in'),
    { timeout: 45000 },
  )

  return page
}

/** Build an SSE text/event-stream body from an array of events. */
function buildSseBody(events: Array<{ type: string;[key: string]: unknown }>): string {
  return events
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join('') + 'data: [DONE]\n\n'
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Stage III · Draft — Live AI Writing Preview', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[draft-e2e] skipping — Clerk credentials not configured')
      return
    }

    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  // ── Scenario 1: Live preview renders streamed text ───────────────────────

  test('renders streamed delta text in the live preview panel', async () => {
    // Build a realistic SSE stream: connect → provider → delta chunks → final.
    const streamEvents = [
      { type: 'progress', stage: 'connect', message: 'Pipeline connected' },
      { type: 'provider', provider: 'openai', model: 'gpt-5.6-luna' },
      { type: 'delta', text: '# UK Spouse Visa Financial Requirements\n\n' },
      { type: 'delta', text: 'The financial requirement is one of the most critical aspects ' },
      { type: 'delta', text: 'of the UK spouse visa application. Applicants must demonstrate ' },
      { type: 'delta', text: 'a minimum income threshold of £29,000 per year (as of 2026). ' },
      { type: 'delta', text: 'This can be met through employment income, self-employment, ' },
      { type: 'delta', text: 'pension income, cash savings, or a combination of these sources.\n\n' },
      { type: 'delta', text: '## Key Financial Categories\n\n' },
      { type: 'delta', text: '- **Employment income**: salaried or non-salaried, must be ongoing\n' },
      { type: 'delta', text: '- **Self-employment**: last full financial year accounts required\n' },
      { type: 'delta', text: '- **Cash savings**: held for at least 6 months, above £16,000\n' },
      { type: 'delta', text: '- **Pension income**: state, occupational, or private pensions\n' },
      { type: 'attempt', attempt: 1, score: 94, wordCount: 180, goodEnough: true },
      { type: 'final', result: { jobId: 'mock-job-001', status: 'drafting' } },
    ]

    const sseBody = buildSseBody(streamEvents)

    // Mock the generate-stream endpoint to return our SSE stream.
    await page.route('**/api/seo-factory/generate-stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody,
      })
    })

    // Also mock the GSC suggestions endpoint (called during generation).
    await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, suggestions: [] }),
      })
    })

    // Mock the jobs endpoint (called after generation completes).
    await page.route('**/api/content-studio/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, jobs: [], total: 0 }),
      })
    })

    // First, navigate to the Research tab so we can trigger generation.
    // The Draft tab requires a topic to be set — we'll set it via the
    // Research stage's BriefAssemblyPanel.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    // Fill in the topic field to enable generation.
    const topicInput = page.locator('input[placeholder*="topic"]').first()
    await topicInput.waitFor({ state: 'visible', timeout: 8000 })
    await topicInput.fill('UK Spouse Visa Financial Requirements 2026')

    // Click the "Generate Draft" button at the bottom of the Research stage.
    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await generateBtn.waitFor({ state: 'visible', timeout: 8000 })
    await generateBtn.click()

    // The page should auto-navigate to the Draft tab and start streaming.
    // Wait for the live preview panel to appear.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })

    // ── Assert the streamed content appears in the preview ──
    // The heading should be visible.
    await expect(
      page.getByText('UK Spouse Visa Financial Requirements')
    ).toBeVisible({ timeout: 8000 })

    // Key financial categories text should be streamed.
    await expect(
      page.getByText('The financial requirement is one of the most')
    ).toBeVisible({ timeout: 5000 })

    // The list items should be visible (from the delta chunks).
    await expect(
      page.getByText('Employment income')
    ).toBeVisible({ timeout: 5000 })

    await expect(
      page.getByText('Cash savings')
    ).toBeVisible({ timeout: 5000 })

    // The sub-heading should render.
    await expect(
      page.getByText('Key Financial Categories')
    ).toBeVisible({ timeout: 5000 })

    // ── Assert the char/word counter renders ──
    await expect(
      page.getByText(/chars.*words/)
    ).toBeVisible({ timeout: 5000 })

    // ── Assert the blinking cursor bar is present ──
    // The cursor is a span with animation: studioCursorBlink
    const cursorBar = page.locator('span[style*="studioCursorBlink"]')
    await expect(cursorBar).toBeVisible({ timeout: 5000 })

    // Verify the cursor has the correct animation applied.
    const animationStyle = await cursorBar.evaluate((el) =>
      window.getComputedStyle(el).animationName
    )
    expect(animationStyle).toContain('studioCursorBlink')
  })

  // ── Scenario 2: Preview shows last 2000 chars when content overflows ─────

  test('truncates to last 2000 chars for long streams', async () => {
    // Build a stream with 2500+ characters of text.
    const longParagraph =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. '.repeat(15)

    const streamEvents = [
      { type: 'progress', stage: 'connect', message: 'Pipeline connected' },
      { type: 'provider', provider: 'nvidia-nemotron', model: 'nemotron-3-ultra' },
      { type: 'delta', text: longParagraph },
      { type: 'attempt', attempt: 1, score: 88, wordCount: 350, goodEnough: true },
      { type: 'final', result: { jobId: 'mock-job-002', status: 'drafting' } },
    ]

    const sseBody = buildSseBody(streamEvents)

    await page.route('**/api/seo-factory/generate-stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody,
      })
    })

    // Navigate to Research, set topic, trigger generation.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    const topicInput = page.locator('input[placeholder*="topic"]').first()
    await topicInput.waitFor({ state: 'visible', timeout: 8000 })
    await topicInput.fill('Long-form article stress test')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await generateBtn.waitFor({ state: 'visible', timeout: 8000 })
    await generateBtn.click()

    // Wait for preview panel.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })

    // The long text should be visible (last 2000 chars).
    const previewDiv = page.locator('div').filter({
      hasText: '✍️ AI WRITING LIVE',
    }).locator('div').filter({
      has: page.locator('div'),
    }).last()

    const displayedText = await previewDiv.textContent()
    expect(displayedText).toBeTruthy()

    // The full long paragraph is 2500+ chars, preview should show only ~2000.
    if (displayedText) {
      expect(displayedText.length).toBeLessThanOrEqual(2200) // allow margin
    }
  })

  // ── Scenario 3: Live preview clears on new generation ────────────────────

  test('clears preview text when a new generation starts', async () => {
    // First generation.
    const stream1 = [
      { type: 'progress', stage: 'connect', message: 'Pipeline connected' },
      { type: 'provider', provider: 'openai', model: 'gpt-5.6-luna' },
      { type: 'delta', text: 'First generation content here.' },
      { type: 'final', result: { jobId: 'mock-job-003', status: 'drafting' } },
    ]

    await page.route('**/api/seo-factory/generate-stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: buildSseBody(stream1),
      })
    })

    // Trigger first generation.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    const topicInput = page.locator('input[placeholder*="topic"]').first()
    await topicInput.waitFor({ state: 'visible', timeout: 8000 })
    await topicInput.fill('Test topic for clear')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await generateBtn.waitFor({ state: 'visible', timeout: 8000 })
    await generateBtn.click()

    // Wait for first preview to appear.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('First generation content here.')).toBeVisible({ timeout: 8000 })

    // Now trigger a second generation — the preview should clear.
    const stream2 = [
      { type: 'progress', stage: 'connect', message: 'Pipeline connected' },
      { type: 'provider', provider: 'nvidia-nemotron', model: 'nemotron-3' },
      { type: 'delta', text: 'Second generation — completely different content.' },
      { type: 'final', result: { jobId: 'mock-job-004', status: 'drafting' } },
    ]

    await page.route('**/api/seo-factory/generate-stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: buildSseBody(stream2),
      })
    })

    // Go back to Research and trigger again.
    await researchPill.click()
    await topicInput.waitFor({ state: 'visible', timeout: 8000 })
    await topicInput.fill('Another test topic')
    await generateBtn.click()

    // Wait for the new preview.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })

    // The OLD text should NOT be visible — it was cleared.
    await expect(page.getByText('First generation content here.')).not.toBeVisible({ timeout: 5000 })

    // The NEW text should be visible.
    await expect(
      page.getByText('Second generation — completely different content.')
    ).toBeVisible({ timeout: 8000 })
  })
})
