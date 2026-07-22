import { NextRequest, NextResponse } from 'next/server'
import { getGscAccessToken } from '@/lib/gsc-service-account'

/**
 * POST /api/content-studio/gsc/data
 * Pulls Google Search Console search analytics data using service account auth.
 * Body: { siteUrl, startDate, endDate, dimensions?, rowLimit? }
 *
 * Uses the GSC_SERVICE_ACCOUNT_KEY Cloudflare secret — no OAuth tokens needed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      siteUrl,
      startDate = '30daysAgo',
      endDate = 'today',
      dimensions = ['query'],
      rowLimit = 100,
    } = body

    if (!siteUrl) {
      return NextResponse.json(
        { error: 'siteUrl is required (e.g. https://caseworks.com/)' },
        { status: 400 },
      )
    }

    const serviceAccountKey = process.env.GSC_SERVICE_ACCOUNT_KEY
    if (!serviceAccountKey) {
      return NextResponse.json(
        {
          error: 'GSC not configured. Set GSC_SERVICE_ACCOUNT_KEY in Cloudflare secrets.',
          connected: false,
        },
        { status: 401 },
      )
    }

    // Get access token from service account JWT
    const accessToken = await getGscAccessToken(serviceAccountKey)

    // Query GSC search analytics
    const encodedSite = encodeURIComponent(siteUrl)
    const gscUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`

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
      let message = `GSC API error (${gscRes.status}): ${err.slice(0, 200)}`

      if (err.includes('403') || err.includes('forbidden')) {
        message = `Access denied. Add gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com as a user in Search Console → Settings → Users for "${siteUrl}".`
      } else if (err.includes('404') || err.includes('not found')) {
        message = `Site "${siteUrl}" not found in Search Console. Register it first.`
      }

      return NextResponse.json({ error: message }, { status: gscRes.status })
    }

    const data = await gscRes.json()

    // Transform into a usable shape for the dashboard
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
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal error',
      },
      { status: 500 },
    )
  }
}
