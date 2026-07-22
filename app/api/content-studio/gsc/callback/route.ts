import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/content-studio/gsc/callback
 * Google OAuth 2.0 callback. Exchanges the authorization code for
 * access_token + refresh_token and stores them in Supabase.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/dashboard/admin/content-studio?gsc_error=${encodeURIComponent(error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/dashboard/admin/content-studio?gsc_error=no_code`
    )
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured')
    }

    const redirectUri = process.env.GSC_REDIRECT_URI ??
      `${request.nextUrl.origin}/api/content-studio/gsc/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Token exchange failed: ${err}`)
    }

    const tokens = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokens

    if (!refresh_token) {
      throw new Error('No refresh_token returned — ensure access_type=offline and prompt=consent')
    }

    // Get the user's email (identify the GSC account)
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const userInfo = await userRes.json()
    const email = userInfo.email ?? 'unknown'

    // Store in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

    const { error: dbError } = await supabase
      .from('gsc_tokens')
      .upsert({
        id: 'default',
        access_token,
        refresh_token,
        expires_at: expiresAt,
        google_email: email,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (dbError) throw new Error(`Supabase upsert failed: ${dbError.message}`)

    return NextResponse.redirect(
      `${request.nextUrl.origin}/dashboard/admin/content-studio?gsc_connected=true&email=${encodeURIComponent(email)}`
    )
  } catch (err) {
    console.error('[gsc/callback]', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(
      `${request.nextUrl.origin}/dashboard/admin/content-studio?gsc_error=${encodeURIComponent(msg)}`
    )
  }
}
