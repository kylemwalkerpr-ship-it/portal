import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { suggestInventoryInterlinks } from '@/lib/seoFactory/estateInterlinks'

/**
 * POST /api/content-studio/interlinks
 *
 * Body: { topic: string, keywords: string[], maxResults?: number }
 *
 * Returns matched interlink suggestions from the ecosystem link registry.
 * Used by the Content Studio UI and can be consumed by generation pipelines.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as {
      topic?: string
      keywords?: string[]
      maxResults?: number
      region?: string
      sourceUrl?: string
      h2Outline?: string[]
    }

    const topic = typeof body.topic === 'string' ? body.topic : ''
    const keywords = Array.isArray(body.keywords) ? body.keywords : []
    const maxResults = typeof body.maxResults === 'number' ? Math.min(body.maxResults, 10) : 5

    const estate = await suggestInventoryInterlinks(topic, keywords, maxResults, {
      region: typeof body.region === 'string' ? body.region : undefined,
      sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
      h2Outline: Array.isArray(body.h2Outline) ? body.h2Outline.map(String) : undefined,
    }).catch(() => ({ suggestions: [], inventory: { scanned: 0, eligible: 0, liveVerified: 0, source: 'site_health_pages + content_jobs' as const } }))
    // The hand-maintained registry is fallback-only. It can never outrank the
    // canonical estate inventory and is live-verified before it reaches AI.
    const registry = estate.suggestions.length >= Math.min(3, maxResults)
      ? []
      : await suggestVerifiedInterlinks(topic, keywords, maxResults).catch(() => [])
    const seen = new Set<string>()
    const suggestions: Array<Record<string, unknown>> = []
    for (const s of [
      ...estate.suggestions,
      ...registry.map((item) => ({ ...item, score: 30, reason: 'Live-verified registry fallback.', placement: 'Related guidance', liveStatus: 'live', role: 'topical-guide', matchedOn: item.matchedOn || [] })),
    ]) {
      const key = String(s.url || '').replace(/\/+$/, '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      suggestions.push(s)
      if (suggestions.length >= maxResults) break
    }

    return NextResponse.json({
      topic,
      keywords,
      count: suggestions.length,
      suggestions,
      inventory: estate.inventory,
    })
  } catch (err) {
    console.error('[content-studio/interlinks]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to resolve interlinks' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/content-studio/interlinks
 *
 * Simple health check — returns total link count and categories.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { LINKS } = await import('@/lib/interlinkRegistry')
    const bySite = { caseworks: 0, regional: 0, marketplace: 0 }
    for (const link of LINKS) {
      bySite[link.site]++
    }

    return NextResponse.json({
      totalLinks: LINKS.length,
      bySite,
      note: 'POST with { topic, keywords[] } to get ranked interlink suggestions.',
    })
  } catch (err) {
    console.error('[content-studio/interlinks]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}
