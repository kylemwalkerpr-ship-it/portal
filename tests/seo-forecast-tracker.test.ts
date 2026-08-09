/**
 * Execution tracker — forecast vs actual verdict logic + assembly.
 */
import {
  assembleForecastTracker,
  daysBetween,
  evaluateForecast,
  findSnapshotForDate,
  maturityDate,
  matchRow,
  normalizeTerm,
  type ForecastRunRow,
  type SnapshotIndex,
} from '@/lib/seoEngine/forecastTracker'

describe('forecast tracker · verdict logic', () => {
  it('flags over-prediction when actual rank is much worse than projected', () => {
    const { overall, verdicts, magnitude } = evaluateForecast(
      { position: 5, impressions: 2000, clicks: 120, probabilityTop10: 0.8 },
      { position: 18, impressions: 900, clicks: 40 },
    )
    expect(overall).toBe('over_predicted')
    expect(verdicts.position).toBe('over_predicted')
    expect(verdicts.impressions).toBe('over_predicted')
    expect(magnitude).toBeGreaterThan(0.5)
  })

  it('flags under-prediction when reality beat the model', () => {
    const { overall, verdicts } = evaluateForecast(
      { position: 20, impressions: 600, clicks: 20, probabilityTop10: 0.2 },
      { position: 6, impressions: 2600, clicks: 180 },
    )
    expect(overall).toBe('under_predicted')
    expect(verdicts.position).toBe('under_predicted')
  })

  it('stays on-track inside the tolerance bands', () => {
    const { overall, verdicts } = evaluateForecast(
      { position: 8, impressions: 1000, clicks: 50, probabilityTop10: 0.6 },
      { position: 9, impressions: 1100, clicks: 55 },
    )
    expect(overall).toBe('on_track')
    expect(verdicts.position).toBe('on_track')
    expect(verdicts.impressions).toBe('on_track')
  })

  it('is mixed when metrics genuinely conflict', () => {
    const { overall, verdicts } = evaluateForecast(
      { position: 10, impressions: 1500, clicks: 60, probabilityTop10: 0.5 },
      { position: 12, impressions: 300, clicks: 12 },
    )
    // Position within tolerance (on-track), impressions badly over-predicted.
    expect(verdicts.position).toBe('on_track')
    expect(verdicts.impressions).toBe('over_predicted')
    expect(overall).toBe('over_predicted')
  })

  it('handles partial actuals (position only)', () => {
    const { overall, verdicts, magnitude } = evaluateForecast(
      { position: 4, impressions: 1000, clicks: 50, probabilityTop10: 0.9 },
      { position: 9, impressions: null, clicks: null },
    )
    expect(overall).toBe('over_predicted')
    expect(verdicts.impressions).toBeUndefined()
    expect(magnitude).toBeGreaterThan(0)
  })

  it('returns on-track when nothing is evaluated (no actuals)', () => {
    const { overall } = evaluateForecast(
      { position: 5, impressions: 1000, clicks: 50, probabilityTop10: 0.8 },
      { position: null, impressions: null, clicks: null },
    )
    expect(overall).toBe('on_track')
  })
})

