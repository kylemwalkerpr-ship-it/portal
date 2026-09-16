import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { persistGscQueryPageRows } from '@/lib/seoFactory/gscPersistence'

/**
 * POST /api/content-studio/gsc/sync
 * Fetch query×page Search Analytics and upsert into seo_gsc_rows.
 * Default window: 90 days. Presets: 28 | 90 | 180 | 365.
 *
 * Truthful measurement states:
 *   live        → 200 ok:true, measured rows
 *   empty       → 200 ok:true status:'empty' (a live query with zero rows is
 *                 NOT unavailable and does not imply demand=0)
 *   unavailable → 503 ok:false (never report a missing connection as a
 *                 healthy zero)
 *   failed      → 502 ok:false
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

    const result = await persistGscQueryPageRows(auth.db, { days, siteUrl: siteUrlOverride })

    if (result.status === 'unavailable') {
      return NextResponse.json({
        ok: false,
        status: result.status,
        rowsProcessed: 0,
        range: result.range,
        siteUrl: result.siteUrl,
        source: 'unconfigured',
        syncedAt: result.syncedAt,
        attemptedAt: result.attemptedAt,
        warnings: result.warnings,
        error: result.warnings[0] || 'GSC connection unavailable',
      }, { status: 503 })
    }

    if (result.status === 'failed') {
      return NextResponse.json({
        ok: false,
        status: result.status,
        rowsProcessed: 0,
        range: result.range,
        siteUrl: result.siteUrl,
        source: 'live',
        syncedAt: result.syncedAt,
        attemptedAt: result.attemptedAt,
        warnings: result.warnings,
        error: result.error || 'GSC sync failed',
      }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      rowsProcessed: result.rowsProcessed,
      range: result.range,
      siteUrl: result.siteUrl,
      source: 'live',
      syncedAt: result.syncedAt,
      attemptedAt: result.attemptedAt,
      warnings: result.warnings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC sync failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
