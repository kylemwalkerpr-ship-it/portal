/**
 * lib/seoEngine/forecastReward.ts
 *
 * FORECAST → REWARD FEEDBACK PASS — the weekly closed loop that feeds
 * forecast-vs-actual GSC deltas back into the ranking model's reward ledger
 * and bounded recalibration.
 *
 * Pipeline: matured 30/60/90-day forecasts (seo_forecast_runs) are evaluated
 * against observed GSC by the execution tracker (forecastTracker.ts). Every
 * evaluated (topic, run_date, horizon) becomes ONE deterministic reward event
 * (action `forecast_accuracy`) in seo_reward_events, and when a week yields
 * enough evaluated forecasts the pass recalibrates family weights (bounded by
 * MAX_FAMILY_DELTA) and records the history in seo_model_calibration.
 *
 * Reward semantics (deterministic, verdict-driven — see VERDICT_REWARD):
 *   under_predicted  — reality beat the model (model was conservative)  0.50
 *   on_track         — projection landed inside the tolerance bands       0.15
 *   mixed            — metrics conflict; modest signal                   0.10
 *   over_predicted   — the model promised more than reality delivered    0.02
 *                      (near-zero ON PURPOSE: it still counts as weak
 *                      negative evidence in recalibrateWeights, so a model
 *                      that systematically over-promises has the affected
 *                      family weight pulled DOWN → future forecasts get more
 *                      conservative. The asymmetry is deliberate.)
 *   no_data          — nothing to compare; never credited                0.00
 *
 * Idempotency: each (topic, run_date, horizon) is credited exactly once —
 * the pass skips keys already present in seo_reward_events for the same
 * action (the deterministic note is the identity), so re-running the weekly
 * cron never double-credits.
 *
 * Differential attribution (so the calibration loop has real signal):
 *   under_predicted  → credited to `demand`  (reality showed MORE visibility
 *                       demand than the model weighted)
 *   over_predicted   → credited to `behavioral` (the model overestimated
 *                       position/CTR outcomes that did not materialize)
 *   on_track / mixed → credited to `demand` (the primary projection family)
 *
 * A pass whose events are all one family cannot move weights (uniform
 * evidence carries no differential information) — the ledger still records
 * every outcome; recalibration only fires when the week contains both.
 */
import {
  RANKING_MODEL_VERSION,
  SIGNAL_FAMILIES,
  FAMILY_WEIGHTS,
  CALIBRATION_LEARNING_RATE,
  recalibrateWeights,
  persistRewardEvent,
  loadCalibrationHistory,
  recordCalibration,
  type SignalFamily,
  type RewardEvent,
} from './rankingModel'
import type { ForecastEvalRow, TrackerVerdict } from './forecastTracker'
import { normalizeTerm } from './forecastTracker'

export const FORECAST_REWARD_ACTION = 'forecast_accuracy'
/** Below this many evaluated forecasts in a pass, calibration is skipped — too little evidence to move weights safely. */
export const MIN_EVALUATED_FOR_CALIBRATION = 5

export const VERDICT_REWARD: Record<TrackerVerdict, number> = {
  under_predicted: 0.5,
  on_track: 0.15,
  mixed: 0.1,
  over_predicted: 0.02,
  no_data: 0,
}

/** Deterministic, parseable note — the dedupe identity lives here. */
export function forecastNote(runDate: string, horizonDays: number): string {
  return `forecast accuracy · run ${String(runDate).slice(0, 10)} · ${horizonDays}d`
}

/** Dedupe key for one forecast outcome (normalized topic + note). */
export function forecastEventKey(topic: string, note: string): string {
  return `${normalizeTerm(topic)}|${String(note || '').trim()}`
}

export function shouldRecalibrate(evaluatedCount: number): boolean {
  return evaluatedCount >= MIN_EVALUATED_FOR_CALIBRATION
}

/**
 * Build one deterministic reward event for an evaluated forecast row.
 * Attribution is verdict-driven and differential: under-prediction credits
 * `demand` (real visibility demand beat the model), over-prediction credits
 * `behavioral` (projected position/CTR outcomes did not materialize).
 * on_track / mixed stay on `demand`, the primary projection family.
 */
export function buildForecastRewardEvent(row: ForecastEvalRow, nowIso: string): RewardEvent {
  const reward = VERDICT_REWARD[row.overall] ?? 0
  const family: SignalFamily = row.overall === 'over_predicted' ? 'behavioral' : 'demand'
  const note = forecastNote(row.runDate, row.horizonDays)
  const key = forecastEventKey(row.topic, note)
  return {
    id: `forecast-reward:${key}`,
    modelVersion: RANKING_MODEL_VERSION,
    pageUrl: `forecast:${normalizeTerm(row.topic).slice(0, 200) || 'unknown'}`,
    topic: String(row.topic),
    action: FORECAST_REWARD_ACTION,
    deltaImpressions: row.deltas.impressions ?? undefined,
    deltaClicks: row.deltas.clicks ?? undefined,
    deltaPosition: row.deltas.position ?? undefined,
    reward,
    attribution: { [family]: Math.round(reward * 0.8 * 100) / 100 },
    note,
    observedAt: nowIso,
  }
}