describe('forecast tracker · dates + matching', () => {
  it('computes maturity dates and elapsed days', () => {
    expect(maturityDate('2026-06-01', 30)).toBe('2026-07-01')
    expect(maturityDate('2026-06-01', 90)).toBe('2026-08-30')
    expect(daysBetween('2026-06-01', '2026-07-01')).toBe(30)
  })

  it('finds the snapshot nearest the maturity date within the window', () => {
    const index: SnapshotIndex = {
      '2026-06-28': [{ term: 'opt stem extension', impressions: 100, clicks: 5, position: 20 }],
      '2026-07-01': [{ term: 'opt stem extension', impressions: 120, clicks: 6, position: 19 }],
      '2026-07-20': [{ term: 'opt stem extension', impressions: 900, clicks: 60, position: 9 }],
    }
    const hit = findSnapshotForDate(index, '2026-07-01')
    expect(hit?.dateKey).toBe('2026-07-01')
    // Far-out snapshot (20 days) is outside the default ±4 window.
    expect(findSnapshotForDate(index, '2026-07-15')?.dateKey).toBeUndefined()
  })

  it('matches rows by normalized term exact, safe subset, then live fallback', () => {
    const rows = [
      { term: 'opt stem extension', impressions: 100, clicks: 5, position: 20 },
      { term: 'h1b cap gap 2026', impressions: 50, clicks: 2, position: 30 },
    ]
    expect(matchRow(rows, 'OPT STEM Extension').term).toBe('opt stem extension')
    // Topic is a subset of the row's query (same intent, more specific) → match.
    expect(matchRow(rows, 'h1b cap gap').term).toBe('h1b cap gap 2026')
    // Reverse direction (topic broader than the row) is REFUSED — it would
    // attribute a narrower query's metrics to a broader topic.
    expect(matchRow(rows, 'h1b cap gap 2026 documents required')).toBeNull()
    const live = [{ term: 'express entry crs', impressions: 400, clicks: 20, position: 12 }]
    expect(matchRow([], 'express entry crs', live).term).toBe('express entry crs')
    expect(matchRow(rows, 'nothing related')).toBeNull()
  })
})

