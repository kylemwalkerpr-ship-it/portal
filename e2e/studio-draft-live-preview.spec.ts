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

// ── Progressive SSE mock ────────────────────────────────────────────────────
// Playwright's route.fulfill only delivers whole string|Buffer bodies, which
// would flatten the timing these scenarios depend on (activity log visible
// BEFORE the first delta lands; live toolbar counter while mid-stream). A
// cross-origin route.continue to a local server is not viable on prod (HTTPS
// → Playwright's Node-side network layer rejects self-signed certs). Instead
// we monkeypatch window.fetch to return a Response wrapping a genuine
// ReadableStream that emits `data:` chunks with configurable delays — same
// origin, no server, deterministic.

type SseStep =
  | { delayMs: number; event: Record<string, unknown> }
  | { delayMs: number; event: '[DONE]' }

/** Clear any page.route registrations left behind by earlier scenarios in
 * this serial suite. Playwright route interception fires at the network layer
 * BEFORE window.fetch — so a stale route (e.g. scenario 1's instant
 * route.fulfill) would swallow a later scenario's fetch mock entirely and
 * serve the WRONG body. Call this at the start of every scenario. */
async function clearStaleRoutes(page: Page): Promise<void> {
  for (const pattern of [
    '**/api/seo-factory/generate-stream',
    '**/api/content-studio/gsc/suggestions',
    '**/api/content-studio/jobs*',
  ]) {
    try {
      await page.unroute(pattern)
    } catch {
      /* not registered — fine */
    }
  }
}

/** Fill the Research stage's headline + topic so the stage guard
 * (hasBriefReady = topic && title) always passes — the suggestions API is
 * mocked empty in these scenarios, so title must be typed explicitly rather
 * than left to the real enrichment call. */
async function fillBrief(page: Page, topic: string): Promise<void> {
  const titleInput = page
    .locator('input[placeholder="e.g. Complete Guide to the UK Spouse Visa 2026"]')
    .first()
  await titleInput.waitFor({ state: 'visible', timeout: 8000 })
  await titleInput.fill(`Complete Guide to ${topic}`)

  const topicInput = page.locator('input[placeholder="What users search for"]').first()
  await topicInput.waitFor({ state: 'visible', timeout: 8000 })
  await topicInput.fill(topic)

  // The brief requires 5 short-tail (≤3 words) + 4 long-tail (≥4 words)
  // keywords before the Generate Draft button enables.
  const kwInput = page.locator('textarea[placeholder*="uk spouse visa, financial requirement"]').first()
  await kwInput.waitFor({ state: 'visible', timeout: 8000 })
  await kwInput.fill(
    'uk spouse visa, financial requirement, minimum income, income threshold, cash savings, ' +
      'partner visa 2026 financial rules, uk spouse visa income requirement 2026, ' +
      'appendix fm financial requirement, cash savings spouse visa eligibility',
  )
}

/** Reset the studio to a pristine mounted state between serial scenarios.
 * Scenario 1's instant route.fulfill stream leaves the generator state machine
 * mid-flight (live preview still mounted, generating flags set), which swallows
 * the next scenario's Generate click. A hard reload wipes the JS state while
 * the Clerk session (cookie) survives, so we land back on the studio fresh. */
