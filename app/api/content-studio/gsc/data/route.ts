import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * POST /api/content-studio/gsc/data
 * Pulls Google Search Console search analytics data.
 * Body: { siteUrl, startDate, endDate, dimensions?, rowLimit? }
 *
 * Auto-refreshes the access token if expired.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const { siteUrl, startDate = '30daysAgo', endDate = 'today', dimensions = ['query'], rowLimit = 100 } = body

    if (!siteUrl) {
      return NextResponse.json({ error: 'siteUrl is required (e.g. https://caseworks.com/)' }, { status: 400 })
    }

    // Get stored token from Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: tokenRow, error: tokenError } = await supabase
      .from('gsc_tokens')
      .select('*')
      .eq('id', 'default')
      .single()

    if (tokenError || !tokenRow) {
      return NextResponse.json({ error: 'GSC not connected. Authenticate first.', connected: false }, { status: 401 })
    }

    let accessToken = tokenRow.access_token

    // Refresh if expired (with 60s buffer)
    const expiresAt = new Date(tokenRow.expires_at).getTime()
    if (Date.now() > expiresAt - 60000) {
      try {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: (process.env.GOOGLE_CLIENT_ID || process.env.GSC_OAUTH_CLIENT_ID)!,
            client_secret: (process.env.GOOGLE_CLIENT_SECRET || process.env.GSC_OAUTH_CLIENT_SECRET)!,
            refresh_token: tokenRow.refresh_token,
            grant_type: 'refresh_token',
          }),
        })

        if (!refreshRes.ok) {
          const err = await refreshRes.text()
          throw new Error(`Token refresh failed: ${err}`)
        }

        const refreshed = await refreshRes.json()
        accessToken = refreshed.access_token

        // Update stored token
        const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
        await supabase
          .from('gsc_tokens')
          .update({ access_token: accessToken, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
          .eq('id', 'default')
      } catch (err) {
        return NextResponse.json({
          error: 'Token refresh failed. Re-authenticate GSC.',
          needsReauth: true,
        }, { status: 401 })
      }
    }

    // Query GSC search analytics
    const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`

    const gscRes = await fetch(gscUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
        aggregationType: 'auto',
      }),
    })

    if (!gscRes.ok) {
      const err = await gscRes.text()
      return NextResponse.json({ error: `GSC API error: ${err.slice(0, 200)}` }, { status: gscRes.status })
    }

    const data = await gscRes.json()

    // Transform into a usable shape
    const rows = (data.rows ?? []).map((row: any) => ({
      keys: row.keys,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: Math.round(row.ctr * 10000) / 100, // e.g. 4.52%
      position: Math.round(row.position * 10) / 10, // e.g. 3.2
    }))

    return NextResponse.json({
      siteUrl,
      dateRange: { startDate, endDate },
      totalRows: rows.length,
      rows,
    })
  } catch (err) {
    console.error('[gsc/data]', err)
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Internal error',
    }, { status: 500 })
  }
}
