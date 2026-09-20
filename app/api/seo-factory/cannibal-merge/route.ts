import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { executeCannibalMerge } from '@/lib/seoFactory/cannibalMerge'
import { CannibalDecisionBlockedError, type CannibalDecisionRecord } from '@/lib/seoFactory/cannibalDecision'

/**
 * P4 destructive consolidation is PR-only and evidence-gated.
 *
 * Required body: { term, mode: 'pr', confirm: true, winnerUrl, loserUrls, decision }
 * The decision must be a complete P4 evidence record; the executor re-validates
 * it (P3 authoritative owner, qualified GSC overlap, rollback SHAs, evidence
 * hash) and persists it to the append-only ledger before any Git mutation.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    if (!term) return NextResponse.json({ error: 'term required', blockers: ['term_required'] }, { status: 400 })
    if (body.direct === true || body.mergeNow === true || body.skipReview === true || body.autoMerge === true) {
      return NextResponse.json(
        {
          error: 'P4 destructive consolidation cannot be published directly; a review PR is required.',
          blockers: ['direct_publish_forbidden'],
        },
        { status: 409 },
      )
    }
    if (body.mode !== 'pr') return NextResponse.json({ error: 'P4 destructive consolidation is PR-only.', blockers: ['pr_mode_required'] }, { status: 409 })
    if (body.confirm !== true) return NextResponse.json({ error: 'Explicit per-cluster confirmation is required.', blockers: ['explicit_confirmation_required'] }, { status: 409 })
    if (!body.decision || typeof body.decision !== 'object' || Array.isArray(body.decision)) {
      return NextResponse.json({ error: 'Evidence-backed P4 decision required.', blockers: ['decision_required'] }, { status: 409 })
    }
    const decision = body.decision as CannibalDecisionRecord
    const result = await executeCannibalMerge({
      term,
      winnerUrl: String(body.winnerUrl || decision.winnerUrl || '').trim(),
      loserUrls: Array.isArray(body.loserUrls) ? body.loserUrls.map(String) : [],
      mode: 'pr', confirm: true, decision,
    })
    if (result.status === 'skipped') {
      return NextResponse.json({ ...result, ok: false, noop: true })
    }
    if (result.status === 'needs_decision') {
      // A review PR exists but its append-only ledger row does not. That is
      // partial state — fail closed and hand the operator the PR plus blockers
      // instead of reporting a clean success.
      return NextResponse.json(
        {
          ...result,
          ok: false,
          needsDecision: true,
          error:
            'Review PR opened but the P4 append-only decision ledger row could not be persisted — partial state requires an operator decision.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof CannibalDecisionBlockedError) return NextResponse.json({ error: err.message, blockers: err.blockers }, { status: 409 })
    const message = err instanceof Error ? err.message : 'cannibal merge failed'
    console.error('[seo-factory/cannibal-merge]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
