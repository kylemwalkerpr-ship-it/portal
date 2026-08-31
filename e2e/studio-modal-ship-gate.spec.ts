/**
 * studio-modal-ship-gate.spec.ts
 *
 * E2E for the Content Studio job modal's canonical ship gate (stale-refusal
 * fix). A throwaway `content_jobs` row is inserted carrying a real ship
 * refusal (error_message contains "ship refused") and a draft whose
 * `## Related guides` bullet is plain text, then:
 *
 *  1. The REAL modal is opened (admin session, Content Studio → Draft queue)
 *     and the regression is asserted in the DOM:
 *       - the green "Previous ship refusal is stale" banner must NOT render
 *         (the gate is unknown on first open, so no false pass claim);
 *       - an honest audit prompt / active-refusal notice renders instead;
 *       - "Approve → main" stays disabled.
 *  2. The REAL reaudit route is driven with the signed-in session for the
 *     same draft: the unmatched label stays blocked (`unlinked_related_guide`,
 *     shipReady:false) — no URL is ever invented.
 *  3. A uniquely-matching plain-text label (`UK Immigration Hub, CaseWorks
 *     Guides`) is then repaired deterministically by the same route: the
 *     response carries `](https://legal.yousafeconsultancy.com/uk/)` and no
 *     `unlinked_related_guide` blocker.
 *
 * ── Prerequisites (env) ────────────────────────────────────────────────────
 *   CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD / CLERK_SECRET_KEY — admin login
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — throwaway row
 *   PLAYWRIGHT_BASE_URL — deployed portal (Worker has the real service key).
 *
 * Run:
 *   PLAYWRIGHT_BASE_URL=https://portal.yousafeconsultancy.com npx playwright test \
 *     --project=chromium e2e/studio-modal-ship-gate.spec.ts
 */
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3002'

function hasClerkCredentials(): boolean {
  return !!(process.env.CLERK_TEST_EMAIL && process.env.CLERK_TEST_PASSWORD && process.env.CLERK_SECRET_KEY)
}

function hasSupabaseEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
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

    const ticketUrl = `${BASE}/sign-in/student?__clerk_ticket=${encodeURIComponent(token)}&return_to=${encodeURIComponent('/dashboard/admin/content?tab=draft')}`
    await page.goto(ticketUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 45000 })
    return page
  } catch (err) {
    console.error(`[loginAsAdmin] error: ${err}`)
    await page.close()
    return null
  }
}

const FM = `---
title: UK visa refusal administrative review template 2026
description: What a UK visa refusal administrative review letter template covers for applicants this year.
---

# UK visa refusal administrative review template 2026

## In 60 seconds

- An administrative review challenges a refusal decision on the facts.
- You must apply within the statutory window after the decision.
- Supporting evidence strengthens the review application.

The administrative review letter should set out the grounds for the challenge and attach the evidence that supports them. Home Office guidance changes, so you confirm the current rules before you file.

## What the template covers

A UK visa refusal administrative review letter template helps a dismissed applicant compose a clear challenge to the decision. You state which grounds the reviewer should look at again and why the original outcome was wrong on the facts.

## How to use it

Read the refusal notice and note the grounds given. Address each ground in turn, cite the relevant rule, and attach fresh evidence where it exists. Keep the letter concise and factual.

## FAQ

### When can I apply for an administrative review?
Within the statutory window shown on your refusal notice.

### What evidence helps?
Anything that directly addresses the grounds the reviewer cited.

### Do I need a new application?
No — the review reconsiders the existing decision.

## Related guides

$RELATED

## Sources

- [GOV.UK administrative review guidance](https://www.gov.uk/ask-for-an-administrative-review)
`

function draft(relatedBullet: string): string {
  return FM.replace('$RELATED', relatedBullet)
}

const UNMATCHABLE = draft('- Administrative Review Letter Template UK, challenge a UK visa refusal.')
const MATCHABLE = draft('- UK Immigration Hub, CaseWorks Guides')

async function reaudit(page: Page, content: string, jobId: string): Promise<any> {
  const res = await page.request.post(`${BASE}/api/content-studio/reaudit`, {
    data: { content, jobId, contentType: 'article', region: 'UK', primaryKeyword: 'uk visa refusal administrative review template' },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status(), body }
}

test.describe('Content Studio job modal · canonical ship gate (stale-refusal fix)', () => {
  test('refused draft never shows the green stale-pass banner, Approve stays disabled, and the reaudit route stays honest', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')
    test.skip(!hasSupabaseEnv(), 'Skipping: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for the throwaway job row')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    const jobId = randomUUID()
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    try {
      // ── Seed the throwaway job with a REAL ship refusal + the plain-text
      //    related-guide orphan that reproduces the live defect. ─────────────
      const { error: insertErr } = await sb.from('content_jobs').insert({
        id: jobId,
        user_id: 'e2e-modal-ship-gate',
        title: 'UK visa refusal administrative review template 2026',
        topic: 'uk visa refusal administrative review template',
        content_type: 'article',
        tone: 'educational',
        region: 'UK',
        status: 'drafting',
        target_repo: 'caseworks',
        content: UNMATCHABLE,
        primary_keyword: 'uk visa refusal administrative review template',
        indexable: true,
        error_message: 'Ship refused: content quality gate failed — resolve the blockers and re-audit.',
      })
      expect(insertErr).toBeNull()

      // ── Open the REAL job modal. ──────────────────────────────────────────
      await page.goto(`${BASE}/dashboard/admin/content?tab=draft`, { waitUntil: 'domcontentloaded' })
      // The queue row is clickable by its title.
      const row = page.locator('tbody tr', { hasText: 'UK visa refusal administrative review template 2026' }).first()
      await row.waitFor({ state: 'visible', timeout: 60_000 })
      await row.click()

      const approve = page.getByTestId('studio-approve-main')
      const stalePassBanner = page.getByTestId('studio-stale-refusal-clear')
      const honestBanner = page.locator('[data-testid="studio-refusal-active"], [data-testid="studio-refusal-unknown"]')

      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 30_000 })

      // The regression: a refused draft must NEVER claim a stale pass on score
      // alone, and Approve must stay disabled while the gate is unknown/blocked.
      await expect(stalePassBanner).toHaveCount(0)
      await expect(honestBanner.first()).toBeVisible()
      await expect(approve).toBeDisabled()

      // ── Drive the real reaudit route for the SAME draft. ──────────────────
      // The un-matched plain-text label is a genuine blocker: no URL is
      // invented, shipReady stays false.
      const unmatched = await reaudit(page, UNMATCHABLE, jobId)
      expect(unmatched.status).toBe(200)
      expect(unmatched.body.blockers).toBeGreaterThanOrEqual(1)
      expect(unmatched.body.shipReady).toBe(false)
      expect(
        (unmatched.body.blockersData || []).map((b: { code: string }) => b.code),
      ).toContain('unlinked_related_guide')
      expect(unmatched.body.fixedContent || UNMATCHABLE).not.toContain('Administrative Review Letter Template UK](')

      // ── The SAME route clears the blocker only when the label uniquely
      //    matches a verified live estate URL. ───────────────────────────────
      const matched = await reaudit(page, MATCHABLE, jobId)
      expect(matched.status).toBe(200)
      expect(String(matched.body.fixedContent || MATCHABLE)).toContain(
        '](https://legal.yousafeconsultancy.com/uk/)',
      )
      expect(
        (matched.body.blockersData || []).map((b: { code: string }) => b.code),
      ).not.toContain('unlinked_related_guide')
    } finally {
      await sb.from('content_jobs').delete().eq('id', jobId)
      await page.close()
    }
  })
})