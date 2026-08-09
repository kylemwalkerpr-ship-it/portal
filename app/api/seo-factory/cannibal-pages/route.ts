import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveCannibalPages } from '@/lib/seoFactory/cannibalMerge'

/**
 * POST /api/seo-factory/cannibal-pages
 * Body: { term }
 *
 * Resolves the pages competing for a term so the operator can pick a winner
 * and losers explicitly (the anti-cannibalization flow Google expects: one
 * canonical page wins, the rest 301/noindex into it).
 *
 * Uses fuzzy word-overlap GSC matching first, then falls back to the content
 * inventory (shipped content_jobs) so the watch is actionable even when GSC
 * has no page-level rows for the term.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const term = String(body.term || '').trim().slice(0, 160)
    if (!term) {
      return NextResponse.json(
        { ok: false, error: 'term required', guidance: 'Pass the keyword whose competing pages you want to see.' },
        { status: 400 },
      )
    }

    const resolved = await resolveCannibalPages(term)

    if (!resolved || resolved.pages.length < 2) {
      return NextResponse.json({
        ok: false,
        term,
        pages: [],
        source: resolved?.source ?? null,
        error: `No competing pages found for "${term}".`,
        guidance:
          'The term did not return ≥2 ranking pages from GSC or the content inventory. ' +
          'Try a broader term, rescan GSC in the War Room, or check the Pipeline for shipped pages targeting it.',
      })
    }

    return NextResponse.json({
      ok: true,
      term,
      pages: resolved.pages.map((p) => ({
        url: p.url,
        impressions: p.impressions,
        clicks: p.clicks,
        position: p.position,
      })),
      source: resolved.source,
      siteUrl: resolved.siteUrl,
      suggestedWinner: resolved.pages[0]?.url ?? null,
      guidance:
        resolved.source === 'gsc_live'
          ? 'Pages resolved from live GSC query×page data — winner = highest impressions.'
          : 'GSC had no page rows for this term — pages resolved from the shipped content inventory. Verify the URLs before merging.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cannibal pages failed'
    console.error('[seo-factory/cannibal-pages]', err)
    return NextResponse.json(
      { ok: false, error: message, pages: [], guidance: 'Resolution failed unexpectedly.' },
      { status: 500 },
    )
  }
}