async function freshStudio(page: Page): Promise<void> {
  await clearStaleRoutes(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  // Wait for the studio to mount and settle (research pill is the anchor).
  const pill = page.locator('#studio-tab-research')
  await pill.waitFor({ state: 'visible', timeout: 30000 })
  // Give React a beat to attach all listeners before any interaction.
  await page.waitForTimeout(500)
}

/** Install (or re-arm) a window.fetch mock that serves the given SSE steps as
 * a progressive ReadableStream response for the generate-stream endpoint. */
async function installSseFetchMock(page: Page, steps: SseStep[]): Promise<void> {
  await page.evaluate((nextSteps) => {
    const w = window as unknown as {
      __sseFetchMockInstalled?: boolean
      __sseSteps?: SseStep[]
      __origFetch?: typeof fetch
      fetch: typeof fetch
    }
    if (!w.__sseFetchMockInstalled) {
      w.__sseFetchMockInstalled = true
      w.__origFetch = w.fetch.bind(w)
      w.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url.includes('/api/seo-factory/generate-stream')) {
          const enc = new TextEncoder()
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              for (const step of w.__sseSteps ?? []) {
                await new Promise((r) => setTimeout(r, step.delayMs))
                controller.enqueue(
                  enc.encode(
                    step.event === '[DONE]'
                      ? 'data: [DONE]\n\n'
                      : `data: ${JSON.stringify(step.event)}\n\n`,
                  ),
                )
              }
              controller.close()
            },
          })
          return new Response(stream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }
        return w.__origFetch!(input, init)
      }
    }
    w.__sseSteps = nextSteps
  }, steps)
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
    await freshStudio(page)
    // Build a realistic SSE stream: connect → provider → delta chunks → final.
    const streamEvents = [
      { type: 'progress', stage: 'connect', message: 'Pipeline connected' },
      { type: 'provider', provider: 'entrim-qwen-27b', model: 'Qwen/Qwen3.6-27B' },
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

    // Fill the brief (title + topic + keywords) to enable generation.
    await fillBrief(page, 'UK Spouse Visa Financial Requirements 2026')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
    await generateBtn.click()

    // The page should auto-navigate to the Draft tab and start streaming.
    // Wait for the live preview panel to appear.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })

    // ── Assert the streamed content appears in the preview ──
    // Note: the Research panel stays mounted while the Draft tab renders, so
    // use substrings unique to the STREAMED markdown (the '#' prefix / full
    // bullet text) to avoid strict-mode collisions with the topic input or
    // keyword textarea.
    // Document view (default) renders the live-page heading, not raw `#`.
    await expect(page.getByTestId('studio-stream-document')).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.getByRole('heading', { name: /UK Spouse Visa Financial/i })
    ).toBeVisible({ timeout: 8000 })

    // Key financial categories text should be streamed.
    await expect(
      page.getByText('The financial requirement is one of the most')
    ).toBeVisible({ timeout: 5000 })

    // The list items should be visible (from the delta chunks) — use unique
    // bullet fragments rather than short labels that may match the keyword
    // textarea in the mounted Research panel.
    await expect(
      page.getByText('salaried or non-salaried')
    ).toBeVisible({ timeout: 5000 })

    await expect(
      page.getByText('held for at least 6 months')
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
    await freshStudio(page)
    // Build a stream with 2500+ characters of text. NOTE: the repeat() must
    // wrap the WHOLE concatenation — a trailing .repeat() only repeats the
    // last string literal, which previously made this just ~1,144 chars and
    // silently disabled the 2,000-char cap the scenario is meant to test.
    const loremSentence =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ' +
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. '
    const longParagraph = loremSentence.repeat(12) // ~2,450 chars
    const fullChars = longParagraph.length
    expect(fullChars).toBeGreaterThan(2200) // guard: cap must actually engage

    // Stream the whole paragraph in one delta, then PAUSE before attempt/final
    // so the preview stays mounted (live words + sliced display) while we
    // assert. A single-shot route.fulfill would deliver [DONE] instantly and
    // unmount the preview before the assertions could run. The pause must be
    // generous (2s) so the mid-stream counter assertion has a wide window — a
    // short pause makes the assertion race the [DONE] teardown.
    await installSseFetchMock(page, [
      { delayMs: 300, event: { type: 'progress', stage: 'connect', message: 'Pipeline connected' } },
      { delayMs: 300, event: { type: 'provider', provider: 'nvidia-nemotron', model: 'nemotron-3-ultra' } },
      { delayMs: 0, event: { type: 'delta', text: longParagraph } },
      { delayMs: 2000, event: { type: 'attempt', attempt: 1, score: 88, wordCount: 350, goodEnough: true } },
      { delayMs: 0, event: { type: 'final', result: { jobId: 'mock-job-002', status: 'drafting' } } },
      { delayMs: 0, event: '[DONE]' },
    ])

    await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, suggestions: [] }),
      })
    })
    await page.route('**/api/content-studio/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, jobs: [], total: 0 }),
      })
    })

    // Navigate to Research, set topic, trigger generation.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    await fillBrief(page, 'Long-form article stress test')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
    await generateBtn.click()

    // Wait for preview panel.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })

    // The live preview stats show the FULL streamed char count while streaming
    // (still mid-stream during the pause before attempt/final). The live strip
    // format is `{chars} chars · {words} body words`, so match its head. The
    // browser renders toLocaleString() with its own locale (en-US → "2,304",
    // de-DE → "2.304"), so build the regex from raw digits with a flexible
    // separator to stay locale-robust.
    const counterDigits = String(fullChars)
      .split('')
      .join('[.,\s]?')
    await expect(
      page.getByText(new RegExp(`${counterDigits} chars`)),
    ).toBeVisible({ timeout: 8000 })

    // Document view shows the live page (full prose, not a 2000-char tail).
    await expect(page.getByTestId('studio-stream-document-body')).toBeVisible()
    await expect(page.getByTestId('studio-stream-document-body')).toContainText('Lorem ipsum dolor sit amet')

    // Source view still tails long raw streams so the operator can inspect the dump.
    await page.getByTestId('studio-stream-source').click()
    const previewDiv = page.getByTestId('studio-stream-source-body')
    await expect(previewDiv).toBeVisible({ timeout: 8000 })

    const displayedText = await previewDiv.textContent()
    expect(displayedText).toBeTruthy()

    if (displayedText) {
      expect(displayedText.length).toBeLessThanOrEqual(2300)
    }
  })

  // ── Scenario 3: Live preview clears on new generation ────────────────────

  test('clears preview text when a new generation starts', async () => {
    await freshStudio(page)
    // First generation — pause after the delta so the preview stays mounted
    // long enough to assert the streamed words before [DONE] unmounts it.
    await installSseFetchMock(page, [
      { delayMs: 300, event: { type: 'progress', stage: 'connect', message: 'Pipeline connected' } },
      { delayMs: 300, event: { type: 'provider', provider: 'entrim-qwen-27b', model: 'Qwen/Qwen3.6-27B' } },
      { delayMs: 0, event: { type: 'delta', text: 'First generation content here.' } },
      { delayMs: 900, event: { type: 'final', result: { jobId: 'mock-job-003', status: 'drafting' } } },
      { delayMs: 0, event: '[DONE]' },
    ])

    // Mock the GSC suggestions + jobs endpoints (same as other scenarios).
    await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, suggestions: [] }),
      })
    })
    await page.route('**/api/content-studio/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, jobs: [], total: 0 }),
      })
    })

    // Trigger first generation.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    await fillBrief(page, 'Test topic for clear')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
    await generateBtn.click()

    // Wait for first preview to appear.
    await expect(page.getByText('✍️ AI WRITING LIVE')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('First generation content here.')).toBeVisible({ timeout: 8000 })

    // CRITICAL: let the first stream FULLY complete before starting the second
    // generation. handleGenerate resets generating/generationText, but the first
    // stream's `finally { setGenerating(false) }` + post-completion handler
    // (selectTab + fetchJobs) run AFTER the second click — clobbering the new
    // stream and wiping its deltas. Wait until the live preview unmounts (the
    // first stream's [DONE] has been consumed) so the studio is quiescent.
    await expect(page.getByText('✍️ AI WRITING LIVE')).not.toBeVisible({
      timeout: 10000,
    })
    // Give the post-stream handler (fetchJobs/gate runs) a beat to settle.
    await page.waitForTimeout(400)

    // Now trigger a second generation — the preview should clear.
    await installSseFetchMock(page, [
      { delayMs: 300, event: { type: 'progress', stage: 'connect', message: 'Pipeline connected' } },
      { delayMs: 300, event: { type: 'provider', provider: 'nvidia-nemotron', model: 'nemotron-3' } },
      { delayMs: 0, event: { type: 'delta', text: 'Second generation — completely different content.' } },
      { delayMs: 900, event: { type: 'final', result: { jobId: 'mock-job-004', status: 'drafting' } } },
      { delayMs: 0, event: '[DONE]' },
    ])

    // Go back to Research and trigger again.
    await researchPill.click()
    await fillBrief(page, 'Another test topic')
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
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

  // ── Scenario 4: Activity log yields to live words; counter tracks stream ──

  test('activity log clears when words stream in and toolbar counter tracks the text', async () => {
    await freshStudio(page)
    const chunks = [
      'A detailed guide to the UK spouse visa financial requirement. ',
      'Applicants must demonstrate the £29,000 annual income threshold. ',
      'Cash savings above £16,000 held for six months also qualify.',
    ]
    const fullText = chunks.join('')
    const expectedWords = fullText.split(/\s+/).filter(Boolean).length
    const expectedChars = fullText.length

    // Schedule a real progressive SSE stream: connect + provider land first
    // (activity log visible), then delta chunks arrive over time, then a pause
    // before attempt/final so the LIVE toolbar counter can be asserted while
    // the stream is still running.
    await installSseFetchMock(page, [
      { delayMs: 300, event: { type: 'progress', stage: 'connect', message: 'Pipeline connected' } },
      { delayMs: 300, event: { type: 'provider', provider: 'nvidia-nemotron', model: 'nemotron-3-ultra' } },
      // ── Phase A window: activity log on screen, no streamed words yet ──
      { delayMs: 0, event: { type: 'delta', text: chunks[0] } },
      { delayMs: 300, event: { type: 'delta', text: chunks[1] } },
      { delayMs: 300, event: { type: 'delta', text: chunks[2] } },
      // ── Phase B window: full text rendered, counter live, still streaming ──
      { delayMs: 800, event: { type: 'attempt', attempt: 1, score: 91, wordCount: expectedWords, goodEnough: true } },
      { delayMs: 0, event: { type: 'final', result: { jobId: 'mock-job-005', status: 'drafting' } } },
      { delayMs: 0, event: '[DONE]' },
    ])

    // Mock the GSC suggestions + jobs endpoints (same as other scenarios).
    await page.route('**/api/content-studio/gsc/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, suggestions: [] }),
      })
    })
    await page.route('**/api/content-studio/jobs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, jobs: [], total: 0 }),
      })
    })

    // Trigger generation from the Research stage.
    const researchPill = page.locator('#studio-tab-research')
    await researchPill.waitFor({ state: 'visible', timeout: 15000 })
    await researchPill.click()

    await fillBrief(page, 'UK Spouse Visa Financial Requirement deep dive')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
    await generateBtn.click()

    // ── Phase A: before the first delta lands, the activity log is showing ──
    await expect(
      page.getByText('The AI is composing your draft')
    ).toBeVisible({ timeout: 15000 })

    // No streamed words yet — the live preview panel has not rendered.
    await expect(
      page.getByText('✍️ AI WRITING LIVE')
    ).not.toBeVisible({ timeout: 5000 })

    // ── Phase B: the first delta lands — live words replace the log ──
    await expect(
      page.getByText('A detailed guide to the UK spouse visa')
    ).toBeVisible({ timeout: 8000 })

    // The rest of the streamed paragraph is on screen.
    await expect(
      page.getByText('Cash savings above £16,000')
    ).toBeVisible({ timeout: 8000 })

    // The activity log is gone now that real words are streaming.
    await expect(
      page.getByText('The AI is composing your draft')
    ).not.toBeVisible({ timeout: 5000 })

    // ── The toolbar counter tracks the streamed text (still mid-stream) ──
    await expect(
      page.getByText(
        new RegExp(
          `${expectedWords.toLocaleString()} words · ${expectedChars.toLocaleString()} chars`,
        ),
      ),
    ).toBeVisible({ timeout: 5000 })

    // The live preview header is present alongside the streamed words.
    await expect(
      page.getByText('✍️ AI WRITING LIVE')
    ).toBeVisible({ timeout: 5000 })
  })
})
