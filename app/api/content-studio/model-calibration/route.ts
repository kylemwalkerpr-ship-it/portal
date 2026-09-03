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
import { requireAdminUser } from '@/lib/portalAuth'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    const admin = await requireAdminUser()
    if ('error' in admin) {
      return NextResponse.json(
        { ok: false, error: admin.error },
        { status: admin.status },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // ── Latest calibration record ──
    const { data: calibration, error: calError } = await supabase
      .from('seo_model_calibration')
      .select('id, model_version, events_count, note, recalibrated_at')
      .order('recalibrated_at', { ascending: false })
      .limit(1)

    if (calError) {
      return NextResponse.json(
        { ok: false, error: calError.message },
        { status: 500 },
      )
    }

    const latest = calibration?.[0] ?? null

    // ── Previous calibration (for trend) ──
    const { data: prevCal, error: prevError } = await supabase
      .from('seo_model_calibration')
      .select('id, model_version, events_count, recalibrated_at')
      .order('recalibrated_at', { ascending: false })
      .range(1, 1)

    const previous = (!prevError && prevCal?.length) ? prevCal[0] : null

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
    if (latest && previous && previous.events_count > 0 && latest.events_count > 0) {
      // Heuristic: if the latest calibration had more events and a note
      // indicating improvement, mark as improving. Otherwise stable.
      const latestNote = (latest.note || '').toLowerCase()
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
      lastCalibratedAt: latest?.recalibrated_at ?? null,
      modelVersion: latest?.model_version ?? 'unknown',
      eventsCount: latest?.events_count ?? 0,
      calibrationNote: latest?.note ?? null,
      previousCalibratedAt: previous?.recalibrated_at ?? null,
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
