/**
 * Cannibal merge outcome classification — pure, deterministic contract shared
 * by the Work Plan's single-row Resolve and the Resolve-all sweep.
 *
 * Extracted from the component so the resolved/skipped/failed classification
 * is locked by regression tests (see tests/cannibal-resolve-outcome.test.ts)
 * rather than living inline in a React callback.
 */

export type CannibalResolveOutcome =
  | { status: 'resolved'; detail: string }
  | { status: 'skipped'; detail: string }
  | { status: 'failed'; detail: string }

/** Shape of the /api/seo-factory/cannibal-merge JSON body (subset we classify on). */
export interface CannibalMergeResponseBody {
  error?: string
  winnerUrl?: string
  redirectsAdded?: Array<unknown>
  skipped?: Array<unknown>
  commits?: Array<{ prUrl?: string }>
}

/**
 * Classify a cannibal-merge HTTP result into a resolved/skipped/failed outcome.
 *
 *   - !ok                 → failed  (body.error, else HTTP status)
 *   - 0 redirects + N>0   → skipped (losers had no redirect convention)
 *   - otherwise           → resolved (redirect count → winner, optional PR)
 */
export function classifyCannibalMergeResult(opts: {
  ok: boolean
  status: number
  body: CannibalMergeResponseBody
}): CannibalResolveOutcome {
  if (!opts.ok) {
    return { status: 'failed', detail: opts.body.error || `HTTP ${opts.status}` }
  }
  const redirects = Array.isArray(opts.body.redirectsAdded) ? opts.body.redirectsAdded.length : 0
  const skipped = Array.isArray(opts.body.skipped) ? opts.body.skipped.length : 0
  const prUrl = (opts.body.commits ?? []).map((c) => c?.prUrl).find(Boolean)
  if (redirects === 0 && skipped > 0) {
    const firstReason = (opts.body.skipped?.[0] as { reason?: string } | undefined)?.reason
    return {
      status: 'skipped',
      detail: firstReason
        ? `${skipped} page(s) skipped — ${firstReason}`
        : `${skipped} URL(s) skipped (no redirect convention)`,
    }
  }
  let detail = `${redirects} redirect(s) → ${opts.body.winnerUrl || 'winner'}`
  if (prUrl) detail += ` · PR ${prUrl}`
  return { status: 'resolved', detail }
}

/** Work Plan sweep copy — skipped clusters are cleared, not left hanging. */
export function formatCannibalSweepNotice(counts: {
  resolved: number
  skipped: number
  failed: number
  failures?: string[]
}): string {
  const { resolved, skipped, failed, failures = [] } = counts
  if (resolved === 0 && skipped > 0 && failed === 0) {
    return `⚠ Cannibal sweep: ${skipped} cleared — no mergeable estate URLs (GSC noise or title-only overlap).`
  }
  let notice = `⚠ Cannibal sweep: ${resolved} merged`
  if (skipped > 0) notice += ` · ${skipped} cleared`
  if (failed > 0) {
    notice += ` · ${failed} failed`
    if (failures.length) notice += ` — ${failures.slice(0, 2).join('; ')}${failures.length > 2 ? '…' : ''}`
  }
  return notice
}
