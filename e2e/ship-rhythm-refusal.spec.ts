/**
 * ship-rhythm-refusal.spec.ts
 *
 * E2E for the ship-time rhythm guard (assertRhythmWithinRepairRange) through
 * the FULL approve route — not a network mock. A throwaway job row carrying a
 * 26×-rhythm long-form draft is inserted into content_jobs, then
 * `POST /api/content-studio/jobs` with `action: 'bulk_approve'` +
 * `dryRun: true` is called with the admin session. The route runs
 * resolveOwner → auditContent → shipContent(dryRun), where the deterministic
 * repair reduces the repetition but cannot clear it, so the rhythm guard
 * throws the structured refusal — which the route returns as
 * results[0].detail = { code: 'rhythm_beyond_repair', rhythmKey, rhythmCount }.
 *
 * The throwaway row is deleted in `finally` — the test never touches real jobs
 * and dryRun means no GitHub PR/merge is ever opened.
 *
 * ── Prerequisites (env) ────────────────────────────────────────────────────
 *   CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD / CLERK_SECRET_KEY — admin login
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — throwaway row
 *   PLAYWRIGHT_BASE_URL — must point at an environment whose Worker has the
 *   real SUPABASE_SERVICE_ROLE_KEY (the deployed portal; the local dev
 *   .env.local service key is the new sb_secret_ format supabase-js rejects).
 *
 * Run against the deployed portal:
 *   PLAYWRIGHT_BASE_URL=https://portal.yousafeconsultancy.com npx playwright test \
 *     --project=chromium e2e/ship-rhythm-refusal.spec.ts
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

// ── Fixture: a full-length legal guide with 26 repeated "The UK dependent
//    visa …" openings. ≥2200 body words so the depth gate passes and the
//    rhythm guard is the reason ship stops. ──────────────────────────────────
const TAILS = [
  'allows partners to apply for the same stay.',
  'requires proof of the relationship.',
  'covers children under 18.',
  'is applied for online.',
  'normally takes three weeks to process.',
  'does not grant access to public funds.',
  'can be extended from inside the UK.',
  'needs a valid passport and biometrics.',
]

// Word-count padding as ONE giant run-on (no sentence punctuation): it adds
// body words but produces no rhythm keys (each paragraph = one span).
const RUN_ON = Array.from({ length: 2000 }, (_, i) => `detail${i}`).join(' ')

function rhythmDraft26(): string {
  const sections = Array.from({ length: 4 }, (_, s) => {
    const bulletCount = s === 0 ? 26 : 0
    const bullets = Array.from({ length: bulletCount }, (_, i) => `- The UK dependent visa ${TAILS[i % TAILS.length]}`).join('\n')
    const pad = s === 1
      ? RUN_ON
      : `Paragraph ${s + 1} covers the documents, evidence, timelines, and risks that apply to dependent applicants under the family rules, and you should verify the current guidance before you file.`
    return `## Section ${s + 1}\n${bullets ? `${bullets}\n\n` : ''}${pad}\n\n`
  }).join('\n')

  return `---
title: "UK dependent visa guide 2026"
content_type: article
primaryKeyword: uk dependent visa
robots: index,follow
---

# UK dependent visa guide 2026

## In 60 seconds
- Confirm the exact form list for your route on the official site
- Gather bank statements and identity documents before you file
- Check processing times so you do not miss a deadline

You need a clear document set before you file. The UK dependent visa is applied for online and normally takes three weeks to process.

${sections}

## FAQ
### Who can apply as a dependent?
Partners and children under 18 can join a main applicant under the family rules.

### What documents are needed?
You gather passports, relationship evidence, and financial proof.

### How long does it take?
Processing times change; check the official site for the current estimate.

### Can dependents work?
Rules vary by route; read the official guidance for your situation.

## Sources
- https://www.gov.uk/uk-family-visas

This guide is educational only, not legal advice. Consult an attorney for your situation.
`
}

test.describe('Ship-time rhythm refusal through the full approve route (admin)', () => {
  test('dry-run ship of a 26x-rhythm draft returns the rhythm_beyond_repair refusal naming the opener + count', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')
    test.skip(!hasSupabaseEnv(), 'Skipping: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for the throwaway job row')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Create the throwaway job row ───────────────────────────────────────
    const jobId = randomUUID()
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    try {
      const { error: insertErr } = await sb.from('content_jobs').insert({
        id: jobId,
        user_id: 'e2e-rhythm-refusal',
        title: 'UK dependent visa guide 2026',
        topic: 'uk dependent visa',
        content_type: 'article',
        tone: 'educational',
        region: 'UK',
        status: 'pending',
        target_repo: 'caseworks',
        content: rhythmDraft26(),
        primary_keyword: 'uk dependent visa',
        indexable: true,
      })
      expect(insertErr).toBeNull()

      // ── Drive the FULL approve route (not a network mock) ────────────────
      const res = await page.request.post(`${BASE}/api/content-studio/jobs`, {
        data: {
          action: 'bulk_approve',
          ids: [jobId],
          dryRun: true,
        },
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        results?: Array<{ id: string; ok: boolean; error?: string; detail?: any }>
      }
      expect(res.ok()).toBe(true)
      const first = body.results?.[0]
      expect(first).toBeDefined()

      // ── Assert the refusal names the opener + count ─────────────────────
      expect(first!.ok).toBe(false)
      // Structured detail for the ship dialog.
      expect(first!.detail?.code).toBe('rhythm_beyond_repair')
      expect(typeof first!.detail?.rhythmKey).toBe('string')
      expect(first!.detail?.rhythmKey.length).toBeGreaterThan(0)
      expect(Number(first!.detail?.rhythmCount)).toBeGreaterThanOrEqual(5)
      // The error message names the exact repeated opener + count.
      expect(first!.error).toContain('sentence_start_repetition')
      expect(first!.error).toMatch(/(\d+)× "([^"]+)…"/)
      expect(first!.error).toContain("exceeds the deterministic repair's clearing range")
      expect(first!.error).toContain('AI targeted sweep')
    } finally {
      // ── Clean up the throwaway row ───────────────────────────────────────
      await sb.from('content_jobs').delete().eq('id', jobId)
      await page.close()
    }
  })
})
