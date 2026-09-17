import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { detectCannibalization } from '@/lib/seoFactory/cannibalDetect'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'
import { isQualifiedGscDemandQuery } from '@/lib/seoFactory/queryNoise'

type CannibalGscHit = {
  query: string
  page: string
  impressions?: number
  clicks?: number
  position?: number
}

function qualifiedCannibalHits(hits: CannibalGscHit[]): { hits: CannibalGscHit[]; excludedNonActionable: number } {
  const qualified = (hits || []).filter((row) => isQualifiedGscDemandQuery(String(row.query || ''), {
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    position: Number(row.position || 0),
  }))
  return { hits: qualified, excludedNonActionable: (hits || []).length - qualified.length }
}

/**
 * GET/POST /api/content-studio/cannibalization/detect
 * Recommends only. Does not merge, redirect, or delete. Raw GSC visibility is
 * measured elsewhere; this recommendation surface is qualified-only.
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
      .select('query, page, impressions, clicks, position')
      .eq('start_date', range.startDate)
      .eq('end_date', range.endDate)
      .limit(4000)
    if (siteUrl) q = q.eq('site_url', siteUrl)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message.slice(0, 240) }, { status: 502 })
    const filtered = qualifiedCannibalHits((data || []) as CannibalGscHit[])
    const candidates = detectCannibalization({ hits: filtered.hits })
    return NextResponse.json({
      ok: true,
      range,
      excludedNonActionable: filtered.excludedNonActionable,
      count: candidates.length,
      candidates,
    })
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
      const filtered = qualifiedCannibalHits(body.hits as CannibalGscHit[])
      const candidates = detectCannibalization({
        hits: filtered.hits,
        pages: Array.isArray(body.pages) ? body.pages as { url: string; title?: string }[] : undefined,
      })
      return NextResponse.json({
        ok: true,
        excludedNonActionable: filtered.excludedNonActionable,
        count: candidates.length,
        candidates,
      })
    }
    return GET(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal detect failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
