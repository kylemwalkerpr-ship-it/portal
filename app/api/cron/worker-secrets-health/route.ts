/**
 * POST /api/cron/worker-secrets-health
 *
 * Startup + periodic health check for the Worker's auth/database secrets.
 *
 * In August 2026, CLERK_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY were
 * missing from the Worker (they were "set once manually" and silently lost).
 * Every existing profile looked like a brand-new user — the "Add your name"
 * regression. This route makes that failure visible and loud:
 *
 *   1. Verifies the secrets are present on the Worker.
 *   2. Live-tests the Clerk users endpoint with CLERK_SECRET_KEY.
 *   3. Live-tests the Supabase profiles table with SUPABASE_SERVICE_ROLE_KEY.
 *   4. Emails ops (WAR_ROOM_REPORT_EMAIL / SEO_REPORT_EMAIL / ADMIN_EMAIL)
 *      whenever anything is missing or failing.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as all cron
 * routes). Called by deploy.yml immediately after secret sync (startup
 * check) and by .github/workflows/worker-secrets-health.yml (hourly drift
 * check). /api/cron(.*) is already public in middleware.ts.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

type Check = { id: string; label: string; ok: boolean; detail: string }

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const checks: Check[] = []
  const failures: string[] = []

  // 1) Secret presence on the Worker
  const requiredSecrets: Array<{ name: string; label: string; why: string }> = [
    {
      name: 'CLERK_SECRET_KEY',
      label: 'Clerk secret key',
      why: 'Without it every request is treated as signed-out (session-token-and-uat-missing) and profile email recovery returns empty.',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      label: 'Supabase service role key',
      why: 'Without it no profile or marketplace data loads and new blank client profiles are created.',
    },
    {
      name: 'RESEND_API_KEY',
      label: 'Resend API key',
      why: 'Without it alert emails cannot be sent.',
    },
  ]
  for (const s of requiredSecrets) {
    const present = Boolean((process.env[s.name] || '').trim())
    checks.push({
      id: `secret_${s.name}`,
      label: s.label,
      ok: present,
      detail: present ? 'Present' : `MISSING — ${s.why}`,
    })
    if (!present) failures.push(`${s.label} (${s.name})`)
  }

  // 2) Live Clerk check
  const clerkKey = (process.env.CLERK_SECRET_KEY || '').trim()
  if (clerkKey) {
    try {
      const res = await fetch('https://api.clerk.com/v1/users?limit=1', {
        headers: { Authorization: `Bearer ${clerkKey}` },
      })
      if (res.ok) {
        checks.push({ id: 'clerk_live', label: 'Clerk API (live)', ok: true, detail: 'OK — users endpoint reachable' })
      } else {
        const text = await res.text().catch(() => '')
        checks.push({
          id: 'clerk_live',
          label: 'Clerk API (live)',
          ok: false,
          detail: `${res.status} ${text.slice(0, 120)}`,
        })
        failures.push('Clerk API rejected CLERK_SECRET_KEY')
      }
    } catch (e) {
      checks.push({
        id: 'clerk_live',
        label: 'Clerk API (live)',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 160) : 'Clerk call failed',
      })
      failures.push('Clerk API call failed')
    }
  }

  // 3) Live Supabase check
  if ((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    try {
      const db = createSupabaseAdminClient()
      const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true })
      if (error) throw error
      checks.push({
        id: 'supabase_live',
        label: 'Supabase profiles (live)',
        ok: true,
        detail: `OK — ${count ?? 0} profiles readable`,
      })
    } catch (e) {
      checks.push({
        id: 'supabase_live',
        label: 'Supabase profiles (live)',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 160) : 'Supabase call failed',
      })
      failures.push('Supabase rejected SUPABASE_SERVICE_ROLE_KEY')
    }
  }

  const ok = failures.length === 0

  // 4) Alert ops when unhealthy
  if (!ok) {
    const recipients = [
      process.env.WAR_ROOM_REPORT_EMAIL,
      process.env.SEO_REPORT_EMAIL,
      process.env.ADMIN_EMAIL,
    ].filter((x): x is string => Boolean(x && x.trim()))

    if (recipients.length > 0) {
      const lines = checks
        .map((c) => `\u2022 <b>${escapeHtml(c.label)}</b>: ${c.ok ? 'OK' : 'FAIL — ' + escapeHtml(c.detail)}`)
        .join('<br/>')
      try {
        await sendEmail({
          to: recipients,
          subject: '[YouSafe] \u26a0\ufe0f Worker secret health check FAILED',
          html: `
<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111;">
  <h2 style="margin-bottom:4px">Worker secret health check failed</h2>
  <p style="color:#555;margin-top:0">${new Date().toISOString()}</p>
  <p>The Cloudflare Worker for portal.yousafeconsultancy.com is missing or has invalid
     critical secrets. This causes every existing profile to look like a brand-new user,
     and the marketplace to render empty.</p>
  <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px">${lines}</div>
  <p>Fix: re-set the secrets on the Worker (deploy.yml now re-syncs them from GitHub
     secrets on every deploy) — push a commit or re-run the Deploy workflow.</p>
  <p>— YouSafe Ops</p>
</body></html>`.trim(),
        })
      } catch (e) {
        console.error('[worker-secrets-health] alert email failed', e instanceof Error ? e.message : e)
      }
    }
  }

  return Response.json({
    ok,
    healthy: ok,
    checkedAt: new Date().toISOString(),
    failures,
    checks,
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
