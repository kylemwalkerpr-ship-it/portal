/**
 * Pure summary builder for the content-studio job queue.
 *
 * The queue API returns a window of rows but the admin dashboard must never
 * report window-derived counts as the truth — the pills, "In flight" / "PRs
 * open" KPIs and totals are computed from the REAL table totals aggregated
 * here. Kept pure so the jobs route and regression tests share one source.
 */

export interface JobSummary {
  /** Exact table row count (count: 'exact'). */
  total: number
  /** Rows returned in the current list window. */
  window: number
  drafting: number
  pr_created: number
  merged: number
  failed: number
  closed: number
  pending: number
  publishing: number
  /** Mean SEO score over the scored rows in the window (null when none). */
  avgSeo: number | null
}

export interface JobSummaryInput {
  total: number
  window: number
  /** status → count over the whole table (status-only pass). */
  statusTotals: Record<string, number>
  /** Scored rows from the list window (only used for avgSeo). */
  scored: Array<{ seo_score?: number | null }>
}

const KEY_STATUSES = ['drafting', 'pr_created', 'merged', 'failed', 'closed', 'pending', 'publishing'] as const

/** Head-count each status so the desk/queue never depend on a 5k-row scan. */
export const JOB_SUMMARY_STATUSES = KEY_STATUSES

export function emptyStatusTotals(): Record<string, number> {
  return Object.fromEntries(KEY_STATUSES.map((k) => [k, 0]))
}

export function buildJobSummary(input: JobSummaryInput): JobSummary {
  const { total, window, statusTotals, scored } = input
  const at = (k: (typeof KEY_STATUSES)[number]) => statusTotals[k] ?? 0
  // Null scores are unscored rows — never let them drag the mean down.
  const scoredRows = scored.filter((j) => j.seo_score != null)
  return {
    total,
    window,
    drafting: at('drafting'),
    pr_created: at('pr_created'),
    merged: at('merged'),
    failed: at('failed'),
    closed: at('closed'),
    pending: at('pending'),
    publishing: at('publishing'),
    avgSeo:
      scoredRows.length > 0
        ? Math.round(scoredRows.reduce((s, j) => s + Number(j.seo_score), 0) / scoredRows.length)
        : null,
  }
}
