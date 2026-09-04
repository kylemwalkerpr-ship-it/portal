import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { discoverKeywords, type KeywordCandidate } from '@/lib/seoFactory/keywordDiscover'
import { DEFAULT_CLUSTERING_CONFIG, groupKeywords, type ClusteringConfig } from '@/lib/seoFactory/keywordGrouping'

/**
 * POST /api/content-studio/keywords/cluster
 * Deterministic Jaccard clusters. No embeddings, no paid APIs.
 * Body: { candidates?: string[] | KeywordCandidate[], seed?: string, config?: Partial<ClusteringConfig> }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const cfg = { ...DEFAULT_CLUSTERING_CONFIG, ...(body.config && typeof body.config === 'object' ? body.config as Partial<ClusteringConfig> : {}) }
    let candidates: KeywordCandidate[] = []
    if (Array.isArray(body.candidates) && body.candidates.length) {
      candidates = body.candidates.map((raw) => {
        if (typeof raw === 'string') {
          const keyword = raw.trim()
          const normalized = keyword.toLowerCase()
          return { id: `kw_${normalized.replace(/\s+/g, '_')}`, keyword, normalized, source: 'manual' as const, sources: ['manual' as const] }
        }
        const c = raw as KeywordCandidate
        return c
      }).filter((c) => c.normalized)
    } else if (typeof body.seed === 'string' && body.seed.trim()) {
      const discovered = await discoverKeywords({ seed: body.seed.trim() })
      candidates = discovered.candidates
    } else {
      return NextResponse.json({ error: 'candidates or seed is required' }, { status: 400 })
    }

    const clusters = groupKeywords(candidates, cfg)
    return NextResponse.json({
      ok: true,
      config: cfg,
      count: clusters.length,
      clusters: clusters.map((cl) => ({
        id: cl.id,
        label: cl.label,
        size: cl.keywords.length,
        entities: cl.entities,
        keywords: cl.keywords.map((k) => ({ keyword: k.keyword, source: k.source, sources: k.sources })),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'cluster failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
