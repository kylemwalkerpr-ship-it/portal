/**
 * Forecast → reward feedback pass — verdict-driven rewards, deterministic
 * event shape, idempotent dedupe, and bounded recalibration.
 */
import {
  FORECAST_REWARD_ACTION,
  MIN_EVALUATED_FOR_CALIBRATION,
  VERDICT_REWARD,
  buildForecastRewardEvent,
  buildForecastRewardEvents,
  forecastEventKey,
  forecastNote,
  shouldRecalibrate,
} from '@/lib/seoEngine/forecastReward'
import {
  FAMILY_WEIGHTS,
  MAX_FAMILY_DELTA,
  RANKING_MODEL_VERSION,
  SIGNAL_FAMILIES,
  recalibrateWeights,
} from '@/lib/seoEngine/rankingModel'
import type { ForecastEvalRow, TrackerVerdict } from '@/lib/seoEngine/forecastTracker'

const NOW = '2026-08-09T00:00:00.000Z'

function mkRow(
  partial: Partial<ForecastEvalRow> &
    Pick<ForecastEvalRow, 'topic' | 'runDate' | 'horizonDays' | 'overall' | 'deltas'>,
): ForecastEvalRow {
  return {
    subjectKey: '',
    maturityDate: '2026-09-08',
    matured: true,
    daysElapsed: 0,
    daysToMaturity: 0,
    projected: { position: 10, impressions: 1000, clicks: 100, probabilityTop10: 0.5 },
    actual: { position: 12, impressions: 1100, clicks: 90, source: 'snapshot', asOf: '2026-09-08' },
    verdicts: {},
    magnitude: 0.1,
    flags: [],
    ...partial,
  }
}

const OVER = mkRow({
  topic: 'auburn student housing',
  runDate: '2026-07-10',
  horizonDays: 30,
  overall: 'over_predicted',
  deltas: { position: 13, impressions: -400, clicks: -35 },
})
const UNDER = mkRow({
  topic: 'appendix fm documents',
  runDate: '2026-07-10',
  horizonDays: 30,
  overall: 'under_predicted',
  deltas: { position: -9, impressions: 900, clicks: 120 },
})
const ON_TRACK = mkRow({
  topic: 'subclass 189 visa',
  runDate: '2026-07-10',
  horizonDays: 60,
  overall: 'on_track',
  deltas: { position: 1, impressions: 80, clicks: 5 },
})
const MIXED = mkRow({
  topic: 'f1 visa interview',
  runDate: '2026-07-10',
  horizonDays: 90,
  overall: 'mixed',
  deltas: { position: 4, impressions: 600, clicks: 20 },
})

describe('forecast-reward · verdict → reward mapping', () => {
  it('rewards reality-beat-model highest, over-prediction lowest (asymmetric by design)', () => {
    expect(VERDICT_REWARD.under_predicted).toBeGreaterThan(VERDICT_REWARD.on_track)
    expect(VERDICT_REWARD.on_track).toBeGreaterThan(VERDICT_REWARD.mixed)
    expect(VERDICT_REWARD.mixed).toBeGreaterThan(VERDICT_REWARD.over_predicted)
    expect(VERDICT_REWARD.no_data).toBe(0)
  })

  it('keeps over-prediction just above zero so it counts as weak negative evidence', () => {
    // recalibrateWeights filters rewards <= 0; a tiny positive keeps the miss
    // in the calibration set and drags the family average down.
    expect(VERDICT_REWARD.over_predicted).toBeGreaterThan(0)
    expect(VERDICT_REWARD.over_predicted).toBeLessThan(VERDICT_REWARD.mixed)
  })

  it('maps the action to differential families with proportional attribution', () => {
    const under = buildForecastRewardEvent(UNDER, NOW)
    expect(under.action).toBe(FORECAST_REWARD_ACTION)
    expect(under.modelVersion).toBe(RANKING_MODEL_VERSION)
    expect(under.reward).toBe(0.5)
    expect(under.attribution.demand).toBe(0.4) // reward * 0.8
    expect(under.topic).toBe('appendix fm documents')
    // Over-prediction credits behavioral (position/CTR outcomes did not materialize).
    const over = buildForecastRewardEvent(OVER, NOW)
    expect(over.attribution.demand).toBeUndefined()
    expect(over.attribution.behavioral).toBeGreaterThan(0)
    expect(over.attribution.behavioral).toBe(0.02) // round(0.02 * 0.8 * 100)/100
  })
})

describe('forecast-reward · deterministic event shape', () => {
  it('builds identical events for identical inputs', () => {
    const a = buildForecastRewardEvents([OVER, UNDER, ON_TRACK, MIXED], new Set(), NOW)
    const b = buildForecastRewardEvents([OVER, UNDER, ON_TRACK, MIXED], new Set(), NOW)
    expect(a).toEqual(b)
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
  })

  it('carries signed deltas and a forecast: page prefix', () => {
    const over = buildForecastRewardEvent(OVER, NOW)
    const under = buildForecastRewardEvent(UNDER, NOW)
    expect(over.deltaPosition).toBe(13) // actual worse than promised → positive
    expect(under.deltaPosition).toBe(-9) // actual better than promised → negative
    expect(over.pageUrl.startsWith('forecast:')).toBe(true)
    expect(over.note).toBe('forecast accuracy · run 2026-07-10 · 30d')
  })

  it('uses a deterministic note + key identity for idempotent re-runs', () => {
    const note = forecastNote('2026-07-10', 30)
    const key = forecastEventKey('Auburn Student Housing', note)
    // Normalization: case + punctuation collapse onto the same identity.
    expect(forecastEventKey('auburn student housing', note)).toBe(key)
    expect(key).toContain(note)
  })
})

