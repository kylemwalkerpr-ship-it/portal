import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  FAMILY_WEIGHTS,
  SIGNAL_FAMILIES,
  actionFamily,
  creditOutcome,
  loadCalibrationHistory,
  loadObservedCalibrationHistory,
  loadRewardLedger,
  isTrainingEligibleRewardRow,
  persistRewardEvent,
  type RewardEvent,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'

/**
 * GET  /api/seo-engine/rewards  — reward ledger, calibration history, and a
 *                                 per-family attribution summary.
 * POST /api/seo-engine/rewards  — record a manual operator observation note.
 *                                 Manual deltas are audit-only and never train.
 *
 * Active model weights come only from calibrations created from verified,
 * intervention-bound cron GSC improvement evidence.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const sp = req.nextUrl.searchParams
  const [ledger, calibration, observedCalibration] = await Promise.all([
    loadRewardLedger(Number(sp.get('limit')) || 40),
    loadCalibrationHistory(10),
    loadObservedCalibrationHistory(10),
  ])
  const activeCalibration = observedCalibration[0] || null
  const latestWeights = (activeCalibration?.weights as Record<string, number> | undefined) || FAMILY_WEIGHTS

  const auditAttribution: Record<string, number> = {}
  let auditTotalReward = 0
  for (const r of ledger) {
    auditTotalReward += Number(r.reward) || 0
    const fam = actionFamily(String(r.action || ''))
    auditAttribution[fam] = (auditAttribution[fam] || 0) + (Number(r.reward) || 0)
  }

  const trainingLedger = ledger.filter(isTrainingEligibleRewardRow)
  const trainingAttribution: Record<string, number> = {}
  let trainingTotalReward = 0
  for (const r of trainingLedger) {
    trainingTotalReward += Number(r.reward) || 0
    const persisted = r.attribution && typeof r.attribution === 'object'
      ? (r.attribution as Record<string, unknown>)
      : {}
    for (const [family, amount] of Object.entries(persisted)) {
      const value = Number(amount) || 0
      if (value > 0) trainingAttribution[family] = (trainingAttribution[family] || 0) + value
    }
  }

  return NextResponse.json({
    ok: true,
    modelVersion: 'seo-ranking-model-v1',
    weights: latestWeights,
    families: SIGNAL_FAMILIES,
    ledger,
    calibration,
    summary: {
      audit: {
        events: ledger.length,
        totalReward: auditTotalReward,
        avgReward: ledger.length ? Math.round((auditTotalReward / ledger.length) * 100) / 100 : 0,
        attribution: auditAttribution,
      },
      training: {
        eligibleEvents: trainingLedger.length,
        totalReward: trainingTotalReward,
        avgReward: trainingLedger.length
          ? Math.round((trainingTotalReward / trainingLedger.length) * 100) / 100
          : 0,
        attribution: trainingAttribution,
      },
      // Compatibility aliases are explicitly audit-ledger metrics.
      events: ledger.length,
      totalReward: auditTotalReward,
      avgReward: ledger.length ? Math.round((auditTotalReward / ledger.length) * 100) / 100 : 0,
      attribution: auditAttribution,
      trainingEligibleEvents: trainingLedger.length,
      activeCalibration: activeCalibration ? String(activeCalibration.recalibrated_at || '') : null,
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

    // Manual deltas are useful operator notes, but they are not verified
    // page+query/window observations. Persist them explicitly as non-training
    // evidence and never infer an absent action as "refresh".
    const computed = creditOutcome({
      pageUrl,
      topic: body.topic ? String(body.topic) : undefined,
      action: String(body.action || '').trim() || 'unknown',
      deltaImpressions: typeof body.deltaImpressions === 'number' ? body.deltaImpressions : undefined,
      deltaClicks: typeof body.deltaClicks === 'number' ? body.deltaClicks : undefined,
      deltaPosition: typeof body.deltaPosition === 'number' ? body.deltaPosition : undefined,
      note: body.note ? String(body.note) : 'manual unverified observation',
      observationLabel: 'manual_unverified',
      improvementCredited: false,
    })
    const event: RewardEvent = {
      ...computed,
      reward: 0,
      attribution: {},
      observationLabel: 'manual_unverified',
      improvementCredited: false,
    }
    const wrote = await persistRewardEvent(event)
    if (!wrote.ok) {
      return NextResponse.json({ ok: false, error: wrote.error || 'reward record failed' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      event,
      weights: FAMILY_WEIGHTS,
      recalibrated: false,
      trainingEligible: false,
      note: 'Manual observations are retained for audit only; verified cron GSC improvements are the only training evidence.',
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'reward record failed' },
      { status: 500 },
    )
  }
}
