import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadForecastTracker } from '@/lib/seoEngine/forecastTracker'

export const runtime = 'nodejs'

/**
 * GET /api/seo-engine/tracker
 * 30/60/90-day execution tracker — forecast vs actual (GSC deltas) per topic.
 *
 * Query params:
 *   horizon=30|60|90|all   — filter to one horizon (default all)
 *   limit=<n>              — forecast runs to consider (default 200)
 *
 * Returns a TrackerReport: per-topic rows with projected vs actual position /
 * impressions / clicks, verdicts (over_predicted / under_predicted / on_track /
 * mixed / no_data), and a fleet summary with per-horizon on-track rates.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sp = req.nextUrl.searchParams
  const horizonRaw = sp.get('horizon')
  const horizon: '30' | '60' | '90' | 'all' =
    horizonRaw === '30' || horizonRaw === '60' || horizonRaw === '90' || horizonRaw === 'all'
      ? horizonRaw
      : 'all'
  const limit = Math.min(400, Math.max(10, Number(sp.get('limit')) || 200))
  const report = await loadForecastTracker({ horizon, limit })
  return NextResponse.json({ ok: true, ...report })
}