describe('forecast-reward · pass semantics', () => {
  it('credits evaluated rows and skips in-flight / no-data rows', () => {
    const inFlight = mkRow({
      topic: 'opt extension',
      runDate: '2026-08-01',
      horizonDays: 90,
      overall: 'no_data',
      deltas: { position: null, impressions: null, clicks: null },
      matured: false,
      actual: { position: null, impressions: null, clicks: null, source: 'none', asOf: null },
    })
    const noData = mkRow({
      topic: 'uk spouse visa',
      runDate: '2026-07-01',
      horizonDays: 90,
      overall: 'no_data',
      deltas: { position: null, impressions: null, clicks: null },
      actual: { position: null, impressions: null, clicks: null, source: 'none', asOf: null },
    })
    const events = buildForecastRewardEvents([OVER, UNDER, inFlight, noData], new Set(), NOW)
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.topic)).toEqual(['auburn student housing', 'appendix fm documents'])
  })

  it('skips already-credited outcomes — weekly re-runs never double-credit', () => {
    const first = buildForecastRewardEvents([OVER, UNDER, ON_TRACK, MIXED], new Set(), NOW)
    const credited = new Set(first.map((e) => forecastEventKey(String(e.topic || ''), String(e.note || ''))))
    const second = buildForecastRewardEvents([OVER, UNDER, ON_TRACK, MIXED], credited, NOW)
    expect(second).toHaveLength(0)
  })

  it('dedupes within a single run when the same (topic, run_date, horizon) appears under different subject_keys', () => {
    // The seo_forecast_runs unique index is (topic, subject_key, horizon_days,
    // run_date) — the same forecast can surface under two subject keys.
    const dup = mkRow({ ...OVER, topic: 'auburn student housing', subjectKey: 'plan:auburn-housing' })
    const events = buildForecastRewardEvents([OVER, dup], new Set(), NOW)
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe(buildForecastRewardEvent(OVER, NOW).id)
  })

  it('gates recalibration on minimum evaluated evidence', () => {
    expect(shouldRecalibrate(MIN_EVALUATED_FOR_CALIBRATION - 1)).toBe(false)
    expect(shouldRecalibrate(MIN_EVALUATED_FOR_CALIBRATION)).toBe(true)
  })
})

describe('forecast-reward · bounded recalibration loop', () => {
  const repeated = (row: ForecastEvalRow, n: number): ForecastEvalRow[] =>
    Array.from({ length: n }, (_, i) => ({ ...row, topic: `${row.topic} ${i}` }))

  it('cannot move weights from uniform evidence — only differential weeks shift families', () => {
    // One family present → every perf === global avg → zero shift (honest no-op).
    const underOnly = recalibrateWeights(FAMILY_WEIGHTS, buildForecastRewardEvents(repeated(UNDER, 6), new Set(), NOW))
    expect(underOnly).toEqual(FAMILY_WEIGHTS)
    const overOnly = recalibrateWeights(FAMILY_WEIGHTS, buildForecastRewardEvents(repeated(OVER, 6), new Set(), NOW))
    expect(overOnly).toEqual(FAMILY_WEIGHTS)
  })

  it('moves demand up and behavioral down on a mixed week (differential credit)', () => {
    const mixed = buildForecastRewardEvents(
      repeated(UNDER, 6).concat(repeated(OVER, 3)),
      new Set(),
      NOW,
    )
    const next = recalibrateWeights(FAMILY_WEIGHTS, mixed)
    expect(next.demand).toBeGreaterThan(FAMILY_WEIGHTS.demand)
    expect(next.behavioral).toBeLessThan(FAMILY_WEIGHTS.behavioral)
    const baselineGap = FAMILY_WEIGHTS.demand - FAMILY_WEIGHTS.behavioral
    expect(next.demand - next.behavioral).toBeGreaterThan(baselineGap)
  })

  it('stays inside the bounded band and renormalizes to ~1.0', () => {
    const rows = repeated(UNDER, 6).concat(repeated(OVER, 3), repeated(ON_TRACK, 2), repeated(MIXED, 2))
    const events = buildForecastRewardEvents(rows, new Set(), NOW)
    const next = recalibrateWeights(FAMILY_WEIGHTS, events)
    for (const fam of SIGNAL_FAMILIES) {
      expect(next[fam]).toBeGreaterThanOrEqual(FAMILY_WEIGHTS[fam] - MAX_FAMILY_DELTA - 1e-9)
      expect(next[fam]).toBeLessThanOrEqual(FAMILY_WEIGHTS[fam] + MAX_FAMILY_DELTA + 1e-9)
    }
    const sum = SIGNAL_FAMILIES.reduce((s, fam) => s + next[fam], 0)
    expect(Math.abs(sum - 1)).toBeLessThan(0.01)
  })

  it('leaves weights unchanged when there is nothing to learn from', () => {
    const next = recalibrateWeights(FAMILY_WEIGHTS, [])
    expect(next).toEqual(FAMILY_WEIGHTS)
  })
})
