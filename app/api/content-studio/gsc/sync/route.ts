import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchQueryPageRows } from '@/lib/gscAnalytics'
import { upsertSeoGscRows } from '@/lib/seoFactory/gscRows'
import { saveSnapshotVersion } from '@/lib/seoFactory/gscHistory'

/**
 * POST /api/content-studio/gsc/sync
 * Fetch query×page Search Analytics and upsert into seo_gsc_rows.
 * Default window: 90 days. Presets: 28 | 90 | 180 | 365.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const daysRaw = typeof body.days === 'number' ? body.days : typeof body.days === 'string' ? Number(body.days) : 90
    const days = [28, 90, 180, 365].includes(daysRaw) ? daysRaw : 90
    const siteUrlOverride = typeof body.siteUrl === 'string' ? body.siteUrl : undefined

    const fetched = await fetchQueryPageRows({ days, siteUrl: siteUrlOverride })
    if (!fetched.configured) {
      return NextResponse.json({
        ok: true,
        rowsProcessed: 0,
        range: fetched.range,
        siteUrl: fetched.siteUrl,
        source: 'unconfigured',
        warnings: fetched.warnings,
      })
    }

    const { upserted } = await upsertSeoGscRows(auth.db, fetched.rows)
    if (fetched.siteUrl) {
      try {
        await saveSnapshotVersion(
          fetched.siteUrl,
          fetched.range.endDate,
          fetched.rows.length,
          JSON.stringify({
            rows: fetched.rows.map((r) => ({
              keys: [r.query, r.page],
              clicks: r.clicks,
              impressions: r.impressions,
              ctr: r.ctr,
              position: r.position,
            })),
          }),
        )
      } catch {
        /* snapshot is best-effort; rows are the source of truth */
      }
    }

    return NextResponse.json({
      ok: true,
      rowsProcessed: upserted,
      range: fetched.range,
      siteUrl: fetched.siteUrl,
      source: 'live',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC sync failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
