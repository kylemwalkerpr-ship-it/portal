import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { detectCannibalization } from '@/lib/seoFactory/cannibalDetect'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'

/**
 * GET/POST /api/content-studio/cannibalization/detect
 * Recommends only. Does not merge, redirect, or delete.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const days = Number(request.nextUrl.searchParams.get('days') || '90')
    const range = resolveGscDayWindow(days)
    const siteUrl = request.nextUrl.searchParams.get('siteUrl') || process.env.GSC_SITE_URL || null
    let q = auth.db
      .from('seo_gsc_rows')
      .select('query, page, impressions, position')
      .eq('start_date', range.startDate)
      .eq('end_date', range.endDate)
      .limit(4000)
    if (siteUrl) q = q.eq('site_url', siteUrl)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message.slice(0, 240) }, { status: 502 })
    const candidates = detectCannibalization({ hits: data || [] })
    return NextResponse.json({ ok: true, range, count: candidates.length, candidates })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal detect failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    if (Array.isArray(body.hits)) {
      const candidates = detectCannibalization({
        hits: body.hits as { query: string; page: string; impressions?: number }[],
        pages: Array.isArray(body.pages) ? body.pages as { url: string; title?: string }[] : undefined,
      })
      return NextResponse.json({ ok: true, count: candidates.length, candidates })
    }
    return GET(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal detect failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
