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
