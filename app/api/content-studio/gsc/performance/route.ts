import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'

/**
 * GET /api/content-studio/gsc/performance
 * Reads persisted seo_gsc_rows only — never calls Google.
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

    let q = auth.db
      .from('seo_gsc_rows')
      .select('site_url, query, page, clicks, impressions, ctr, position, country, device, start_date, end_date, synced_at')
      .eq('start_date', range.startDate)
      .eq('end_date', range.endDate)
      .order('impressions', { ascending: false })
      .limit(limit)
    if (siteUrl) q = q.eq('site_url', siteUrl)

    const { data, error } = await q
    if (error) {
      return NextResponse.json({ error: error.message.slice(0, 240) }, { status: 502 })
    }
    return NextResponse.json({ ok: true, range, siteUrl, rows: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC performance read failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
