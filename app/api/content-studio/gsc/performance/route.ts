import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'
import { loadPersistedGscWindow } from '@/lib/seoFactory/gscRows'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'

/**
 * GET /api/content-studio/gsc/performance
 * Reads persisted seo_gsc_rows only — never calls Google.
 * Falls back to the latest stored window when the rolling UTC window is empty
 * so CTR-harvest jobs are not starved between syncs.
 * Junk (PDF filenames, brand navigational) is dropped at the read boundary.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const sp = request.nextUrl.searchParams
    const siteUrl = sp.get('siteUrl') || process.env.GSC_SITE_URL || null
    const daysRaw = Number(sp.get('days') || '90')
    const startOverride = sp.get('startDate') || undefined
    const endOverride = sp.get('endDate') || undefined
    const limit = Math.min(500, Math.max(1, Number(sp.get('limit') || '100') || 100))
    const range = resolveGscDayWindow(daysRaw, startOverride, endOverride)

    const persisted = await loadPersistedGscWindow(auth.db, {
      siteUrl,
      startDate: range.startDate,
      endDate: range.endDate,
      limit,
      select: 'site_url, query, page, clicks, impressions, ctr, position, country, device, start_date, end_date, synced_at',
    })

    // Belt-and-suspenders: never surface Pacific-PDF / yousafe brand rows.
    const rows = persisted.rows.filter((row) => !isJunkQuery(String(row.query || '')))

    return NextResponse.json({
      ok: true,
      range: { ...range, startDate: persisted.range.startDate, endDate: persisted.range.endDate },
      requestedRange: range,
      usedFallback: persisted.usedFallback,
      siteUrl,
      rows,
      rowCount: rows.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC performance read failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}