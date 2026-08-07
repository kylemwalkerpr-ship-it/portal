import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  buildAllEnrichmentBriefs,
  buildTopicClusters,
  computeCrossDomainStats,
  DOMAIN_TOPOLOGY,
  type CrossDomainStats,
  type EnrichmentBrief,
} from '@/lib/seoFactory/crossDomainEnrich'
import type { SiteHealthScope } from '@/lib/seoFactory/siteHealth'

export const runtime = 'nodejs'

/**
 * POST /api/seo-factory/cross-domain — audit or enrich cross-domain interlinks
 *
 * Actions:
 *   - audit   → compute cross-domain stats (topic clusters, domain breakdown, orphans)
 *   - enrich  → build enrichment briefs for all pages
 *   - clusters → build topic clusters only
 *   - topology → return domain topology
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json().catch(() => ({})) as {
      action?: string
      scope?: SiteHealthScope
    }

    const scope: SiteHealthScope =
      body.scope === 'caseworks' || body.scope === 'yousafe-consultancy' || body.scope === 'portal'
        ? body.scope
        : 'all'

    const action = body.action || 'audit'

    switch (action) {
      case 'enrich': {
        const briefs = await buildAllEnrichmentBriefs(scope)
        const briefArray = [...briefs.entries()].map(([url, brief]) => ({
          url,
          ...brief,
        }))
        return NextResponse.json({
          ok: true,
          action: 'enrich',
          scope,
          totalPages: briefs.size,
          totalLinks: briefArray.reduce((sum, b) => sum + b.links.length, 0),
          briefs: briefArray.slice(0, 200), // limit response size
        })
      }

      case 'clusters': {
        const clusters = await buildTopicClusters(scope)
        return NextResponse.json({
          ok: true,
          action: 'clusters',
          scope,
          clusterCount: clusters.length,
          clusters: clusters.map((c) => ({
            label: c.label,
            keywords: c.keywords,
            pageCount: c.pages.length,
            domainDistribution: c.domainDistribution,
            cohesion: c.cohesion,
          })),
        })
      }

      case 'topology': {
        return NextResponse.json({
          ok: true,
          action: 'topology',
          domains: Object.entries(DOMAIN_TOPOLOGY).map(([host, node]) => ({
            host,
            label: node.label,
            contentTypes: node.contentTypes,
            adjacent: node.adjacent,
            cornerstoneWeight: node.cornerstoneWeight,
            baseUrl: node.baseUrl,
          })),
        })
      }

      case 'audit':
      default: {
        const stats = await computeCrossDomainStats(scope)
        return NextResponse.json({
          ok: true,
          action: 'audit',
          scope,
          stats,
        })
      }
    }
  } catch (err) {
    console.error('[seo-factory/cross-domain]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Cross-domain enrichment failed' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/seo-factory/cross-domain',
    actions: ['audit', 'enrich', 'clusters', 'topology'],
    scopes: ['all', 'caseworks', 'yousafe-consultancy', 'portal'],
  })
}
