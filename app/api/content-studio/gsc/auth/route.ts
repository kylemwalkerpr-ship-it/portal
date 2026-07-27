import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * GET /api/content-studio/gsc/auth
 * Returns the Google OAuth 2.0 authorization URL.
 * The user clicks this link to grant Search Console read-only access.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Accept every historical secret name used across deploy + dashboard wiring
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.GSC_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_OAUTH_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'Google OAuth client ID not configured. Set GOOGLE_CLIENT_ID or GSC_OAUTH_CLIENT_ID on the Worker ' +
          '(or use the GSC service account: GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL — no OAuth button needed).',
      },
      { status: 500 },
    )
  }

  const redirectUri = process.env.GSC_REDIRECT_URI ??
    `${request.nextUrl.origin}/api/content-studio/gsc/callback`

  const scope = 'https://www.googleapis.com/auth/webmasters.readonly'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',       // Get a refresh_token
    prompt: 'consent',            // Force consent screen to always get refresh_token
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  return NextResponse.json({ authUrl })
}
