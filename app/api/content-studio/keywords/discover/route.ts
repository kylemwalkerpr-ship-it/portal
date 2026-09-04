import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { discoverKeywords, normalizeKeyword } from '@/lib/seoFactory/keywordDiscover'

/**
 * POST /api/content-studio/keywords/discover
 * $0 discovery: GSC rows + public Google suggestions + manual seed templates.
 * Never returns volume / CPC / KD.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const seed = String(body.seed || body.topic || '').trim()
    if (!seed) {
      return NextResponse.json({ error: 'seed is required' }, { status: 400 })
    }
    const includeAlphabet = Boolean(body.includeAlphabet)
    const modifiers = Array.isArray(body.modifiers) ? body.modifiers.map(String) : []
    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl : process.env.GSC_SITE_URL || null
    const limit = Math.min(200, Math.max(10, Number(body.limit) || 80))

    let gscQueries: string[] = []
    try {
      let q = auth.db.from('seo_gsc_rows').select('query').limit(2000)
      if (siteUrl) q = q.eq('site_url', siteUrl)
      const { data } = await q
      gscQueries = [...new Set((data || []).map((r: { query?: string }) => String(r.query || '')).filter(Boolean))]
    } catch {
      gscQueries = []
    }

    const discovered = await discoverKeywords({
      seed,
      gscQueries,
      modifiers,
      includeAlphabet,
    })
    const needle = normalizeKeyword(seed)
    const ranked = discovered.candidates
      .filter((c) => !needle || c.normalized.includes(needle) || needle.split(' ').every((w) => c.normalized.includes(w)))
      .slice(0, limit)

    return NextResponse.json({
      ok: true,
      seed,
      count: ranked.length,
      suggestOk: discovered.suggestOk,
      suggestCalls: discovered.suggestCalls,
      candidates: ranked.map((c) => ({
        keyword: c.keyword,
        normalized: c.normalized,
        source: c.source,
        sources: c.sources,
        seed: c.seed,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'keyword discovery failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
