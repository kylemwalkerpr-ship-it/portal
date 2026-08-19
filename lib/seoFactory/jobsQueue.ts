/**
 * Queue-maintenance helpers for Content Studio bulk clears.
 *
 * Clear-failed/drafts/stuck used to UPDATE each row in a loop. 62 failed jobs
 * is already past the Cloudflare Worker subrequest budget, so the confirm
 * click 500/422'd and the banner looked like the clear itself had failed.
 */

export type QueueClearAction = 'clear_drafts' | 'clear_stuck' | 'clear_failed'

export type QueueClearSpec = {
  statuses: readonly string[]
  /** When set, only rows with updated_at older than this ISO timestamp. */
  staleBefore: string | null
}

const STUCK_MS = 30 * 60_000

export function queueClearSpec(action: QueueClearAction, nowMs = Date.now()): QueueClearSpec {
  if (action === 'clear_drafts') return { statuses: ['pending'], staleBefore: null }
  if (action === 'clear_stuck') {
    return {
      statuses: ['drafting', 'pending'],
      staleBefore: new Date(nowMs - STUCK_MS).toISOString(),
    }
  }
  return { statuses: ['failed'], staleBefore: null }
}

/** Second-click copy. Never say "confirm clear failed" — that reads as an error. */
export function queueClearConfirmCopy(action: QueueClearAction, count: number): string {
  const n = Math.max(0, Number(count) || 0)
  const noun =
    action === 'clear_drafts' ? 'queued draft' : action === 'clear_stuck' ? 'stuck job' : 'failed job'
  const label = n === 1 ? noun : `${noun}s`
  return `Click again to confirm abandoning ${n} ${label}.`
}

export type QueueUiFilter = 'all' | 'pending' | 'drafting' | 'pr_created' | 'merged' | 'failed' | 'stuck'

/** Status query for GET /jobs so the failed tab loads failed rows, not the latest mixed 100. */
export function queueListStatusParam(filter: QueueUiFilter): string | null {
  if (filter === 'all') return null
  if (filter === 'stuck') return 'drafting,pending'
  return filter
}

export function queueMatchedCount(
  statusParam: string | null | undefined,
  statusTotals: Record<string, number>,
  tableTotal: number,
): number {
  if (!statusParam) return tableTotal
  return statusParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((n, s) => n + (statusTotals[s] || 0), 0)
}

type QueueSummaryLike = {
  total?: number
  pending?: number
  drafting?: number
  publishing?: number
  pr_created?: number
  merged?: number
  failed?: number
  closed?: number
} | null

type QueueWindowCounts = {
  total: number
  pending: number
  drafting: number
  failed: number
  stuck: number
  pr_created?: number
  merged?: number
}

/** Tab badges must use the table summary, not the loaded window. */
export function queueTabCount(
  filter: QueueUiFilter,
  summary: QueueSummaryLike,
  window: QueueWindowCounts,
): number {
  if (filter === 'stuck') return window.stuck
  if (!summary) {
    if (filter === 'all') return window.total
    if (filter === 'pending') return window.pending
    if (filter === 'drafting') return window.drafting
    if (filter === 'failed') return window.failed
    return window[filter] ?? 0
  }
  if (filter === 'all') return summary.total ?? window.total
  return Number(summary[filter] ?? 0)
}

export function queueDeleteConfirmCopy(count: number): string {
  const n = Math.max(0, Number(count) || 0)
  const label = n === 1 ? 'job' : 'jobs'
  return `Click again to permanently delete ${n} ${label} from the queue.`
}

export function queueJobsListPath(opts: { limit?: number; offset?: number; filter?: QueueUiFilter } = {}): string {
  const params = new URLSearchParams()
  params.set('limit', String(opts.limit ?? 100))
  if (opts.offset && opts.offset > 0) params.set('offset', String(opts.offset))
  const status = queueListStatusParam(opts.filter || 'all')
  if (status) params.set('status', status)
  return `/api/content-studio/jobs?${params.toString()}`
}
