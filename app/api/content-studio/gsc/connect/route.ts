import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGscAccessToken } from '@/lib/gsc-service-account'

/**
 * POST /api/content-studio/gsc/connect
 * Connects GSC using a service account. Verifies the service account can
 * access the given site URL, then stores the configuration.
 *
 * Body: { siteUrl: string }
 *
 * No OAuth redirects needed — service account auth is server-to-server.
 */
export async function POST(request: NextRequest) {
  try {
    const serviceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKey) {
      return NextResponse.json(
        { error: 'GSC_SERVICE_ACCOUNT_KEY not configured in Cloudflare secrets' },
        { status: 500 },
      )
    }

    const body = await request.json()
    const { siteUrl } = body

    if (!siteUrl) {
      return NextResponse.json(
        { error: 'siteUrl is required (e.g. https://caseworks.com/ or sc-domain:caseworks.com)' },
        { status: 400 },
      )
    }

    // Get an access token from the service account
    const accessToken = await getGscAccessToken(serviceAccountKey)

    // Verify the service account can access this GSC property
    // by making a test query against the site
    const encodedSite = encodeURIComponent(siteUrl)
    const testUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`

    const testRes = await fetch(testUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: '7daysAgo',
        endDate: 'today',
        dimensions: ['query'],
        rowLimit: 1,
      }),
    })

    if (!testRes.ok) {
      const errText = await testRes.text()
      let message = `Cannot access GSC property "${siteUrl}". `

      if (errText.includes('403') || errText.includes('forbidden')) {
        message += `Add gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com as a user in Search Console → Settings → Users for this property.`
      } else if (errText.includes('404') || errText.includes('not found')) {
        message += `This site is not registered in Google Search Console. Add it first.`
      } else {
        message += `API error: ${errText.slice(0, 200)}`
      }

      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Store the connection in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    let serviceAccountEmail = ''
    try {
      const key = JSON.parse(serviceAccountKey)
      serviceAccountEmail = key.client_email ?? ''
    } catch {
      // key parsing failed — still store what we can
    }

    const { error: dbError } = await supabase.from('gsc_tokens').upsert(
      {
        id: 'default',
        access_token: accessToken,
        refresh_token: '', // not used with service accounts
        expires_at: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
        google_email: serviceAccountEmail || 'service-account',
        site_url: siteUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

    if (dbError) {
      console.error('[gsc/connect] Supabase error:', dbError)
      return NextResponse.json({ error: `Failed to store config: ${dbError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      connected: true,
      siteUrl,
      email: serviceAccountEmail,
    })
  } catch (err) {
    console.error('[gsc/connect]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/content-studio/gsc/connect
 * Returns connection status.
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data, error } = await supabase
      .from('gsc_tokens')
      .select('google_email, site_url, expires_at, updated_at')
      .eq('id', 'default')
      .single()

    if (error || !data || !data.site_url) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: true,
      email: data.google_email,
      siteUrl: data.site_url,
      expiresAt: data.expires_at,
      updatedAt: data.updated_at,
    })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
