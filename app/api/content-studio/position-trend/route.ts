/**
 * POST /api/content-studio/position-trend
 *
 * Body: { canonicalUrls: string[], days?: number }
 *
 * For each canonical URL we need three things on the PublishLedger stamp:
 *   1. Current position + impressions (topPages match).
 *   2. A coarse trend direction (current vs prior half-window) for the badge.
 *   3. A small daily series so the studio can render a sparkline.
 *
 * Auth: admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'
import { getGscAccess } from '@/lib/gscAuth'

interface PositionTrendRequestBody {
  canonicalUrls?: string[]
  days?: number
}

interface PositionTrendEntry {
  url: string
  found: boolean
  position: number | null
  impressions: number | null
  clicks: number | null
  ctr: number | null
  deltaPosition: number | null
  direction: 'up' | 'down' | 'flat' | 'unknown'
  points: Array<{ date: string; clicks: number; impressions: number; position: number; ctr: number }>
}

function normPathname(u: string): string {
  try {
    const p = new URL(u)
    return (p.host.toLowerCase() + (p.pathname.replace(/\/+$/, '') || '/'))
  } catch {
    return u.replace(/\/+$/, '').toLowerCase()
  }
}

function ymd(daysAgo: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as PositionTrendRequestBody
    const canonicalUrls = Array.isArray(body?.canonicalUrls)
      ? body!.canonicalUrls.filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
      : []
    if (!canonicalUrls.length) {
      return NextResponse.json(
        { error: 'canonicalUrls[] required' },
        { status: 400 },
      )
    }

    const days = Math.min(90, Math.max(7, Number(body?.days) || 28))
    const priorDays = Math.max(7, Math.floor(days / 2))

    const [analytics, priorAnalytics, gscAccess] = await Promise.all([
      fetchSiteSearchAnalytics(days).catch(() => null),
      fetchSiteSearchAnalytics(priorDays).catch(() => null),
      getGscAccess().catch(() => null),
    ])

    if (!analytics || !gscAccess?.accessToken || !gscAccess?.siteUrl) {
      return NextResponse.json({
        ok: true,
        source: 'disconnected',
        trends: canonicalUrls.map((url) => ({
          url, found: false, position: null, impressions: null, clicks: null,
          ctr: null, deltaPosition: null, direction: 'unknown', points: [],
        })),
      })
    }

    const currentPages = (analytics.topPages || []).map((p) => ({ ...p, _norm: normPathname(p.key) }))
    const priorPages = (priorAnalytics?.topPages || []).map((p) => ({ ...p, _norm: normPathname(p.key) }))

    // Per-URL sparkline: query GSC `searchanalytics.query` with dimensions
    // ['date','page'] and a page filter to fetch the daily series for each
    // canonical URL. Cap the total lookups at 10 (we never need more than
    // that many stamps lit up at once) to keep within Worker time budgets.
    const targetSet = canonicalUrls.slice(0, 10)
    const dailyByUrl = new Map<string, Array<{ date: string; clicks: number; impressions: number; position: number; ctr: number }>>()

    await Promise.all(targetSet.map(async (url) => {
      try {
        const endDate = ymd(0)
        const startDate = ymd(days - 1)
        const okPath = normPathname(url)
        const res = await fetch(
          `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscAccess.siteUrl!)}/searchAnalytics/query`,
          {
            method: 'POST',
            headers: {
              'authorization': `Bearer ${gscAccess.accessToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              startDate, endDate,
              dimensions: ['date', 'page'],
              dimensionFilterGroups: [{
                filters: [{
                  dimension: 'page',
                  operator: 'contains',
                  expression: okPath.split('/').slice(-2).join('/') || okPath,
                }],
              }],
              rowLimit: days,
            }),
          },
        )
        if (!res.ok) {
          dailyByUrl.set(url, [])
          return
        }
        const parsed = await res.json() as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> }
        const points = (parsed.rows || []).map((r) => ({
          date: r.keys?.[0] || '',
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          position: r.position || 0,
          ctr: r.ctr || 0,
        }))
        dailyByUrl.set(url, points)
      } catch {
        dailyByUrl.set(url, [])
      }
    }))

    const trends: PositionTrendEntry[] = canonicalUrls.map((url) => {
      const norm = normPathname(url)
      const match = currentPages.find((p) => p._norm === norm)
        || currentPages.find((p) => p._norm.includes(norm) || norm.includes(p._norm))
      if (!match) {
        return {
          url, found: false, position: null, impressions: null, clicks: null,
          ctr: null, deltaPosition: null, direction: 'unknown', points: [],
        }
      }

      const priorMatch = priorPages.find((p) => p._norm === match._norm)
      const deltaPosition = priorMatch ? (match.position - priorMatch.position) : null
      let direction: PositionTrendEntry['direction'] = 'unknown'
      if (deltaPosition != null) {
        if (deltaPosition <= -0.3) direction = 'up'
        else if (deltaPosition >= 0.3) direction = 'down'
        else direction = 'flat'
      }

      return {
        url,
        found: true,
        position: match.position,
        impressions: match.impressions,
        clicks: match.clicks,
        ctr: match.ctr,
        deltaPosition: deltaPosition == null ? null : Number(deltaPosition.toFixed(2)),
        direction,
        points: (dailyByUrl.get(url) || []).slice(-28),
      }
    })

    return NextResponse.json({
      ok: true,
      source: 'live',
      range: analytics.range,
      totals: analytics.totals,
      trends,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'position-trend failed' },
      { status: 500 },
    )
  }
}
