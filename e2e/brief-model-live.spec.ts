/**
 * brief-model-live.spec.ts
 *
 * E2E for the brief-model policy (lib/seoFactory/briefModel) through the FULL
 * deployed route — not a network mock. Signs in as admin, then POSTs
 * `/api/content-studio/suggest-brief` with `aiProvider: 'auto'` (the exact
 * leak value that used to route the brief through the open-source cascade).
 * The policy must coerce it to the live Entrim lead — Entrim Qwen3.6 27B
 * (`entrim-qwen-27b`) — and the route must return a valid, complete editorial
 * brief JSON — never a code-fenced blob, never a non-Entrim provider, never
 * a 500.
 *
 * ── Prerequisites (env) ────────────────────────────────────────────────────
 *   CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD / CLERK_SECRET_KEY — admin login
 *   PLAYWRIGHT_BASE_URL — must point at an environment whose Worker has
 *   ENTRIM_API_KEY configured (the deployed portal). Locally the test skips.
 *
 * Run against the deployed portal:
 *   PLAYWRIGHT_BASE_URL=https://portal.yousafeconsultancy.com npx playwright test \
 *     --project=chromium e2e/brief-model-live.spec.ts
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

test.describe('Brief-model policy through the full deployed route (admin)', () => {
  test('Generate Full Brief with aiProvider "auto" returns a complete brief from Entrim Qwen3.6 27B', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    try {
      const res = await page.request.post(`${BASE}/api/content-studio/suggest-brief`, {
        data: {
          topic: 'UK Dependent Visa Guide',
          region: 'UK',
          contentType: 'article',
          primaryKeyword: 'uk dependent visa',
          audience: 'immigration applicants',
          // Deliberately NOT an explicit value — the 2026-09 leak path. The
          // policy must coerce this to the Entrim Qwen lead
          // (entrim-qwen-27b / Qwen/Qwen3.6-27B).
          aiProvider: 'auto',
        },
        timeout: 120_000,
      })
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>

      // The route itself must be reachable + authorized.
      expect(res.ok(), `expected 2xx, got ${res.status()}: ${JSON.stringify(body).slice(0, 300)}`).toBe(true)

      // Valid JSON brief — the `ok: true` marker only exists on the success
      // branch, so a code-fenced blob ("```json { …") would fail here.
      expect(body.ok).toBe(true)

      // 'auto' resolved to the Entrim Qwen lead — the live policy never
      // falls back to a decommissioned backend for the brief.
      expect(body.provider).toBe('entrim-qwen-27b')
      expect(body.model).toBe('Qwen/Qwen3.6-27B')
      expect(body.fallbackUsed).toBe(false)

      // The brief is COMPLETE — every field the drafting stage needs.
      expect(String(body.suggestedH1 || '')).not.toBe('')
      const h2 = body.h2Outline as unknown[]
      expect(Array.isArray(h2)).toBe(true)
      expect(h2!.length).toBeGreaterThanOrEqual(4)
      const shorts = body.shortTail as string[]
      expect(Array.isArray(shorts)).toBe(true)
      expect(shorts!.length).toBeGreaterThanOrEqual(5)
      const longs = body.longTail as string[]
      expect(Array.isArray(longs)).toBe(true)
      expect(longs!.length).toBeGreaterThanOrEqual(1)
      // INTERNAL LINK GUARANTEE: ≥2 verified estate links in every brief.
      const interlinks = body.interlinkTargets as Array<{ label?: string; url?: string }>
      expect(Array.isArray(interlinks)).toBe(true)
      expect(interlinks!.length).toBeGreaterThanOrEqual(2)
      const urls = interlinks!.map((l) => String(l?.url || ''))
      expect(urls.every((u) => u.startsWith('http'))).toBe(true)
      // Word budget is clamped to the content-type spec — numeric, in range.
      expect(typeof body.minWords).toBe('number')
      expect(typeof body.maxWords).toBe('number')
      expect(Number(body.minWords)).toBeGreaterThan(0)
      expect(Number(body.maxWords)).toBeGreaterThan(Number(body.minWords))
      // Slug + meta present (the 2026-08 missing-meta blocker).
      expect(String(body.targetSlug || '')).not.toBe('')
      expect(String(body.metaDescription || '')).not.toBe('')
    } finally {
      await page.close()
    }
  })
})
