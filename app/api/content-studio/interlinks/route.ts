import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { suggestInventoryInterlinks } from '@/lib/seoFactory/estateInterlinks'
import { createSupabaseAdminClient } from '@/lib/supabase'

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
      : await suggestVerifiedInterlinks(topic, keywords, maxResults, typeof body.region === 'string' ? body.region : undefined).catch(() => [])
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
 * Unified studio interlink list — registry (estate + hand-maintained) UNION
 * the Master Engine graph from `seo_interlinks` (read-only), deduped by URL,
 * so the studio list covers both the estate registry and the planner's
 * journey/CTA edges. Read-only: nothing here writes to seo_interlinks.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { LINKS } = await import('@/lib/interlinkRegistry')
    const bySite = { caseworks: 0, regional: 0, marketplace: 0 }
    const seen = new Set<string>()
    const links: Array<Record<string, unknown>> = []
    const normalize = (u: string) => String(u || '').replace(/\/+$/, '').toLowerCase()
    for (const link of LINKS) {
      bySite[link.site]++
      if (!link.url) continue
      const key = normalize(link.url)
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ url: link.url, label: link.label, site: link.site, kind: link.kind, source: 'registry' })
    }

    // Master Engine graph — the planner's seo_interlinks edges, read-only.
    let engineGraphCount = 0
    try {
      const supabase = createSupabaseAdminClient()
      const { data } = await supabase
        .from('seo_interlinks')
        .select('target_url,target_host,anchor_text,status,reason')
        .order('score', { ascending: false })
        .limit(200)
      for (const row of (data as Array<Record<string, unknown>> | null) || []) {
        const url = String(row.target_url || '').trim()
        if (!url) continue
        const key = normalize(url)
        if (seen.has(key)) continue
        seen.add(key)
        engineGraphCount++
        const label = String(row.anchor_text || '').trim() || url.replace(/^https?:\/\//i, '').replace(/\/+$/, '').slice(0, 56)
        const site = String(row.target_host || '').trim() || undefined
        links.push({
          url,
          label,
          site: site || undefined,
          status: String(row.status || 'planned'),
          reason: String(row.reason || 'engine_interlink'),
          source: 'engine_graph',
        })
      }
    } catch {
      /* seo_interlinks missing / unreachable — registry still returns */
    }

    return NextResponse.json({
      totalLinks: LINKS.length,
      bySite,
      engineGraphCount,
      count: links.length,
      links,
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
