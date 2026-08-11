/**
 * Stage III · Draft — Queue management: Clear queue E2E.
 *
 * Clicks the 🧹 Clear queue maintenance button (with confirmation arm)
 * and asserts the QueueStats "In progress" count drops to 0 after the
 * POST /api/content-studio/jobs { action: 'clear_drafts' } succeeds.
 *
 * Uses Clerk sign-in token auth matching the existing E2E patterns.
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
    console.warn('[queue-clear-e2e] no Clerk user found for test email')
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
    console.warn('[queue-clear-e2e] failed to create sign-in token')
    return null
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  // Sign in via Clerk ticket, landing on the Content Studio dashboard
  await page.goto(
    `${BASE}/sign-in/student?__clerk_ticket=${token}&return_to=/dashboard/admin/content`,
    { waitUntil: 'domcontentloaded' },
  )

  // Wait for redirect away from sign-in
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 })
  await page.waitForLoadState('networkidle')

  return page
}

// ── Mock helpers ────────────────────────────────────────────────────────────

interface MockJob {
  id: string
  title: string
  topic: string
  status: string
  content_type: string
  region: string
  word_count: number
  seo_score: number
  created_at: string
  updated_at: string
}

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  const ts = new Date().toISOString()
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Article',
    topic: 'test-topic',
    status: 'pending',
    content_type: 'article',
    region: 'US',
    word_count: 0,
    seo_score: 0,
    created_at: ts,
    updated_at: ts,
    ...overrides,
  }
}

type JobSummary = Record<string, number>

function buildSummary(jobs: MockJob[]): JobSummary {
  const sum: JobSummary = { total: jobs.length }
  for (const j of jobs) {
    sum[j.status] = (sum[j.status] || 0) + 1
  }
  return sum
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Stage III · Draft — Queue Clear', () => {
  test('Clear queue drops pending count to 0 in QueueStats', async ({ browser }) => {
    const page = await loginAsAdmin(browser)
    if (!page) {
      console.warn('[queue-clear-e2e] skipping — Clerk credentials not configured')
      return
    }

    // ── Scenario: 8 pending jobs in the queue ──────────────────────────────
    const initialJobs: MockJob[] = [
      makeJob({ id: 'job-001', title: 'Draft 1 — H-1B guide', topic: 'h1b-lottery', status: 'pending' }),
      makeJob({ id: 'job-002', title: 'Draft 2 — OPT timeline', topic: 'opt-timeline', status: 'pending' }),
      makeJob({ id: 'job-003', title: 'Draft 3 — F-1 Lagos', topic: 'f1-lagos-interview', status: 'pending' }),
      makeJob({ id: 'job-004', title: 'Draft 4 — EB-2 NIW', topic: 'eb2-niw', status: 'pending' }),
      makeJob({ id: 'job-005', title: 'Draft 5 — UK spouse visa', topic: 'uk-spouse-visa', status: 'pending' }),
      makeJob({ id: 'job-006', title: 'Draft 6 — CA PGWP', topic: 'ca-pgwp', status: 'pending' }),
      makeJob({ id: 'job-007', title: 'Draft 7 — AU 189 visa', topic: 'au-189-visa', status: 'pending' }),
      makeJob({ id: 'job-008', title: 'Draft 8 — US student visas hub', topic: 'us-student-visas', status: 'pending' }),
    ]

    const initialSummary = buildSummary(initialJobs)

    let clearCalled = false

    // Mock GET /api/content-studio/jobs — returns the current job list
    await page.route('**/api/content-studio/jobs?limit=100', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()

      // After the clear succeeds, return 0 pending
      const jobs = clearCalled
        ? initialJobs.map((j) => ({ ...j, status: 'closed', closed_at: new Date().toISOString() }))
        : initialJobs
      const summary = buildSummary(jobs)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobs,
          count: jobs.length,
          total: jobs.length,
          hasMore: false,
          offset: 0,
          limit: 100,
          summary,
        }),
      })
    })

    // Mock POST /api/content-studio/jobs — clears drafts
    await page.route('**/api/content-studio/jobs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()

      const body = JSON.parse(route.request().postData() || '{}')
      if (body.action === 'clear_drafts') {
        clearCalled = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            action: 'clear_drafts',
            message: 'Cleared 8/8 jobs from [pending]',
            processed: 8,
            succeeded: 8,
            failed: 0,
            results: initialJobs.map((j) => ({ id: j.id, ok: true })),
          }),
        })
        return
      }

      return route.fallback()
    })

    // ── Navigate to Draft stage ────────────────────────────────────────────
    const draftPill = page.locator('#studio-tab-draft')
    await draftPill.waitFor({ state: 'visible', timeout: 10_000 })
    await draftPill.click()
    await page.waitForTimeout(500)

    // ── Assert QueueStats shows 8 In progress ──────────────────────────────
    // The "In progress" stat card sums pending + drafting + pr_created.
    // With 8 pending and 0 drafting/PR, it should show 8.
    const inProgressCard = page.locator('text=In progress').locator('..')
    await inProgressCard.waitFor({ state: 'visible', timeout: 8_000 })
    const inProgressValue = inProgressCard.locator('div').filter({ hasText: /^\d+$/ }).first()
    const initialCount = await inProgressValue.textContent()
    expect(Number(initialCount)).toBe(8)

    // ── Click Clear queue (first click = arm) ──────────────────────────────
    const clearBtn = page.getByRole('button', { name: /Clear queue/ }).first()
    await clearBtn.waitFor({ state: 'visible', timeout: 5_000 })
    expect(await clearBtn.isEnabled()).toBe(true)

    // First click: arms the destructive confirmation
    await clearBtn.click()
    await page.waitForTimeout(300)

    // After arming, the button text changes to confirmation mode
    const confirmBtn = page.getByRole('button', { name: /Confirm clear queue/ }).first()
    await confirmBtn.waitFor({ state: 'visible', timeout: 3_000 })

    // Second click: executes the clear
    await confirmBtn.click()
    await page.waitForTimeout(500)

    // ── Assert QueueStats now shows 0 In progress ──────────────────────────
    // The page should re-fetch after the clear and the In progress card
    // should now show 0 since all jobs are closed.
    const updatedCount = await inProgressValue.textContent()
    expect(Number(updatedCount)).toBe(0)

    // ── Assert the button text reset (no longer in confirm mode) ───────────
    const resetBtn = page.getByRole('button', { name: /🧹 Clear queue/ }).first()
    await expect(resetBtn).toBeVisible({ timeout: 3_000 })
    // Should show 0 now since there are no pending drafts
    const btnText = await resetBtn.textContent()
    expect(btnText).toContain('0')

    await page.close()
  })
})
