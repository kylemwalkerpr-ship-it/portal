/**
 * lib/seoEngine/forecastReward.ts
 *
 * FORECAST ACCURACY DIAGNOSTICS.
 *
 * Matured 30/60/90-day forecasts are still evaluated against observed GSC by
 * the execution tracker, but generic forecast drift is not intervention
 * evidence. The production weekly pass therefore writes zero forecast reward
 * rows. Model calibration, when available, is sourced separately and only from
 * verified page+query completed-window GSC improvement events.
 *
 * The deterministic builders below remain for historical compatibility and
 * offline diagnostics; runForecastRewardPass never persists their output.
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
 * Funnel actions (Phase 2b — taxonomy in rankingModel.ts): when an event
 * carries a funnel action (`funnel_new` / `funnel_revenue` / `funnel_climb` /
 * `authority_anchor` / `kill_or_merge`), attribution ALWAYS maps to `demand` —
 * those bets are priced in expected USD/month (expectedMonthlyRevenue), so any
 * observed movement on them is demand signal first, regardless of verdict.
 * Non-funnel events keep the verdict-driven default above.
 *
 * Historical pure helpers below retain the old deterministic forecast-event
 * mapping for tests/offline inspection. Production does not persist them and
 * never uses them as calibration evidence.
 */
import {
  RANKING_MODEL_VERSION,
  recalibrateFromObservedRewards,
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
} // Funnel actions (see buildForecastRewardEvent) always attribute to `demand` —
  // they are USD-priced bets (expectedMonthlyRevenue), so any movement on them
  // is demand signal first, regardless of verdict. Constants above are frozen.

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
 * Attribution family for a funnel action. Phase 2b: ANY event whose action
 * starts with `funnel_` (funnel_new / funnel_revenue / funnel_climb / ...)
 * maps to `demand` — those bets are priced in expected USD/month, so observed
 * movement on them is demand signal first. Everything else → null (caller
 * keeps the verdict-driven default).
 */
export function funnelAttributionFamily(action: string): SignalFamily | null {
  if (String(action || '').startsWith('funnel_')) return 'demand'
  return null
}

/**
 * Build one deterministic reward event for an evaluated forecast row.
 * Attribution is verdict-driven and differential: under-prediction credits
 * `demand` (real visibility demand beat the model), over-prediction credits
 * `behavioral` (projected position/CTR outcomes did not materialize).
 * on_track / mixed stay on `demand`, the primary projection family.
 *
 * `actionOverride` lets the caller tag the event with the responsible funnel
 * action (e.g. a mission the ranked plan ran); funnel actions always map to
 * `demand` (funnelAttributionFamily), overriding the verdict routing.
 */
export function buildForecastRewardEvent(row: ForecastEvalRow, nowIso: string, actionOverride?: string): RewardEvent {
  const reward = VERDICT_REWARD[row.overall] ?? 0
  const funnelFamily = funnelAttributionFamily(actionOverride || '')
  const family: SignalFamily = funnelFamily ?? (row.overall === 'over_predicted' ? 'behavioral' : 'demand')
  const note = forecastNote(row.runDate, row.horizonDays)
  const key = forecastEventKey(row.topic, note)
  return {
    id: `forecast-reward:${key}`,
    modelVersion: RANKING_MODEL_VERSION,
    pageUrl: `forecast:${normalizeTerm(row.topic).slice(0, 200) || 'unknown'}`,
    topic: String(row.topic),
    action: actionOverride || FORECAST_REWARD_ACTION,
    deltaImpressions: row.deltas.impressions ?? undefined,
    deltaClicks: row.deltas.clicks ?? undefined,
    deltaPosition: row.deltas.position ?? undefined,
    reward,
    attribution: { [family]: Math.round(reward * 0.8 * 100) / 100 },
    note,
    // DB-level idempotency backstop: without subject_key in the note the old
    // 1000-row in-memory dedupe window could re-credit stale keys once the
    // ledger grows. The key now includes the tracked subject's identity so
    // distinct topics can never collide and re-runs always collide.
    dedupeKey: `forecast:${key}${row.subjectKey ? `:${row.subjectKey}` : ''}`,
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
  eligibleObservedRewards?: number
  positionBias: number
  onTrackRate: number
  /** Set when diagnostics or verified-observation calibration failed. */
  failed?: string
  note: string
}

/**
 * DB-backed weekly diagnostic pass. Forecast rows are evaluated but never
 * persisted as rewards. Any calibration comes only from the separate strict
 * observed-reward ledger boundary. Failures are surfaced to the cron caller.
 */
export async function runForecastRewardPass(opts: { limit?: number; now?: string } = {}): Promise<ForecastRewardPassResult> {
  try {
    const { loadForecastTracker } = await import('./forecastTracker')
    const report = await loadForecastTracker({ limit: opts.limit || 400, now: opts.now })
    const evaluated = report.rows.filter((r) => r.matured && r.actual.source !== 'none')
    const calibration = await recalibrateFromObservedRewards()

    // P1 measurement integrity: forecast-vs-actual is diagnostic evidence only.
    // A generic topic forecast never creates reward rows and never enters the
    // calibration input set. The weekly job may calibrate only from separately
    // persisted, intervention-bound cron GSC improvements.
    return {
      evaluated: evaluated.length,
      events: 0,
      recalibrated: calibration.recalibrated,
      weightsChanged: calibration.weightsChanged,
      weights: calibration.weights,
      eligibleObservedRewards: calibration.eligible,
      positionBias: report.summary.positionBias,
      onTrackRate: report.summary.onTrackRate,
      ...(calibration.error ? { failed: calibration.error } : {}),
      note:
        'forecast diagnostic pass · ' + evaluated.length +
        ' evaluated · forecast reward writes=0 · eligible observed improvements=' +
        calibration.eligible,
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
      failed: err instanceof Error ? err.message : 'forecast diagnostic pass failed',
      note: 'forecast diagnostic pass failed (best-effort)',
    }
  }
}