/**
 * Pure pass: evaluated forecast rows → creditable reward events. Only matured
 * rows with real observed data count; in-flight / no-data rows are never
 * credited; already-credited keys are skipped (idempotent weekly re-runs).
 */
export function buildForecastRewardEvents(
  rows: ForecastEvalRow[],
  alreadyCredited: Set<string> = new Set(),
  nowIso = new Date().toISOString(),
): RewardEvent[] {
  const events: RewardEvent[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.matured || row.actual.source === 'none') continue
    const key = forecastEventKey(row.topic, forecastNote(row.runDate, row.horizonDays))
    // Skip both previously-credited outcomes AND intra-batch duplicates: the
    // same (topic, run_date, horizon) can surface under different subject_keys.
    if (alreadyCredited.has(key) || seen.has(key)) continue
    seen.add(key)
    events.push(buildForecastRewardEvent(row, nowIso))
  }
  return events
}

export interface ForecastRewardPassResult {
  evaluated: number
  events: number
  recalibrated: boolean
  weightsChanged: boolean
  weights: Partial<Record<SignalFamily, number>> | null
  positionBias: number
  onTrackRate: number
  /** Set when the pass itself failed — the caller can record `failed` instead of masking it as "nothing matured". */
  failed?: string
  note: string
}

/**
 * DB-backed weekly pass. Loads the tracker (forecasts + GSC snapshots + live
 * fallback), credits each evaluated outcome once, then — with enough evidence —
 * bounded-recalibrates family weights and records the audit row. Best-effort:
 * any failure returns an empty result so the cron reports `partial` instead of
 * crashing the pipeline.
 */
export async function runForecastRewardPass(opts: { limit?: number; now?: string } = {}): Promise<ForecastRewardPassResult> {
  try {
    const { loadForecastTracker } = await import('./forecastTracker')
    const report = await loadForecastTracker({ limit: opts.limit || 400, now: opts.now })
    const evaluated = report.rows.filter((r) => r.matured && r.actual.source !== 'none')

    // Already-credited keys for this action — re-runs must not double-credit.
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const client = createSupabaseAdminClient()
    const { data: existing } = await client
      .from('seo_reward_events')
      .select('topic,note')
      .eq('action', FORECAST_REWARD_ACTION)
      .limit(1000)
    const alreadyCredited = new Set(
      ((existing as Array<{ topic?: string | null; note?: string | null }> | null) || [])
        .map((r) => forecastEventKey(String(r.topic || ''), String(r.note || ''))),
    )

    const nowIso = opts.now ? new Date(`${opts.now}T00:00:00.000Z`).toISOString() : new Date().toISOString()
    const events = buildForecastRewardEvents(evaluated, alreadyCredited, nowIso)
    let inserted = 0
    for (const e of events) {
      await persistRewardEvent(e)
      inserted += 1
    }

    // Bounded recalibration — only when the week carries enough NEW evidence.
    let recalibrated = false
    let weightsChanged = false
    let weights: Partial<Record<SignalFamily, number>> | null = null
    if (shouldRecalibrate(events.length)) {
      const history = await loadCalibrationHistory(1)
      const last = (history[0] as { weights?: unknown } | undefined)?.weights
      const parsed = (last && typeof last === 'object' ? last : {}) as Partial<Record<SignalFamily, number>>
      const current = { ...FAMILY_WEIGHTS, ...parsed }
      const next = recalibrateWeights(current, events, CALIBRATION_LEARNING_RATE)
      weightsChanged = SIGNAL_FAMILIES.some((f) => Math.abs(Number(next[f]) - Number(current[f])) > 1e-9)
      if (weightsChanged) {
        await recordCalibration(
          next,
          events.length,
          `weekly forecast-reward pass · ${evaluated.length} evaluated · positionBias ${report.summary.positionBias} · action ${FORECAST_REWARD_ACTION}`,
        )
        weights = next
        recalibrated = true
      }
    }

    return {
      evaluated: evaluated.length,
      events: inserted,
      recalibrated,
      weightsChanged,
      weights,
      positionBias: report.summary.positionBias,
      onTrackRate: report.summary.onTrackRate,
      note: `forecast-reward pass · ${inserted} credited · ${evaluated.length} evaluated · recalibrated=${recalibrated}`,
    }
  } catch (err) {
    return {
      evaluated: 0,
      events: 0,
      recalibrated: false,
      weightsChanged: false,
      weights: null,
      positionBias: 0,
      onTrackRate: 0,
      failed: err instanceof Error ? err.message : 'forecast-reward pass failed',
      note: 'forecast-reward pass failed (best-effort)',
    }
  }
}
