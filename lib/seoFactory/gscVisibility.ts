/**
 * P1 measurement integrity — visibility summary over PERSISTED GSC rows.
 *
 * The raw `seo_gsc_rows` window stays exactly as stored: classification is
 * DERIVED (an additive `visibilityClass` per row), never destructive, so the
 * pollution story stays auditable and the database keeps every raw row.
 *
 * The summary is computed over the whole SCANNED window — never over the
 * display slice the UI renders — and carries the scan scope (cap / exact window
 * row count when known / unscanned rows / complete / truncated / usedFallback /
 * range / displayLimit). A bounded or unknown-count scan can therefore never
 * masquerade as a complete measurement: `complete` requires a KNOWN exact
 * window count and no truncation, and `caveat` spells the shortfall out in
 * words for the UI.
 *
 * Deterministic and pure — no network, no AI.
 */
import { classifyGscVisibility, type GscVisibilityClass } from './queryNoise'
import type { GscWindowScan } from './gscRows'

export type PersistedGscRow = {
  query?: unknown
  page?: unknown
  clicks?: unknown
  impressions?: unknown
  ctr?: unknown
  position?: unknown
}

export type AnnotatedPersistedGscRow<T extends PersistedGscRow> = T & {
  visibilityClass: GscVisibilityClass
}

export interface GscVisibilityBucket {
  impressions: number
  clicks: number
  ctr: number
  position: number
  /** Bucket impressions ÷ RAW totals impressions (0 when the window is empty). */
  share: number
  rowCount: number
}

export interface GscVisibilityScope {
  /** Display limit the caller's row list uses — cannot change a measurement. */
  displayLimit: number | null
  /** Rows the summary was computed over (the scanned persisted rows). */
  persistedRows: number
  scannedRows: number
  /** Exact count of rows persisted for the resolved window, when known. */
  windowRowCount: number | null
  /** False when the exact window count could not be read — `complete` is then false. */
  countKnown: boolean
  /** windowRowCount − scannedRows when the exact count is known, else null. */
  unscannedRows: number | null
  /** True only with a known exact count and nothing left unscanned. */
  complete: boolean
  /** True when the scan hit the cap (or the known count exceeds what was read). */
  truncated: boolean
  /**
   * True when the `rows` array handed to the summary does not match
   * `scannedRows` — the mix then describes different rows than the scope it
   * claims, so `complete` is forced false (fail closed).
   */
  rowMismatch: boolean
  /** Row cap applied to the bounded scan. */
  cap: number
  usedFallback: boolean
  range: { startDate: string; endDate: string } | null
  /** Human-readable shortfall, null when the measurement is complete. */
  caveat: string | null
}

export interface GscVisibilitySummary {
  measurement: 'query_rows'
  windowDays: number
  /** Rows the summary was computed over (raw rows, never filtered away). */
  rowCount: number
  /** RAW totals over every scanned row — junk and off-mission included. */
  totals: { clicks: number; impressions: number; ctr: number; position: number }
  /** On-mission signal-bearing rows — the only actionable bucket. */
  qualified: GscVisibilityBucket
  /** Real demand outside the mission — observable, never actionable. */
  offMission: GscVisibilityBucket
  junk: GscVisibilityBucket
  deepTail: GscVisibilityBucket
  scope: GscVisibilityScope
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Classify one persisted row (raw fields untouched — the class is derived). */
export function classifyPersistedGscRow(row: PersistedGscRow): GscVisibilityClass {
  return classifyGscVisibility(String(row?.query || ''), {
    impressions: num(row?.impressions),
    position: num(row?.position),
    clicks: num(row?.clicks),
  })
}

/** Additive per-row classification. Every raw row survives, in order. */
export function annotatePersistedGscRows<T extends PersistedGscRow>(
  rows: T[],
): Array<AnnotatedPersistedGscRow<T>> {
  return (rows || []).filter(Boolean).map((row) => ({
    ...row,
    visibilityClass: classifyPersistedGscRow(row),
  }))
}

function bucketOf<T extends PersistedGscRow>(
  annotated: Array<AnnotatedPersistedGscRow<T>>,
  cls: GscVisibilityClass,
  totalImpressions: number,
): GscVisibilityBucket {
  const rows = annotated.filter((row) => row.visibilityClass === cls)
  const impressions = rows.reduce((a, r) => a + num(r.impressions), 0)
  const clicks = rows.reduce((a, r) => a + num(r.clicks), 0)
  const posWeighted = rows.reduce((a, r) => a + num(r.impressions) * num(r.position), 0)
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posWeighted / impressions : 0,
    share: totalImpressions > 0 ? impressions / totalImpressions : 0,
    rowCount: rows.length,
  }
}

