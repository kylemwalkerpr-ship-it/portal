/**
 * GET /api/admin/analytics/gsc/connect
 *
 * Kicks off the Google Search Console OAuth consent. Admin-gated. Sets a
 * signed state cookie and 302s to Google's consent screen with
 * access_type=offline + prompt=consent so Google returns a refresh token.
 * The matching redirect URI must be registered on the OAuth client:
 *   https://portal.yousafeconsultancy.com/api/admin/analytics/gsc/callback
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscConfig } from '@/lib/gscConfig'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const cfg = await getGscConfig()
  if (!cfg.clientId) {
    return NextResponse.json({ error: 'GSC client ID not configured.' }, { status: 400 })
  }

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/analytics/gsc/callback`
  const state = crypto.randomUUID()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', cfg.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/webmasters.readonly')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString(), { status: 302 })
  res.cookies.set('gsc_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  })
  return res
}
