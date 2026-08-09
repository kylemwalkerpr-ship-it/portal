import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  buildForecast,
  loadForecasts,
  persistForecast,
  type PlannedAction,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

/**
 * GET  /api/seo-engine/forecast  — recent 30/60/90-day forecast runs
 * POST /api/seo-engine/forecast  — project a topic/page's trajectory given
 *                                  current GSC metrics + planned actions.
 * Every forecast carries explicit assumptions; it is decision support, not a
 * guarantee.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sp = req.nextUrl.searchParams
  const forecasts = await loadForecasts(Number(sp.get('limit')) || 30)
  return NextResponse.json({ ok: true, forecasts })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const topic = String(body.topic || '').trim()
    if (!topic) {
      return NextResponse.json({ ok: false, error: 'topic is required' }, { status: 400 })
    }
    const plannedActions = (Array.isArray(body.plannedActions) ? body.plannedActions : []).map((a) => {
      const action = String((a as Record<string, unknown>).action || 'depth') as PlannedAction['action']
      const strength = Math.max(1, Math.min(3, Number((a as Record<string, unknown>).strength) || 2)) as 1 | 2 | 3
      return { action, strength }
    })
    const forecast = buildForecast({
      position: typeof body.position === 'number' ? body.position : undefined,
      impressions: typeof body.impressions === 'number' ? body.impressions : undefined,
      clicks: typeof body.clicks === 'number' ? body.clicks : undefined,
      ctr: typeof body.ctr === 'number' ? body.ctr : undefined,
      modelTotal: typeof body.modelTotal === 'number' ? body.modelTotal : undefined,
      plannedActions,
    })
    if (body.persist !== false) {
      await persistForecast(topic, forecast, body.subjectKey ? String(body.subjectKey) : null)
    }
    return NextResponse.json({ ok: true, topic, forecast })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'forecast failed' },
      { status: 500 },
    )
  }
}
