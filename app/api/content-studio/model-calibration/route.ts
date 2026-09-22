/**
 * GET /api/content-studio/model-calibration
 *
 * Returns the ranking model's current calibration status for the Configure tab:
 * - lastCalibratedAt: when the model weights were last recalibrated
 * - modelVersion: current model version
 * - eventsCount: number of reward events in the most recent calibration
 * - accuracy: agree/(agree+disagree) ratio from recent forecast runs (null if no data)
 * - accuracyTrend: improving | stable | declining (null if insufficient history)
 * - recentRuns: count of forecast runs evaluated in the last 30 days
 *
 * Admin-only. Used by the Configure tab's model calibration status card.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { OBSERVED_REWARD_CALIBRATION_PREFIX, isObservedCalibrationRow } from '@/lib/seoEngine/rankingModel'

export async function GET(req: NextRequest) {
  try {
    // Request-aware Clerk resolution (getAuth(NextRequest)): this handler always
    // receives a real NextRequest, so it takes the cheaper verified middleware-
    // signature path instead of App Router auth()'s extra request-data
    // decryptions. Same authorization semantics — never trusts client headers
    // directly.
    const admin = await requireAdminUser(req)
    if ('error' in admin) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status },
      )
    }

    // Reuse the already-resolved admin DB from auth. This avoids even a second
    // singleton lookup on this request while preserving the route's existing
    // authorization and query client.
    const supabase = admin.db

    // ── Current observed-reward calibrations only ──
    // Legacy forecast/manual rows remain in the audit table but must never be
    // presented as the active model calibration.
    const { data: calibration, error: calError } = await supabase
      .from('seo_model_calibration')
      .select('id, model_version, events_count, note, weights, recalibrated_at')
      .like('note', OBSERVED_REWARD_CALIBRATION_PREFIX + '%')
      .order('recalibrated_at', { ascending: false })
      .limit(50)

    if (calError) {
      return NextResponse.json(
        { ok: false, error: calError.message },
        { status: 500 },
      )
    }

    const observedCalibration = ((calibration || []) as Array<Record<string, unknown>>)
      .filter(isObservedCalibrationRow)
    const latest = observedCalibration[0] ?? null
    const previous = observedCalibration[1] ?? null

    // ── Recent forecast run stats (last 30 days) ──
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: recentRuns, error: runsError } = await supabase
      .from('seo_forecast_runs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)

    const runsCount = (!runsError && recentRuns != null) ? recentRuns : 0

    // ── Divergence accuracy from recent reward events ──
    const { data: rewardEvents, error: rewardError } = await supabase
      .from('seo_reward_events')
      .select('direction_match')
      .gte('observed_at', thirtyDaysAgo)

    let accuracy: number | null = null
    let accuracyTrend: 'improving' | 'stable' | 'declining' | null = null

    if (!rewardError && rewardEvents && rewardEvents.length > 0) {
      const agree = rewardEvents.filter((e: any) => e.direction_match === true).length
      const disagree = rewardEvents.filter((e: any) => e.direction_match === false).length
      const total = agree + disagree
      if (total > 0) {
        accuracy = Math.round((agree / total) * 100)
      }
    }

    // ── Accuracy trend: compare current vs previous calibration events ──
    const latestEventsCount = Number(latest?.events_count) || 0
    const previousEventsCount = Number(previous?.events_count) || 0
    if (latest && previous && previousEventsCount > 0 && latestEventsCount > 0) {
      // Heuristic: if the latest calibration had more events and a note
      // indicating improvement, mark as improving. Otherwise stable.
      const latestNote = String(latest.note || '').toLowerCase()
      if (latestNote.includes('improve') || latestNote.includes('lift')) {
        accuracyTrend = 'improving'
      } else if (latestNote.includes('declin') || latestNote.includes('drop')) {
        accuracyTrend = 'declining'
      } else {
        accuracyTrend = 'stable'
      }
    }

    return NextResponse.json({
      ok: true,
      lastCalibratedAt: latest?.recalibrated_at ? String(latest.recalibrated_at) : null,
      modelVersion: latest?.model_version ? String(latest.model_version) : 'unknown',
      eventsCount: latestEventsCount,
      calibrationNote: latest?.note ? String(latest.note) : null,
      previousCalibratedAt: previous?.recalibrated_at ? String(previous.recalibrated_at) : null,
      accuracy,
      accuracyTrend,
      recentRuns: runsCount,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