/**
 * Full-scope caveat for the UI: null when the measurement covers the whole
 * persisted window, otherwise an explicit partial/truncated statement.
 */
export function visibilityScopeCaveat(scope: {
  countKnown?: boolean
  windowRowCount?: number | null
  persistedRows?: number
  scannedRows?: number
  unscannedRows?: number | null
  truncated?: boolean
  cap?: number
  complete?: boolean
  rowMismatch?: boolean
}): string | null {
  if (scope?.complete) return null
  const measured = Number(scope?.scannedRows ?? scope?.persistedRows ?? 0)
  // Fail-closed statement first: a rows array that disagrees with the scope is
  // the strongest possible reason to distrust the mix.
  if (scope?.rowMismatch === true) {
    return `Partial measurement: ${Number(scope?.persistedRows ?? 0).toLocaleString()} row(s) provided for a scan of ${measured.toLocaleString()} row(s) — the rows do not match the scan scope, so the mix is incomplete.`
  }
  const known = scope?.countKnown === true && typeof scope?.windowRowCount === 'number'
  if (!known) {
    return `Partial measurement: ${measured.toLocaleString()} persisted row(s) scanned; exact window row count unavailable, so the mix is not the whole window.`
  }
  const total = Number(scope.windowRowCount || 0)
  const unscanned =
    typeof scope.unscannedRows === 'number'
      ? scope.unscannedRows
      : Math.max(0, total - measured)
  return `Partial measurement: ${measured.toLocaleString()} of ${total.toLocaleString()} persisted row(s) scanned (${unscanned.toLocaleString()} unscanned, cap ${Number(scope.cap || 0).toLocaleString()}).`
}

/**
 * Build the visibility summary from scanned persisted rows + the scan scope.
 * `rows` are the scan's rows; `scan` carries the truth about the scope so a
 * bounded read cannot look complete.
 */
export function buildGscVisibilitySummary<T extends PersistedGscRow>(input: {
  rows: T[]
  scan?: Partial<GscWindowScan> | null
  displayLimit?: number | null
  windowDays?: number
}): GscVisibilitySummary {
  const rows = (input.rows || []).filter(Boolean)
  const annotated = annotatePersistedGscRows(rows)
  const totalImpressions = annotated.reduce((a, r) => a + num(r.impressions), 0)
  const totalClicks = annotated.reduce((a, r) => a + num(r.clicks), 0)
  const totalPosWeighted = annotated.reduce((a, r) => a + num(r.impressions) * num(r.position), 0)

  const scan = input.scan || {}
  const scannedRows = typeof scan.scannedRows === 'number' ? scan.scannedRows : rows.length
  const windowRowCount = typeof scan.windowRowCount === 'number' ? scan.windowRowCount : null
  const countKnown = typeof scan.countKnown === 'boolean' ? scan.countKnown : windowRowCount != null
  const truncated = scan.truncated === true
  const complete = scan.complete === true
  // Fail closed: a row array that does not match the scan scope is not a
  // measurement of that scope. Prefer an explicit incomplete measurement (with
  // a caveat) over throwing — the rows that WERE supplied still measure
  // something honest.
  const rowMismatch = typeof scan.scannedRows === 'number' && scan.scannedRows !== rows.length
  const unscannedRows = countKnown && windowRowCount != null
    ? Math.max(0, windowRowCount - scannedRows)
    : null

  const scope: GscVisibilityScope = {
    displayLimit: typeof input.displayLimit === 'number' ? input.displayLimit : null,
    persistedRows: rows.length,
    scannedRows,
    windowRowCount,
    countKnown,
    unscannedRows,
    // A bounded or unknown-count scan must NEVER report itself as complete.
    complete: complete && countKnown && !rowMismatch,
    truncated,
    rowMismatch,
    cap: typeof scan.cap === 'number' ? scan.cap : 0,
    usedFallback: scan.usedFallback === true,
    range: scan.range || null,
    caveat: null,
  }
  scope.caveat = visibilityScopeCaveat(scope)

  return {
    measurement: 'query_rows',
    windowDays: num(input.windowDays) || 28,
    rowCount: rows.length,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      position: totalImpressions > 0 ? totalPosWeighted / totalImpressions : 0,
    },
    qualified: bucketOf(annotated, 'qualified', totalImpressions),
    offMission: bucketOf(annotated, 'off_mission', totalImpressions),
    junk: bucketOf(annotated, 'junk', totalImpressions),
    deepTail: bucketOf(annotated, 'deep_tail', totalImpressions),
    scope,
  }
}
