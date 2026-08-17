import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { suggestInterlinks } from '@/lib/interlinkRegistry'
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
    }

    const topic = typeof body.topic === 'string' ? body.topic : ''
    const keywords = Array.isArray(body.keywords) ? body.keywords : []
    const maxResults = typeof body.maxResults === 'number' ? Math.min(body.maxResults, 10) : 5

    const [registry, inventory] = await Promise.all([
      Promise.resolve(suggestInterlinks(topic, keywords, maxResults)),
      suggestInventoryInterlinks(topic, keywords, maxResults).catch(() => []),
    ])
    const seen = new Set<string>()
    const suggestions: Array<{ label: string; url: string; site?: string }> = []
    for (const s of [...registry, ...inventory]) {
      const key = String(s.url || '').replace(/\/+$/, '').toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      suggestions.push({ label: s.label, url: s.url, site: s.site })
      if (suggestions.length >= maxResults) break
    }

    return NextResponse.json({
      topic,
      keywords,
      count: suggestions.length,
      suggestions,
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
