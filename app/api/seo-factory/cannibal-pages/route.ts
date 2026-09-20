import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveCannibalPages } from '@/lib/seoFactory/cannibalMerge'

/**
 * Recommendation-only competing-page evidence for P4 decisions.
 *
 * Never suggests a winner (impressions cannot choose one; the authoritative P3
 * owner row does) and never mutates anything. `eligibleForDestructiveAction`
 * only states that the *evidence* is strong enough for an operator to author a
 * decision record — it is not authorization.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    if (!term) return NextResponse.json({ ok: false, error: 'term required' }, { status: 400 })
    const resolved = await resolveCannibalPages(term)
    if (!resolved || resolved.pages.length < 2) {
      return NextResponse.json({
        ok: false,
        term,
        pages: [],
        source: resolved?.source ?? null,
        evidenceSource: resolved?.evidenceSource ?? null,
        window: resolved?.window ?? null,
        metricsSynthetic: resolved?.metricsSynthetic ?? null,
        displayOnly: resolved?.displayOnly ?? null,
        eligibleForDestructiveAction: false,
        destructiveEligible: false,
        blockingReasons: resolved?.blockingReasons ?? ['two_competing_pages_required'],
        blockers: resolved?.blockingReasons ?? ['two_competing_pages_required'],
        suggestedWinner: null,
        winnerSelection: 'authoritative_p3_owner_only',
        error: `No actionable competing-page pair found for "${term}".`,
      })
    }
    return NextResponse.json({
      ok: true,
      term,
      pages: resolved.pages,
      source: resolved.source,
      evidenceSource: resolved.evidenceSource,
      siteUrl: resolved.siteUrl,
      window: resolved.window,
      metricsSynthetic: resolved.metricsSynthetic,
      displayOnly: resolved.displayOnly,
      eligibleForDestructiveAction: resolved.eligibleForDestructiveAction,
      destructiveEligible: resolved.eligibleForDestructiveAction,
      blockingReasons: resolved.blockingReasons,
      blockers: resolved.blockingReasons,
      suggestedWinner: null,
      winnerSelection: 'authoritative_p3_owner_only',
      guidance: resolved.eligibleForDestructiveAction
        ? 'Qualified GSC overlap found. P4 still requires an authoritative-owner decision record before any review PR can be opened.'
        : 'Recommendation-only evidence. Synthetic inventory or unqualified GSC evidence cannot authorize destructive consolidation.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal pages failed'
    console.error('[seo-factory/cannibal-pages]', err)
    return NextResponse.json(
      { ok: false, error: message, pages: [], eligibleForDestructiveAction: false, destructiveEligible: false, suggestedWinner: null },
      { status: 500 },
    )
  }
}
