/**
 * lib/seoEngine/forecastTracker.ts
 *
 * EXECUTION TRACKER — measures the 30/60/90-day forecast against what GSC
 * actually delivered, per topic, and flags where the model over-predicted or
 * under-predicted.
 *
 * Honest-by-design (same philosophy as rankingModel.ts):
 *   - Verdicts are computed deterministically from two observables: the
 *     persisted projection (seo_forecast_runs) and the actual GSC metrics at
 *     (or near) the maturity date (gsc_snapshots, with live signals as a
 *     clearly-labeled fallback).
 *   - Only MATURED forecasts (run_date + horizon <= today) get a verdict;
 *     in-flight forecasts are shown as progress, never as a result.
 *   - Snapshot actuals are preferred; live 90-day-window signals are a fallback
 *     and are flagged `approximate_window` so nobody mistakes a rolling window
 *     for a point-in-time measurement.
 *
 * Terminology:
 *   over_predicted  — the model promised better than reality (e.g. projected
 *                     #5, actual #18). Optimistic.
 *   under_predicted — reality beat the model (e.g. projected #15, actual #6).
 *                     Conservative.
 *   on_track        — actual inside the tolerance band.
 *   mixed           — metrics disagree (position on track but impressions off).
 *   no_data         — nothing to compare against.
 */

export type TrackerVerdict = 'over_predicted' | 'under_predicted' | 'on_track' | 'mixed' | 'no_data'
export type ActualSource = 'snapshot' | 'live' | 'none'

export interface ProjectedMetrics {
  position: number
  impressions: number
  clicks: number
  probabilityTop10: number
}

export interface ActualMetrics {
  position: number | null
  impressions: number | null
  clicks: number | null
  source: ActualSource
  /** Snapshot date_key (YYYY-MM-DD) or null when live/none. */
  asOf: string | null
}

export interface ForecastEvalRow {
  topic: string
  subjectKey: string
  horizonDays: 30 | 60 | 90
  runDate: string
  maturityDate: string
  matured: boolean
  daysElapsed: number
  daysToMaturity: number
  projected: ProjectedMetrics
  actual: ActualMetrics
  deltas: { position: number | null; impressions: number | null; clicks: number | null }
  verdicts: { position?: TrackerVerdict; impressions?: TrackerVerdict; clicks?: TrackerVerdict }
  overall: TrackerVerdict
  /** 0..1 normalized error magnitude across evaluated metrics. */
  magnitude: number
  flags: string[]
}

export interface TrackerSummary {
  evaluated: number
  inFlight: number
  noData: number
  byVerdict: Record<TrackerVerdict, number>
  onTrackRate: number
  /** Mean |position delta| over evaluated rows (positions of error). */
  avgPositionError: number
  /** Mean |impressions delta| / projected (0..1, pct error). */
  avgImpressionError: number
  /** Mean position delta: positive = model systematically optimistic. */
  positionBias: number
  perHorizon: Record<'30' | '60' | '90', {
    evaluated: number
    byVerdict: Record<TrackerVerdict, number>
    onTrackRate: number
    avgPositionError: number
  }>
  /** Biggest over-predictions (model most optimistic), by magnitude desc. */
  worstMisses: Array<Pick<ForecastEvalRow, 'topic' | 'horizonDays' | 'runDate' | 'projected' | 'actual' | 'deltas' | 'magnitude'>>
  /** Biggest under-predictions (reality beat the model), by magnitude desc. */
  bestSurprises: Array<Pick<ForecastEvalRow, 'topic' | 'horizonDays' | 'runDate' | 'projected' | 'actual' | 'deltas' | 'magnitude'>>
}

export interface TrackerReport {
  rows: ForecastEvalRow[]
  summary: TrackerSummary
}

// ── Tolerance bands ──────────────────────────────────────────────────────────
/** Position tolerance: actual may be ±2.5 ranks from projected and still be on-track. */
export const POSITION_TOLERANCE = 2.5
/** Impression/click tolerance: ±25% of projected. */
export const METRIC_PCT_TOLERANCE = 0.25
/** Snapshots older/newer than this many days from the maturity date still count. */
export const SNAPSHOT_MATCH_WINDOW_DAYS = 4

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}

