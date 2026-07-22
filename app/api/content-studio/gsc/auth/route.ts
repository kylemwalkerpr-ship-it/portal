import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/content-studio/gsc/auth
 * Returns the Google OAuth 2.0 authorization URL.
 * The user clicks this link to grant Search Console read-only access.
 */
export async function GET(request: NextRequest) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.GSC_OAUTH_CLIENT_ID)
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })
  }

  const redirectUri = process.env.GSC_REDIRECT_URI ??
    'https://portal.yousafeconsultancy.com/api/content-studio/gsc/callback'

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
