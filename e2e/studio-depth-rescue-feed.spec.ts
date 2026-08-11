/**
 * Stage III · Draft — depth-rescue attempt feed E2E.
 *
 * Mocks the SSE generation stream with the exact event sequence the depth
 * rescue emits (expand/append progress + attempts with growing word counts)
 * and asserts the Draft workspace's ⏱ DEPTH RESCUE · ATTEMPT FEED surfaces
 * each pass in realtime: rescue progress lines AND attempt records whose word
 * counts strictly grow 400 → 700 → 1400 as the model adds substance.
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
    console.warn('[rescue-e2e] no Clerk user found for test email')
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
    console.warn('[rescue-e2e] failed to create sign-in token')
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

// ── Progressive SSE mock (window.fetch monkeypatch) ─────────────────────────
// Mirrors studio-draft-live-preview.spec.ts: a genuine ReadableStream that
// emits `data:` chunks with per-step delays, so the rescue feed can be asserted
// phase by phase while the stream is still running.

type SseStep =
  | { delayMs: number; event: Record<string, unknown> }
  | { delayMs: number; event: '[DONE]' }

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

async function fillBrief(page: Page, topic: string): Promise<void> {
  const titleInput = page
    .locator('input[placeholder="e.g. Complete Guide to the UK Spouse Visa 2026"]')
    .first()
  await titleInput.waitFor({ state: 'visible', timeout: 8000 })
  await titleInput.fill(`Complete Guide to ${topic}`)

  const topicInput = page.locator('input[placeholder="What users search for"]').first()
  await topicInput.waitFor({ state: 'visible', timeout: 8000 })
  await topicInput.fill(topic)

  const kwInput = page.locator('textarea[placeholder*="uk spouse visa, financial requirement"]').first()
  await kwInput.waitFor({ state: 'visible', timeout: 8000 })
  await kwInput.fill(
    'uk spouse visa, financial requirement, minimum income, income threshold, cash savings, ' +
      'partner visa 2026 financial rules, uk spouse visa income requirement 2026, ' +
      'appendix fm financial requirement, cash savings spouse visa eligibility',
  )
}

async function freshStudio(page: Page): Promise<void> {
  await clearStaleRoutes(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const pill = page.locator('#studio-tab-research')
  await pill.waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(500)
}

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

/** The rescue feed panel lives inside the Draft workspace. */
const rescueFeed = (page: Page) => page.getByTestId('studio-rescue-feed')

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Stage III · Draft — depth-rescue attempt feed', () => {
  test.describe.configure({ mode: 'serial' })

  let page: Page

  test.beforeAll(async ({ browser }) => {
    if (!hasClerkCredentials()) {
      console.warn('[rescue-e2e] skipping — Clerk credentials not configured')
      return
    }

    const adminPage = await loginAsAdmin(browser)
    if (!adminPage) throw new Error('Failed to sign in as admin')
    page = adminPage
  })

  test.afterAll(async () => {
    await page?.context()?.close()
  })

  test('shows expand/append attempts with growing word counts in realtime', async () => {
    await freshStudio(page)

    // The exact event sequence the depth rescue emits: pass 1 = full rewrite
    // (400 words), passes 2–3 = append-only (grows to 700 → 1400). Each pass
    // yields rescue progress + a delta + an attempt with the audited word count.
    await installSseFetchMock(page, [
      { delayMs: 300, event: { type: 'progress', stage: 'connect', message: 'Pipeline connected' } },
      { delayMs: 300, event: { type: 'provider', provider: 'mock-provider', model: 'mock-expand' } },
      // ── Pass 1: expand attempt (floor NOT met) ──
      { delayMs: 0, event: { type: 'progress', stage: 'refine', message: 'Depth rescue 1/10 · 400/1800 words (1400 to add)…' } },
      { delayMs: 700, event: { type: 'delta', text: '\n\n<!-- depth expand applied -->\n\n' } },
      { delayMs: 0, event: { type: 'delta', text: '## Eligibility Requirements\n\nYou need proof of funds and a valid passport before applying.' } },
      { delayMs: 400, event: { type: 'attempt', attempt: 1, score: 58, wordCount: 400, goodEnough: false } },
      // ── Pass 2: append pass (grows to 700) ──
      { delayMs: 0, event: { type: 'progress', stage: 'refine', message: 'Depth rescue 2/10 · 700/1800 words (1100 to add)…' } },
      { delayMs: 300, event: { type: 'delta', text: '## Application Process\n\nThe application is submitted online with supporting documents.' } },
      { delayMs: 400, event: { type: 'attempt', attempt: 2, score: 74, wordCount: 700, goodEnough: false } },
      // ── Pass 3: append pass (grows to 1400, floor cleared) ──
      { delayMs: 0, event: { type: 'progress', stage: 'refine', message: 'Depth rescue 3/10 · 1400/1800 words (400 to add)…' } },
      { delayMs: 300, event: { type: 'delta', text: '## Common Mistakes\n\nApplicants often forget the biometric appointment step.' } },
      { delayMs: 1400, event: { type: 'attempt', attempt: 3, score: 90, wordCount: 1400, goodEnough: true } },
      { delayMs: 800, event: { type: 'final', result: { jobId: 'mock-rescue-001', status: 'drafting' } } },
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

    await fillBrief(page, 'Student visa depth rescue test')

    const generateBtn = page.getByRole('button', { name: /Generate Draft/i }).first()
    await expect(generateBtn).toBeEnabled({ timeout: 8000 })
    await generateBtn.click()

    // ── Pass 1 lands: rescue progress + first attempt with 400 words ──
    await expect(rescueFeed(page)).toBeVisible({ timeout: 15000 })
    await expect(
      rescueFeed(page).getByText(/Depth rescue 1\/10 · 400\/1800 words/),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      rescueFeed(page).getByText(/Attempt 1: score 58 · 400 words/),
    ).toBeVisible({ timeout: 8000 })

    // The streamed expand content also renders live in the preview.
    await expect(
      page.getByText('You need proof of funds and a valid passport'),
    ).toBeVisible({ timeout: 8000 })

    // ── Pass 2: append attempt grows to 700 words ──
    await expect(
      rescueFeed(page).getByText(/Depth rescue 2\/10 · 700\/1800 words/),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      rescueFeed(page).getByText(/Attempt 2: score 74 · 700 words/),
    ).toBeVisible({ timeout: 8000 })

    // ── Pass 3: append attempt grows to 1400 words and clears the threshold ──
    await expect(
      rescueFeed(page).getByText(/Depth rescue 3\/10 · 1400\/1800 words/),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      rescueFeed(page).getByText(/Attempt 3: score 90 · 1400 words/),
    ).toBeVisible({ timeout: 8000 })
    // The final pass meets the quality threshold (suffix may read
    // '· threshold met' or '· quality threshold met' per consume loop).
    await expect(
      rescueFeed(page).getByText(/threshold met/),
    ).toBeVisible({ timeout: 8000 })

    // ── Word counts strictly grow across passes (400 → 700 → 1400) ──
    // The feed persists after the stream completes, so no teardown race.
    const feedText = (await rescueFeed(page).textContent()) || ''
    const counts = Array.from(
      feedText.matchAll(/Attempt \d+: score \d+ · (\d+) words/g),
      (m) => Number(m[1]),
    )
    expect(counts.length).toBeGreaterThanOrEqual(3)
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
    expect(counts[2]).toBeGreaterThanOrEqual(1400)
  })
})
