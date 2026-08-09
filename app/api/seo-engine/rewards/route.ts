import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  FAMILY_WEIGHTS,
  SIGNAL_FAMILIES,
  actionFamily,
  creditOutcome,
  loadCalibrationHistory,
  loadRewardLedger,
  persistRewardEvent,
  recalibrateWeights,
  recordCalibration,
  type RewardEvent,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

/**
 * GET  /api/seo-engine/rewards  — reward ledger, calibration history, and a
 *                                 per-family attribution summary.
 * POST /api/seo-engine/rewards  — record an observed outcome (Δ impressions /
 *                                 Δ clicks / Δ position) for a shipped page and
 *                                 optionally recalibrate the model weights.
 *
 * The reward loop is what makes the model dynamic: it re-weights signal
 * families from what the estate actually experiences, bounded and auditable.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sp = req.nextUrl.searchParams
  const [ledger, calibration] = await Promise.all([
    loadRewardLedger(Number(sp.get('limit')) || 40),
    loadCalibrationHistory(10),
  ])
  const latestWeights = (calibration[0]?.weights as Record<string, number> | undefined) || FAMILY_WEIGHTS

  const attribution: Record<string, number> = {}
  let totalReward = 0
  for (const r of ledger) {
    totalReward += Number(r.reward) || 0
    const fam = actionFamily(String(r.action || ''))
    attribution[fam] = (attribution[fam] || 0) + (Number(r.reward) || 0)
  }

  return NextResponse.json({
    ok: true,
    modelVersion: 'seo-ranking-model-v1',
    weights: latestWeights,
    families: SIGNAL_FAMILIES,
    ledger,
    calibration,
    summary: {
      events: ledger.length,
      totalReward,
      avgReward: ledger.length ? Math.round((totalReward / ledger.length) * 100) / 100 : 0,
      attribution,
    },
  })
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const pageUrl = String(body.pageUrl || '').trim()
    if (!pageUrl) {
      return NextResponse.json({ ok: false, error: 'pageUrl is required' }, { status: 400 })
    }
    const event: RewardEvent = creditOutcome({
      pageUrl,
      topic: body.topic ? String(body.topic) : undefined,
      action: String(body.action || 'refresh'),
      deltaImpressions: typeof body.deltaImpressions === 'number' ? body.deltaImpressions : undefined,
      deltaClicks: typeof body.deltaClicks === 'number' ? body.deltaClicks : undefined,
      deltaPosition: typeof body.deltaPosition === 'number' ? body.deltaPosition : undefined,
      note: body.note ? String(body.note) : undefined,
    })
    await persistRewardEvent(event)

    // Bounded recalibration — replay the recent ledger into the weight updater.
    let weights = FAMILY_WEIGHTS
    let recalibrated = false
    if (body.recalibrate !== false) {
      const calibration = await loadCalibrationHistory(1)
      const current = (calibration[0]?.weights as Record<string, number> | undefined) || FAMILY_WEIGHTS
      const ledger = await loadRewardLedger(60)
      const recent = ledger
        .filter((r) => Number(r.reward) > 0)
        .map((r) => creditOutcome({
          pageUrl: String(r.page_url),
          topic: r.topic ? String(r.topic) : undefined,
          action: String(r.action),
          deltaImpressions: Number(r.delta_impressions) || 0,
          deltaClicks: Number(r.delta_clicks) || 0,
          deltaPosition: Number(r.delta_position) || 0,
        }))
      weights = recalibrateWeights(current as typeof FAMILY_WEIGHTS, recent)
      if (JSON.stringify(weights) !== JSON.stringify(current)) {
        await recordCalibration(weights, recent.length, `recalibrated after reward event ${event.id.slice(0, 12)}`)
        recalibrated = true
      }
    }

    return NextResponse.json({ ok: true, event, weights, recalibrated })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'reward record failed' },
      { status: 500 },
    )
  }
}
