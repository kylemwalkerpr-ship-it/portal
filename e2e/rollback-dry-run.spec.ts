/**
 * rollback-dry-run.spec.ts
 *
 * E2E for the rollback endpoint through the FULL PATCH route — not a network
 * mock. A throwaway `merged` job row is inserted into content_jobs, then
 * `PATCH /api/content-studio/jobs` with `{ id, action: 'revert', dryRun: true }`
 * is called with the admin session. The route runs parseRepoSlug →
 * revertContent(dryRun), which reads the deploy commit's parent SHA (read-only
 * GitHub lookup) and returns the dry-run decision WITHOUT opening any branch,
 * PR, or merge — so the test asserts the exact revert PATCH response payload
 * and never mutates GitHub.
 *
 * The throwaway row is deleted in `finally`.
 *
 * ── Prerequisites (env) ────────────────────────────────────────────────────
 *   CLERK_TEST_EMAIL / CLERK_TEST_PASSWORD / CLERK_SECRET_KEY — admin login
 *   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — throwaway row
 *   PLAYWRIGHT_BASE_URL — must point at an environment whose Worker has a real
 *   GITHUB_TOKEN + SUPABASE_SERVICE_ROLE_KEY (the deployed portal).
 *
 * Run against the deployed portal:
 *   PLAYWRIGHT_BASE_URL=https://portal.yousafeconsultancy.com npx playwright test \
 *     --project=chromium e2e/rollback-dry-run.spec.ts
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

test.describe('Rollback endpoint dry-run through the full PATCH route (admin)', () => {
  test('dry-run revert returns { status: dry_run, action, note } without opening a PR', async ({ browser }) => {
    test.skip(!hasClerkCredentials(), 'Skipping: set CLERK_TEST_EMAIL + CLERK_TEST_PASSWORD + CLERK_SECRET_KEY (admin role)')
    test.skip(!hasSupabaseEnv(), 'Skipping: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for the throwaway job row')

    const page = await loginAsAdmin(browser)
    test.skip(!page, 'Skipping: could not sign in')
    if (!page) return

    // ── Create the throwaway merged job row ────────────────────────────────
    const jobId = randomUUID()
    const contentPath = 'app/uk/dependent-visa-guide-2026/page.tsx'
    // All-zero 40-hex SHA → GitHub commits lookup 404s → parent SHA is null →
    // the dry-run reports the page as net-new (action: 'deleted').
    const deploySha = '0'.repeat(40)
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    try {
      const { error: insertErr } = await sb.from('content_jobs').insert({
        id: jobId,
        user_id: 'e2e-rollback-dry-run',
        title: 'UK dependent visa guide 2026',
        topic: 'uk dependent visa',
        content_type: 'article',
        region: 'UK',
        status: 'merged',
        target_repo: 'caseworks',
        content_path: contentPath,
        deploy_sha: deploySha,
        primary_keyword: 'uk dependent visa',
        indexable: true,
      })
      expect(insertErr).toBeNull()

      // ── Drive the FULL revert PATCH route (dry-run — no PR/merge) ────────
      const res = await page.request.patch(`${BASE}/api/content-studio/jobs`, {
        data: {
          id: jobId,
          action: 'revert',
          dryRun: true,
        },
      })
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        message?: string
        error?: string
        revert?: {
          status?: string
          action?: string
          path?: string
          owner?: string
          repo?: string
          note?: string
        }
      }
      expect(res.ok()).toBe(true)

      // ── Assert the dry-run revert response payload ───────────────────────
      expect(body.ok).toBe(true)
      expect(body.revert).toBeDefined()
      // Dry-run must NEVER open a branch/PR/merge — it only reports intent.
      expect(body.revert!.status).toBe('dry_run')
      expect(body.revert!.action === 'deleted' || body.revert!.action === 'restored').toBe(true)
      // The note explains what a real revert would do (restore vs delete).
      expect(body.revert!.note).toMatch(/rollback would/i)
      // The path/owner/repo echo the job's shipped target.
      expect(body.revert!.path).toBe(contentPath)
      expect(body.revert!.repo).toBeTruthy()
      // The route-level message mirrors the dry-run note (not a merged state).
      expect(body.message).toBeTruthy()
      expect(body.message).not.toContain('Rollback merged')
    } finally {
      // ── Clean up the throwaway row ───────────────────────────────────────
      await sb.from('content_jobs').delete().eq('id', jobId)
      await page.close()
    }
  })
})
