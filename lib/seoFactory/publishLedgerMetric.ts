/**
 * lib/seoFactory/publishLedgerMetric.ts
 *
 * Pure, deterministic helpers for the PublishLedger sparkline metric
 * switcher (pos / imp / clk). Kept dependency-free so a unit test
 * (tests/publish-ledger-metric.test.ts) can lock every direction rule
 * without spinning up the React component.
 *
 * NOTE: this is intentionally NOT coupled to the existing
 * position-trend endpoint's `direction` field. The endpoint ships
 * position's coarse direction because it is the only metric Google
 * uses for ranking — but the stamp switcher also surfaces impressions
 * and clicks, which have reversed semantics (higher = better). We
 * therefore compute direction per metric locally on the client from
 * the trend points series.
 */

export type Metric = 'position' | 'impressions' | 'clicks'
export type Direction = 'up' | 'down' | 'flat' | 'unknown'

const POS_SLOT_BAND = 0.3   // mirrors position-trend coarse threshold
const VOL_REL_BAND = 0.05   // 5% relative change for volume metrics

/** Pull just one metric's values out of the GSC daily series. */
export function extractMetricValues(
  points: Array<{ date: string; clicks: number; impressions: number; position: number; ctr: number }> | null | undefined,
  metric: Metric,
): number[] {
  if (!Array.isArray(points) || !points.length) return []
  return points
    .map((p) => metric === 'position' ? p.position : metric === 'impressions' ? p.impressions : p.clicks)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

/**
 * Coarse direction for a given metric, comparing the latest point to the
 * earliest point in the trend window.
 *
 *   position:    delta ≤ -POS_SLOT_BAND ⇒ up (improving)
 *                delta ≥ +POS_SLOT_BAND ⇒ down (rank falling)
 *   impressions,
 *   clicks:     |delta / first| ≥ VOL_REL_BAND; positive ⇒ up (rising)
 */
export function directionForMetric(
  values: number[],
  metric: Metric,
): Direction {
  if (values.length < 2) return 'unknown'
  const first = values[0]
  const latest = values[values.length - 1]
  const delta = latest - first
  if (metric === 'position') {
    if (delta <= -POS_SLOT_BAND) return 'up'
    if (delta >= POS_SLOT_BAND) return 'down'
    return 'flat'
  }
  // Volume metrics: relative change is more meaningful than absolute.
  const rel = first > 0 ? delta / first : delta > 0 ? 1 : delta < 0 ? -1 : 0
  if (rel >= VOL_REL_BAND) return 'up'
  if (rel <= -VOL_REL_BAND) return 'down'
  return 'flat'
}

/**
 * Arrow direction by metric — for *non-position* metrics, a positive delta
 * is rendered with the up-arrow (good). For position, the arrow points
 * opposite the actual rank movement because smaller numbers are better.
 */
export function arrowForMetric(
  metric: Metric,
  delta: number | null,
  baseline: number | null = null,
): 'up' | 'down' | null {
  if (delta == null) return null
  if (metric === 'position') {
    if (Math.abs(delta) < POS_SLOT_BAND) return null
    return delta <= 0 ? 'up' : 'down'
  }
  const relative = baseline != null && baseline > 0
    ? delta / baseline
    : delta > 0 ? 1 : delta < 0 ? -1 : 0
  if (Math.abs(relative) < VOL_REL_BAND) return null
  return relative >= 0 ? 'up' : 'down'
}

export function formatMetricValue(metric: Metric, value: number | null): string {
  if (value == null) return '—'
  if (metric === 'position') return value.toFixed(1)
  // Keep volume formatting identical to the studio's existing GSC cards:
  // millions use M, thousands use one decimal k, and small values are whole.
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(Math.round(value))
}

/** GSC returns CTR as a fraction (0.0875 → 8.8%). */
export function formatCtr(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}