describe('forecast tracker · assembly + summary', () => {
  const forecasts: ForecastRunRow[] = [
    // Matured 30d run, snapshot matches → verdict from deltas
    { topic: 'opt stem extension', subject_key: 'c1', horizon_days: 30, projected_position: 8, projected_impressions: 1200, projected_clicks: 60, probability_top10: 0.7, run_date: '2026-06-01' },
    // Matured 30d run, over-predicted hard
    { topic: 'h1b cap gap', subject_key: 'c2', horizon_days: 30, projected_position: 4, projected_impressions: 3000, projected_clicks: 200, probability_top10: 0.9, run_date: '2026-06-01' },
    // Matured 60d run, under-predicted
    { topic: 'pgwp eligibility', subject_key: 'c3', horizon_days: 60, projected_position: 25, projected_impressions: 400, projected_clicks: 10, probability_top10: 0.1, run_date: '2026-05-01' },
    // Matured 90d run with no snapshot near maturity → no_data (live fallback would apply but none)
    { topic: 'uk graduate route', subject_key: 'c4', horizon_days: 90, projected_position: 12, projected_impressions: 800, projected_clicks: 30, probability_top10: 0.5, run_date: '2026-04-01' },
    // In-flight (run 10 days ago, 30d horizon)
    { topic: 'f1 visa interview lagos', subject_key: 'c5', horizon_days: 30, projected_position: 10, projected_impressions: 500, projected_clicks: 20, probability_top10: 0.6, run_date: '2026-07-20' },
  ]

  const snapshots: SnapshotIndex = {
    '2026-07-01': [
      { term: 'opt stem extension', impressions: 1250, clicks: 58, position: 9 },
      { term: 'h1b cap gap', impressions: 1100, clicks: 45, position: 16 },
    ],
    '2026-06-30': [{ term: 'opt stem extension', impressions: 1240, clicks: 55, position: 9 }],
    '2026-07-01T00:00': [],
  }
  delete snapshots['2026-07-01T00:00']

  it('evaluates matured runs with data and skips in-flight as no verdict', () => {
    const report = assembleForecastTracker(forecasts, snapshots, [], '2026-07-01')
    const maturedWithData = report.rows.filter((r) => r.matured && r.actual.source !== 'none')
    const inFlight = report.rows.filter((r) => !r.matured)
    // opt + h1b (30d, snapshot match) evaluated; pgwp/uk have no snapshot → no_data
    expect(maturedWithData).toHaveLength(2)
    expect(inFlight).toHaveLength(1)
    const pgwp = report.rows.find((r) => r.topic === 'pgwp eligibility')!
    expect(pgwp.overall).toBe('no_data')
    expect(pgwp.actual.source).toBe('none')
    const uk = report.rows.find((r) => r.topic === 'uk graduate route')!
    expect(uk.overall).toBe('no_data')
  })

  it('flags over vs under per topic with honest deltas', () => {
    const report = assembleForecastTracker(forecasts, snapshots, [], '2026-07-01')
    const opt = report.rows.find((r) => r.topic === 'opt stem extension')!
    // projected #8 → actual #9 → on-track (within ±2.5)
    expect(opt.overall).toBe('on_track')
    expect(opt.deltas.position).toBe(1)
    const h1b = report.rows.find((r) => r.topic === 'h1b cap gap')!
    // projected #4 → actual #16 → strongly over-predicted
    expect(h1b.overall).toBe('over_predicted')
    expect(h1b.deltas.position).toBe(12)
    expect(h1b.magnitude).toBeGreaterThan(0.5)
  })

  it('builds a summary with per-horizon rates and worst misses', () => {
    const report = assembleForecastTracker(forecasts, snapshots, [], '2026-07-01')
    const s = report.summary
    expect(s.evaluated).toBe(2) // opt + h1b have snapshot actuals
    expect(s.inFlight).toBe(1)
    expect(s.noData).toBe(2) // pgwp + uk graduate route
    expect(s.perHorizon['30'].evaluated).toBe(2)
    expect(s.perHorizon['60'].evaluated).toBe(0)
    expect(s.worstMisses.length).toBeGreaterThanOrEqual(1)
    expect(s.worstMisses[0].topic).toBe('h1b cap gap')
    expect(s.positionBias).toBeGreaterThan(0) // h1b's +12 pulls bias positive
  })

  it('is deterministic for identical inputs', () => {
    const a = assembleForecastTracker(forecasts, snapshots, [], '2026-07-01')
    const b = assembleForecastTracker(forecasts, snapshots, [], '2026-07-01')
    expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows))
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary))
  })

  it('uses live signals as a clearly-flagged fallback', () => {
    const live = [
      { term: 'pgwp eligibility', impressions: 900, clicks: 60, position: 7 },
      { term: 'uk graduate route', impressions: 1500, clicks: 90, position: 5 },
    ]
    const report = assembleForecastTracker(forecasts, snapshots, live, '2026-07-01')
    const pgwp = report.rows.find((r) => r.topic === 'pgwp eligibility')!
    expect(pgwp.actual.source).toBe('live')
    expect(pgwp.actual.position).toBe(7)
    expect(pgwp.overall).toBe('under_predicted') // projected #25 → actual #7
    expect(pgwp.flags.join(' ')).toMatch(/approximate_window/)
    const uk = report.rows.find((r) => r.topic === 'uk graduate route')!
    expect(uk.actual.source).toBe('live')
    expect(uk.overall).toBe('under_predicted')
  })
})

describe('forecast tracker · edge robustness', () => {
  it('normalizes accents, case, and punctuation', () => {
    expect(normalizeTerm('F-1 visa, 2026 — OPT!')).toBe('f-1 visa 2026 opt')
  })

  it('handles empty inputs without throwing', () => {
    const report = assembleForecastTracker([], {}, [], '2026-07-01')
    expect(report.rows).toEqual([])
    expect(report.summary.evaluated).toBe(0)
    expect(report.summary.byVerdict.on_track).toBe(0)
    expect(report.summary.worstMisses).toEqual([])
  })

  it('ignores malformed horizon values', () => {
    const report = assembleForecastTracker(
      [{ topic: 'bad', horizon_days: 45, projected_position: 5, projected_impressions: 100, projected_clicks: 5, run_date: '2026-06-01' } as unknown as ForecastRunRow],
      {},
      [],
      '2026-07-01',
    )
    expect(report.rows).toEqual([])
  })
})
