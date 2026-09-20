/**
 * Cannibal outcome classification — pure, deterministic contract shared by the
 * Content Studio UI.
 *
 * P4 boundary: a destructive consolidation result is only ever acceptable when
 * it came from the PR-only executor. Any payload that claims a direct/main
 * mutation is classified `failed`, so a UI (or a future caller) can never report
 * a direct write as success.
 */

export type CannibalResolveOutcome =
  | { status: 'resolved'; detail: string }
  | { status: 'skipped'; detail: string }
  | { status: 'needs_decision'; detail: string }
  | { status: 'failed'; detail: string }

/** Shape of the /api/seo-factory/cannibal-merge JSON body (subset we classify on). */
export interface CannibalMergeResponseBody {
  error?: string
  blockers?: string[]
  mode?: string
  /** Set when a Git mutation exists without its append-only ledger row. */
  needsDecision?: boolean
  status?: string
  ledgerPersisted?: boolean
  noop?: boolean
  winnerUrl?: string
  redirectsAdded?: Array<unknown>
  skipped?: Array<unknown>
  commits?: Array<{ prUrl?: string; branch?: string; commitSha?: string; mergedToMain?: boolean }>
}

/** Result of the read-only Work Plan evidence review (never destructive). */
export interface CannibalEvidenceReview {
  status: 'qualified' | 'recommendation_only' | 'unavailable'
  detail: string
}

/**
 * Classify a cannibal-merge HTTP result into a resolved/skipped/failed outcome.
 *
 *   - direct/main mutation claim → failed  (P4 forbids direct destructive writes)
 *   - needsDecision/needs_decision → needs_decision (partial state, fail closed)
 *   - !ok                        → failed  (body.error, else HTTP status)
 *   - 0 redirects + N>0 skipped  → skipped (losers had nothing left to write)
 *   - otherwise                  → resolved (redirect count → winner, optional PR)
 */
export function classifyCannibalMergeResult(opts: {
  ok: boolean
  status: number
  body: CannibalMergeResponseBody
}): CannibalResolveOutcome {
  const prUrl = (opts.body.commits ?? []).map((c) => c?.prUrl).find(Boolean)
  const directMode = opts.body.mode !== undefined && opts.body.mode !== 'pr'
  const mainMutation = (opts.body.commits ?? []).some(
    (commit) =>
      commit?.branch === 'main'
      || commit?.commitSha === 'merged-to-main'
      || commit?.mergedToMain === true,
  )
  // A direct/main mutation claim is always `failed`, even when the payload also
  // claims a needs-decision state.
  if (directMode || mainMutation) {
    return {
      status: 'failed',
      detail: 'P4 blocked: destructive cannibal consolidation cannot write directly to main.',
    }
  }
  if (opts.body.needsDecision === true || opts.body.status === 'needs_decision') {
    const blockers = Array.isArray(opts.body.blockers) ? opts.body.blockers : []
    const reason = blockers.length
      ? `blocked by ${blockers.join(', ')}`
      : 'the append-only decision ledger row is missing'
    return {
      status: 'needs_decision',
      detail: `Partial state: ${reason}${prUrl ? ` · PR ${prUrl}` : ''} — operator decision required.`,
    }
  }
  if (opts.body.status === 'skipped' || opts.body.noop === true) {
    const skipped = Array.isArray(opts.body.skipped) ? opts.body.skipped.length : 0
    const firstReason = (opts.body.skipped?.[0] as { reason?: string } | undefined)?.reason
    return {
      status: 'skipped',
      detail: firstReason
        ? `${skipped || 1} page(s) skipped — ${firstReason}`
        : 'No actionable cannibalization writes remain; no PR was opened.',
    }
  }
  if (!opts.ok) {
    const blockers = Array.isArray(opts.body.blockers) && opts.body.blockers.length
      ? ` · ${opts.body.blockers.join(', ')}`
      : ''
    return { status: 'failed', detail: `${opts.body.error || `HTTP ${opts.status}`}${blockers}` }
  }
  const redirects = Array.isArray(opts.body.redirectsAdded) ? opts.body.redirectsAdded.length : 0
  const skipped = Array.isArray(opts.body.skipped) ? opts.body.skipped.length : 0
  if (redirects === 0 && skipped > 0) {
    const firstReason = (opts.body.skipped?.[0] as { reason?: string } | undefined)?.reason
    return {
      status: 'skipped',
      detail: firstReason
        ? `${skipped} page(s) skipped — ${firstReason}`
        : `${skipped} URL(s) skipped (nothing left to consolidate)`,
    }
  }
  let detail = `${redirects} redirect(s) → ${opts.body.winnerUrl || 'winner'}`
  if (prUrl) detail += ` · PR ${prUrl}`
  return { status: 'resolved', detail }
}

/**
 * Work Plan evidence-review copy. Nothing here is destructive: a review only
 * reports whether a cluster has qualified GSC overlap an operator could turn
 * into an evidence-backed decision.
 */
export function formatCannibalEvidenceReviewNotice(counts: {
  qualified: number
  recommendationOnly: number
  unavailable: number
  blockers?: string[]
}): string {
  const { qualified, recommendationOnly, unavailable, blockers = [] } = counts
  if (qualified === 0 && recommendationOnly > 0 && unavailable === 0) {
    return `⚠ Cannibal review: ${recommendationOnly} recommendation-only — no qualified GSC overlap; no redirects, noindex or PRs were requested.`
  }
  let notice = `🔍 Cannibal review: ${qualified} qualified for a decision · ${recommendationOnly} recommendation-only · ${unavailable} unavailable — no destructive writes performed.`
  if (blockers.length) {
    notice += ` First blocker: ${blockers.slice(0, 2).join('; ')}${blockers.length > 2 ? '…' : ''}`
  }
  return notice
}