export function normalizeTerm(term: string): string {
  return String(term || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function maturityDate(runDate: string, horizonDays: number): string {
  const d = new Date(`${runDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + horizonDays)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime()
  const db = new Date(`${b}T00:00:00Z`).getTime()
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0
  return Math.round((db - da) / 86_400_000)
}

// ── Pure verdict logic ───────────────────────────────────────────────────────
function verdictForPosition(projected: number, actual: number): TrackerVerdict {
  const delta = actual - projected // positive = actual worse than promised
  if (Math.abs(delta) <= POSITION_TOLERANCE) return 'on_track'
  return delta > 0 ? 'over_predicted' : 'under_predicted'
}

function verdictForMetric(projected: number, actual: number): TrackerVerdict {
  const delta = actual - projected // positive = actual better than promised
  const tol = Math.max(100, Math.abs(projected) * METRIC_PCT_TOLERANCE)
  if (Math.abs(delta) <= tol) return 'on_track'
  return delta < 0 ? 'over_predicted' : 'under_predicted'
}

/**
 * Pure evaluation of one projection against observed metrics. `projected` is
 * always present (it came from a persisted forecast); `actual` may be partial.
 */
export function evaluateForecast(
  projected: ProjectedMetrics,
  actual: Omit<ActualMetrics, 'source' | 'asOf'>,
): { verdicts: ForecastEvalRow['verdicts']; overall: TrackerVerdict; magnitude: number } {
  const verdicts: ForecastEvalRow['verdicts'] = {}
  let magnitude = 0

  if (actual.position != null && Number.isFinite(actual.position)) {
    verdicts.position = verdictForPosition(projected.position, actual.position)
    magnitude = Math.max(magnitude, clamp01(Math.abs(actual.position - projected.position) / 15))
  }
  if (actual.impressions != null && Number.isFinite(actual.impressions)) {
    verdicts.impressions = verdictForMetric(projected.impressions, actual.impressions)
    const impErr = projected.impressions > 0 ? Math.abs(actual.impressions - projected.impressions) / projected.impressions : 0
    magnitude = Math.max(magnitude, clamp01(impErr / 2)) // 200%+ miss → magnitude 1
  }
  if (actual.clicks != null && Number.isFinite(actual.clicks)) {
    verdicts.clicks = verdictForMetric(projected.clicks, actual.clicks)
    const clickErr = projected.clicks > 0 ? Math.abs(actual.clicks - projected.clicks) / projected.clicks : 0
    magnitude = Math.max(magnitude, clamp01(clickErr / 2))
  }

  const votes = [verdicts.position, verdicts.impressions, verdicts.clicks].filter(
    (v): v is TrackerVerdict => v != null && v !== 'on_track',
  )
  let overall: TrackerVerdict
  if (!votes.length) overall = 'on_track'
  else if (votes.length === 1) overall = votes[0]
  else {
    const hasOver = votes.includes('over_predicted')
    const hasUnder = votes.includes('under_predicted')
    overall = hasOver && hasUnder ? 'mixed' : hasOver ? 'over_predicted' : 'under_predicted'
  }
  // If only one metric was evaluated, that metric IS the overall verdict;
  // 'mixed' only makes sense with genuinely conflicting evidence. When two
  // non-on-track votes conflict and position is among them it wins (headline
  // metric); otherwise the tie-break is impressions-before-clicks (votes[0]
  // order). Deterministic and documented so the behavior is auditable.
  if (overall === 'mixed' && votes.length === 2) {
    overall = verdicts.position != null && verdicts.position !== 'on_track' ? verdicts.position : votes[0]
  }

  return { verdicts, overall, magnitude: Math.round(magnitude * 1000) / 1000 }
}

// ── Assembly ─────────────────────────────────────────────────────────────────
export interface ForecastRunRow {
  topic: string
  subject_key?: string | null
  horizon_days: number
  projected_position: number
  projected_impressions: number
  projected_clicks: number
  probability_top10?: number | null
  run_date: string
}

export interface SnapshotRow {
  /** per query: term, impressions, clicks, position */
  term: string
  impressions: number
  clicks: number
  position: number
}

export interface SnapshotIndex {
  /** date_key (YYYY-MM-DD) → rows */
  [dateKey: string]: SnapshotRow[]
}

export interface LiveSignal {
  term: string
  impressions: number
  clicks: number
  position: number
}

/** Find the snapshot nearest to a target date within the match window. */
export function findSnapshotForDate(
  index: SnapshotIndex,
  targetDate: string,
  windowDays = SNAPSHOT_MATCH_WINDOW_DAYS,
): { dateKey: string; rows: SnapshotRow[] } | null {
  let best: { dateKey: string; dist: number; rows: SnapshotRow[] } | null = null
  for (const [dateKey, rows] of Object.entries(index)) {
    const dist = Math.abs(daysBetween(targetDate, dateKey))
    if (dist <= windowDays && (!best || dist < best.dist)) best = { dateKey, dist, rows }
  }
  return best ? { dateKey: best.dateKey, rows: best.rows } : null
}

/**
 * Match a row by normalized term, then a SAFE subset direction, then live
 * fallback. Never attributes a broader query's metrics to a narrower topic:
 * only nt.startsWith(t) matches (the row's query is a more specific form of the
 * topic); the reverse direction is refused because it would compare against a
 * different, broader intent. Exact matches are unambiguously the same query;
 * subset matches must be flagged as approximate by the caller.
 */
export function matchRow(rows: SnapshotRow[], topic: string, live?: LiveSignal[]): SnapshotRow | null {
  const t = normalizeTerm(topic)
  if (!t) return null
  const exact = rows.find((r) => normalizeTerm(r.term) === t)
  if (exact) return exact
  const subset = rows.find((r) => {
    const nt = normalizeTerm(r.term)
    // t.length >= 5: a 4-char topic like "visa" is too generic to trust a
    // subset-direction prefix ("visa" → "visa requirements" is a different
    // intent); the flag below marks every non-exact match as approximate.
    return nt.length >= 6 && t.length >= 5 && nt.startsWith(t)
  })
  if (subset) return subset
  if (live?.length) {
    const liveExact = live.find((l) => normalizeTerm(l.term) === t)
    if (liveExact) return { term: liveExact.term, impressions: liveExact.impressions, clicks: liveExact.clicks, position: liveExact.position }
    const liveSubset = live.find((l) => {
      const nt = normalizeTerm(l.term)
      return nt.length >= 6 && t.length >= 5 && nt.startsWith(t)
    })
    if (liveSubset) return { term: liveSubset.term, impressions: liveSubset.impressions, clicks: liveSubset.clicks, position: liveSubset.position }
  }
  return null
}

function verdictCounts(rows: ForecastEvalRow[]): Record<TrackerVerdict, number> {
  const out: Record<TrackerVerdict, number> = { over_predicted: 0, under_predicted: 0, on_track: 0, mixed: 0, no_data: 0 }
  for (const r of rows) out[r.overall] += 1
  return out
}

function horizonKey(h: number): '30' | '60' | '90' {
  return (h === 30 ? '30' : h === 60 ? '60' : '90') as '30' | '60' | '90'
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
}

/**
 * Assemble the full tracker from forecast runs, historical snapshots, and
 * (fallback) live signals. `now` is YYYY-MM-DD (defaults to UTC today).
 */
export function assembleForecastTracker(
  forecasts: ForecastRunRow[],
  snapshotIndex: SnapshotIndex,
  live: LiveSignal[] = [],
  now = new Date().toISOString().slice(0, 10),
): TrackerReport {
  const rows: ForecastEvalRow[] = []
  for (const f of forecasts) {
    const horizonDays = Number(f.horizon_days)
    if (horizonDays !== 30 && horizonDays !== 60 && horizonDays !== 90) continue
    const runDate = String(f.run_date || '').slice(0, 10)
    if (!runDate) continue
    const matDate = maturityDate(runDate, horizonDays)
    const daysElapsed = daysBetween(runDate, now)
    const matured = daysElapsed >= horizonDays
    const projected: ProjectedMetrics = {
      position: Math.max(1, Number(f.projected_position) || 100),
      impressions: Math.max(0, Number(f.projected_impressions) || 0),
      clicks: Math.max(0, Number(f.projected_clicks) || 0),
      probabilityTop10: Math.round(clamp01(Number(f.probability_top10) || 0) * 100) / 100,
    }

    const flags: string[] = []
    let actual: ActualMetrics = { position: null, impressions: null, clicks: null, source: 'none', asOf: null }

    if (matured) {
      const snap = findSnapshotForDate(snapshotIndex, matDate)
      if (snap) {
        // Match ONLY against the snapshot's own rows — an absent topic must
        // fall through to the clearly-labeled live branch, never be mislabeled
        // as a point-in-time snapshot with an asOf date it did not come from.
        const hit = matchRow(snap.rows, f.topic)
        if (hit) {
          actual = {
            position: hit.position ?? null,
            impressions: hit.impressions ?? null,
            clicks: hit.clicks ?? null,
            source: 'snapshot',
            asOf: snap.dateKey,
          }
          if (normalizeTerm(hit.term) !== normalizeTerm(f.topic)) {
            flags.push(`prefix match — snapshot query “${hit.term.slice(0, 30)}” is a more specific form; treat as approximate`)
          }
          if (daysBetween(snap.dateKey, matDate) !== 0) {
            flags.push(`snapshot ±${Math.abs(daysBetween(snap.dateKey, matDate))}d from maturity`)
          }
        }
      }
      if (actual.source === 'none') {
        // Live 90-day-window signals are a clearly-labeled fallback.
        const hit = matchRow([], f.topic, live)
        if (hit) {
          actual = { position: hit.position ?? null, impressions: hit.impressions ?? null, clicks: hit.clicks ?? null, source: 'live', asOf: now }
          flags.push('approximate_window — no snapshot near maturity; live 90d window used')
        }
      }
      if (actual.source === 'none') {
        flags.push('no GSC data near maturity — cannot verify')
      }
    } else {
      flags.push(`in flight — ${horizonDays - daysElapsed}d to maturity`)
    }

    const deltas = {
      position: actual.position != null ? Math.round((actual.position - projected.position) * 100) / 100 : null,
      impressions: actual.impressions != null ? Math.round(actual.impressions - projected.impressions) : null,
      clicks: actual.clicks != null ? Math.round(actual.clicks - projected.clicks) : null,
    }

    const { verdicts, overall, magnitude } = evaluateForecast(projected, {
      position: actual.position,
      impressions: actual.impressions,
      clicks: actual.clicks,
    })
    // Verdicts exist only for matured runs with real data; everything else is
    // no_data (in-flight or unverifiable) — never a result.
    const effectiveOverall: TrackerVerdict = matured ? (actual.source === 'none' ? 'no_data' : overall) : 'no_data'

    rows.push({
      topic: String(f.topic),
      subjectKey: String(f.subject_key || ''),
      horizonDays: horizonDays as 30 | 60 | 90,
      runDate,
      maturityDate: matDate,
      matured,
      daysElapsed,
      daysToMaturity: Math.max(0, horizonDays - daysElapsed),
      projected,
      actual,
      deltas,
      verdicts,
      overall: effectiveOverall,
      magnitude: effectiveOverall === 'no_data' ? 0 : magnitude,
      flags,
    })
  }

  rows.sort((a, b) => (b.matured === a.matured ? b.magnitude - a.magnitude : Number(b.matured) - Number(a.matured)))

  // Note: subset-direction prefix matches count at full confidence in these
  // stats (the safe direction is genuinely the same intent), but every such
  // row carries the `prefix match` flag so the panel can surface it.
  const evaluated = rows.filter((r) => r.matured && r.actual.source !== 'none')
  const inFlight = rows.filter((r) => !r.matured)
  const noData = rows.filter((r) => r.matured && r.actual.source === 'none')
  const byVerdict = verdictCounts(evaluated)

  const posErrs = evaluated.flatMap((r) => (r.deltas.position != null ? [Math.abs(r.deltas.position)] : []))
  const impErrs = evaluated.flatMap((r) =>
    r.deltas.impressions != null && r.projected.impressions > 0
      ? [Math.abs(r.deltas.impressions) / r.projected.impressions]
      : [],
  )
  const posBiases = evaluated.flatMap((r) => (r.deltas.position != null ? [r.deltas.position] : []))

  const perHorizon = {} as TrackerSummary['perHorizon']
  for (const h of ['30', '60', '90'] as const) {
    const group = evaluated.filter((r) => horizonKey(r.horizonDays) === h)
    const vc = verdictCounts(group)
    perHorizon[h] = {
      evaluated: group.length,
      byVerdict: vc,
      onTrackRate: group.length ? Math.round((vc.on_track / group.length) * 1000) / 10 : 0,
      avgPositionError: avg(group.flatMap((r) => (r.deltas.position != null ? [Math.abs(r.deltas.position)] : []))),
    }
  }

  const misses = evaluated
    .filter((r) => r.overall === 'over_predicted' || (r.overall === 'mixed' && (r.verdicts.position === 'over_predicted')))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5)
    .map(({ topic, horizonDays, runDate, projected, actual, deltas, magnitude }) => ({ topic, horizonDays, runDate, projected, actual, deltas, magnitude }))
  const surprises = evaluated
    .filter((r) => r.overall === 'under_predicted' || (r.overall === 'mixed' && r.verdicts.position === 'under_predicted'))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 5)
    .map(({ topic, horizonDays, runDate, projected, actual, deltas, magnitude }) => ({ topic, horizonDays, runDate, projected, actual, deltas, magnitude }))

  return {
    rows,
    summary: {
      evaluated: evaluated.length,
      inFlight: inFlight.length,
      noData: noData.length,
      byVerdict,
      onTrackRate: evaluated.length ? Math.round((byVerdict.on_track / evaluated.length) * 1000) / 10 : 0,
      avgPositionError: avg(posErrs),
      avgImpressionError: avg(impErrs),
      positionBias: avg(posBiases),
      perHorizon,
      worstMisses: misses,
      bestSurprises: surprises,
    },
  }
}

// ── DB-backed loader ─────────────────────────────────────────────────────────
export interface TrackerLoaderOpts {
  /** Forecast rows to consider (most recent first window). */
  limit?: number
  /** Filter to one horizon; numeric or string both accepted, plus 'all'. */
  horizon?: number | '30' | '60' | '90' | 'all'
  now?: string
}

/**
 * Load forecast runs + historical GSC snapshots + live signals and build the
 * report. Best-effort: any DB failure returns an empty report (the panel shows
 * a clear empty state rather than a crash).
 */
export async function loadForecastTracker(opts: TrackerLoaderOpts = {}): Promise<TrackerReport> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const client = createSupabaseAdminClient()
    const now = opts.now || new Date().toISOString().slice(0, 10)

    const [forecastRes, snapshotRes] = await Promise.all([
      client.from('seo_forecast_runs')
        .select('topic,subject_key,horizon_days,projected_position,projected_impressions,projected_clicks,probability_top10,run_date')
        .lte('run_date', now)
        .order('run_date', { ascending: false })
        .limit(Math.min(400, opts.limit || 200)),
      client.from('gsc_snapshots')
        .select('date_key,payload')
        .order('date_key', { ascending: false })
        .limit(120),
    ])

    const forecasts = ((forecastRes.data as ForecastRunRow[] | null) || []).filter(
      (f) => opts.horizon === 'all' || opts.horizon == null || Number(f.horizon_days) === Number(opts.horizon),
    )

    const snapshotIndex: SnapshotIndex = {}
    for (const s of (snapshotRes.data as Array<{ date_key: string; payload: unknown }> | null) || []) {
      const rows: SnapshotRow[] = []
      const payload = s.payload as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number; position?: number; ctr?: number }> } | null
      if (payload?.rows) {
        for (const r of payload.rows) {
          const term = String(r.keys?.[0] || '')
          if (!term) continue
          rows.push({
            term,
            impressions: Number(r.impressions) || 0,
            clicks: Number(r.clicks) || 0,
            position: Number(r.position) || 100,
          })
        }
      }
      if (rows.length) snapshotIndex[String(s.date_key)] = rows
    }

    const { pullGscSignals } = await import('./planner')
    const live = (await pullGscSignals()).map((s) => ({
      term: s.term,
      impressions: s.impressions,
      clicks: s.clicks,
      position: s.position,
    }))

    return assembleForecastTracker(forecasts, snapshotIndex, live, now)
  } catch {
    return { rows: [], summary: emptySummary() }
  }
}

export function emptySummary(): TrackerSummary {
  return {
    evaluated: 0,
    inFlight: 0,
    noData: 0,
    byVerdict: { over_predicted: 0, under_predicted: 0, on_track: 0, mixed: 0, no_data: 0 },
    onTrackRate: 0,
    avgPositionError: 0,
    avgImpressionError: 0,
    positionBias: 0,
    perHorizon: {
      '30': { evaluated: 0, byVerdict: { over_predicted: 0, under_predicted: 0, on_track: 0, mixed: 0, no_data: 0 }, onTrackRate: 0, avgPositionError: 0 },
      '60': { evaluated: 0, byVerdict: { over_predicted: 0, under_predicted: 0, on_track: 0, mixed: 0, no_data: 0 }, onTrackRate: 0, avgPositionError: 0 },
      '90': { evaluated: 0, byVerdict: { over_predicted: 0, under_predicted: 0, on_track: 0, mixed: 0, no_data: 0 }, onTrackRate: 0, avgPositionError: 0 },
    },
    worstMisses: [],
    bestSurprises: [],
  }
}
