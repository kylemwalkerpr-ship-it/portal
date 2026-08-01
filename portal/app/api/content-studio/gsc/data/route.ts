import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscAccess } from '@/lib/gscAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'
import { buildGscContentBrief } from '@/lib/gscContentBrief'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'

/**
 * POST /api/content-studio/gsc/data
 *
 * Body (optional):
 *   { siteUrl?, startDate?, endDate?, days?, dimensions?, rowLimit?, topic?, region? }
 *
 * Auth: service account (GSC_SERVICE_ACCOUNT_JSON | GSC_SERVICE_ACCOUNT_KEY)
 *       or OAuth bundle; falls back to CSV snapshot for Content Studio.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const topic = typeof body.topic === 'string' ? body.topic : ''
    const region = typeof body.region === 'string' ? body.region : 'US'
    const siteUrlOverride = typeof body.siteUrl === 'string' ? body.siteUrl : null
    const days =
      typeof body.days === 'number'
        ? body.days
        : typeof body.days === 'string' && /^\d+$/.test(body.days)
          ? parseInt(body.days, 10)
          : 90

    const access = await getGscAccess()
    const siteUrl = siteUrlOverride || access?.siteUrl || process.env.GSC_SITE_URL || null

    // Content brief always available (live or snapshot) for generator / UI
    const brief = await buildGscContentBrief({
      topic: topic || 'immigration international students visas housing',
      region,
    })

    // Prefer full analytics when credentials + site work
    const live = await fetchSiteSearchAnalytics(days)

    if (live.configured && live.topQueries.length > 0) {
      const shape = (q: { key: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
        keys: [q.key],
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: Math.round(q.ctr * 10000) / 100,
        position: Math.round(q.position * 10) / 10,
      })
      return NextResponse.json({
        source: 'live',
        mode: access?.mode ?? 'unknown',
        siteUrl: siteUrl,
        range: live.range,
        dateRange: live.range,
        totals: live.totals,
        totalsPrev: live.totalsPrev,
        daily: live.daily,
        totalRows: live.topQueries.length,
        rows: live.topQueries.map(shape),
        pages: live.topPages.map(shape),
        devices: live.topDevices.map(shape),
        countries: live.topCountries.map(shape),
        brief,
        warnings: live.warnings,
      })
    }

    // Snapshot fallback from public/seo-data (CSV export distilled)
    const snap = await loadGscSnapshot()

    const shapeSnap = (q: { term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }, key: string) => ({
      keys: [key],
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: Math.round(q.ctr * 10000) / 100,
      position: Math.round(q.position * 10) / 10,
    })

    const rows = (snap.topQueries ?? []).map((q) => shapeSnap(q, q.term))
    const pages = (snap.topPages ?? []).map((q) => shapeSnap(q, q.url))

    return NextResponse.json({
      source: 'snapshot',
      mode: access?.mode ?? null,
      siteUrl,
      connected: Boolean(access),
      range: { note: 'CSV snapshot (Downloads/SEO yousafeconsultancy-13..16)', generatedAt: snap.generatedAt },
      dateRange: { startDate: 'snapshot', endDate: snap.generatedAt },
      totals: {
        clicks: snap.totals?.totalClicks ?? 0,
        impressions: snap.totals?.totalImpressions ?? 0,
      },
      totalRows: rows.length,
      rows,
      pages,
      devices: [],
      countries: [],
      opportunities: snap.opportunities ?? {},
      brief,
      warnings: [
        ...(brief.warnings ?? []),
        access?.mode === 'service_account'
          ? 'Service account authenticates but has no property access yet — add gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com as Full user on each GSC property (Search Console → Settings → Users).'
          : 'Serving CSV snapshot until live GSC credentials can read the property.',
      ],
    })
  } catch (err) {
    console.error('[content-studio/gsc/data]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load GSC data' },
      { status: 500 },
    )
  }
}
