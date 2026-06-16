/**
 * GET /api/admin/analytics/gsc/callback?code=...&state=...
 *
 * Completes the Search Console OAuth consent: verifies the state cookie,
 * exchanges the code for a refresh token, auto-detects the property URL from
 * the account's verified sites (preferring a domain property for
 * yousafeconsultancy.com), persists the connection, and bounces the admin
 * back to the analytics Search tab.
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscConfig, saveGscConnection } from '@/lib/gscConfig'

const DASHBOARD = '/dashboard/admin/analytics?tab=search'

function back(origin: string, status: 'connected' | 'error', detail?: string) {
  const u = new URL(DASHBOARD, origin)
  u.searchParams.set('gsc', status)
  if (detail) u.searchParams.set('gsc_detail', detail.slice(0, 120))
  return NextResponse.redirect(u.toString(), { status: 302 })
}

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieState = req.headers.get('cookie')?.match(/gsc_oauth_state=([^;]+)/)?.[1]

  if (url.searchParams.get('error')) return back(origin, 'error', url.searchParams.get('error') || 'denied')
  if (!code) return back(origin, 'error', 'missing code')
  if (!state || !cookieState || state !== cookieState) return back(origin, 'error', 'state mismatch')

  const cfg = await getGscConfig()
  if (!cfg.clientId || !cfg.clientSecret) return back(origin, 'error', 'client credentials missing')

  const redirectUri = `${origin}/api/admin/analytics/gsc/callback`

  // 1. Exchange the authorization code for tokens.
  let refreshToken: string | null = null
  let accessToken: string | null = null
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    })
    const j = (await r.json()) as { refresh_token?: string; access_token?: string; error?: string }
    if (!r.ok || !j.refresh_token) return back(origin, 'error', j.error || 'no refresh_token returned')
    refreshToken = j.refresh_token
    accessToken = j.access_token ?? null
  } catch (e: any) {
    return back(origin, 'error', String(e?.message || 'token exchange failed'))
  }

  // 2. Auto-detect the property URL from the account's verified sites.
  let siteUrl: string | null = cfg.siteUrl
  try {
    if (accessToken) {
      const sr = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const sj = (await sr.json()) as { siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }
      const sites = (sj.siteEntry ?? []).filter(s => s.permissionLevel !== 'siteUnverifiedUser')
      const pick =
        sites.find(s => s.siteUrl === 'sc-domain:yousafeconsultancy.com') ||
        sites.find(s => s.siteUrl.includes('yousafeconsultancy.com')) ||
        sites[0]
      if (pick) siteUrl = pick.siteUrl
    }
  } catch { /* keep existing siteUrl */ }

  await saveGscConnection({
    refresh_token: refreshToken,
    site_url: siteUrl ?? undefined,
  })

  const res = back(origin, 'connected')
  res.cookies.set('gsc_oauth_state', '', { path: '/', maxAge: 0 })
  return res
}
