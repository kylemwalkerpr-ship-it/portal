import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { executeCannibalMerge } from '@/lib/seoFactory/cannibalMerge'

/**
 * POST /api/seo-factory/cannibal-merge
 * One-click resolution of a war-room cannibal_merge opportunity.
 * Body: { term, winnerUrl?, loserUrls?: string[], mode?: 'merge' | 'pr' }
 *
 * v2: winnerUrl/loserUrls are now optional. When they are missing or contain
 * a bare keyword instead of a page URL, the engine resolves the competing
 * pages directly from Google Search Console query×page data (winner = highest
 * impressions) and merges those — no more "term, winnerUrl and at least one
 * loserUrl are required" failures.
 *
 * Unresolvable cases return 400 with actionable guidance instead of a raw 500.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    const winnerUrl = String(body.winnerUrl || '').trim()
    const loserUrls = Array.isArray(body.loserUrls)
      ? body.loserUrls.map(String)
      : []
    const mode = body.mode === 'pr' ? 'pr' : 'merge'

    if (!term) {
      return NextResponse.json(
        {
          error: 'A search term is required to run a cannibal merge.',
          guidance:
            'Open a war-room cannibalization play, or pass the term that multiple pages are ranking for.',
        },
        { status: 400 },
      )
    }

    const result = await executeCannibalMerge({ term, winnerUrl, loserUrls, mode })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal merge failed'
    console.error('[seo-factory/cannibal-merge]', err)

    // No resolvable competing pages → not a hard failure. Treat it as a
    // skipped cluster (likely a false-positive from title-token overlap, or a
    // low-impression term with no GSC page rows) so the sweep reports
    // "skipped" instead of "failed" for these.
    if (/could not resolve competing pages/i.test(message)) {
      return NextResponse.json({
        ok: true,
        winnerUrl: '',
        redirectsAdded: [],
        commits: [],
        skipped: [{ url: '', reason: 'no competing pages resolvable — not a real cluster' }],
      })
    }

    // Resolution/validation failures are user-actionable → 400 with guidance.
    if (
      /could not resolve|required to run|not a valid page url|search term/i.test(
        message,
      )
    ) {
      return NextResponse.json(
        {
          error: message,
          guidance:
            'Refresh GSC data in the War Room (GSC → Refresh), then retry the merge — or pass an explicit winnerUrl and at least one loserUrl.',
        },
        { status: 400 },
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
