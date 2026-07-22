import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getGscAccess } from '@/lib/gscAuth'
import snapshot from '@/data/gsc/snapshot.json'
import { resolveOwner } from '@/lib/seoFactory/ownership'

/**
 * GET /api/seo-factory/opportunities
 * Ranked GSC opportunities for the factory (live if possible, else snapshot).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    type Opp = {
      term: string
      impressions: number
      clicks: number
      ctr: number
      position: number
      score: number
      action: 'title_rewrite' | 'expand_or_build' | 'ignore'
      suggestedContentType: string
      ownerHint: ReturnType<typeof resolveOwner> | null
    }

    let queries: Array<{ term: string; impressions: number; clicks: number; ctr: number; position: number }> = []
    let source: 'live' | 'snapshot' = 'snapshot'

    const access = await getGscAccess()
    if (access?.accessToken && access.siteUrl) {
      try {
        const end = new Date().toISOString().slice(0, 10)
        const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)
        const res = await fetch(
          `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${access.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              startDate: start,
              endDate: end,
              dimensions: ['query'],
              rowLimit: 100,
            }),
          },
        )
        if (res.ok) {
          const json = (await res.json()) as {
            rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number; ctr?: number; position?: number }>
          }
          queries = (json.rows || [])
            .map((r) => ({
              term: (r.keys?.[0] || '').trim(),
              impressions: r.impressions || 0,
              clicks: r.clicks || 0,
              ctr: r.ctr || 0,
              position: r.position || 100,
            }))
            .filter((q) => q.term && q.impressions >= 5)
          source = 'live'
        }
      } catch {
        /* fall through */
      }
    }

    if (!queries.length) {
      const snap = snapshot as {
        topQueries: Array<{ term: string; impressions: number; clicks: number; ctr: number; position: number }>
        opportunities?: { highImpressionLowCtr?: typeof queries; highImpressionDeepRank?: typeof queries }
      }
      queries = [
        ...(snap.opportunities?.highImpressionLowCtr || []),
        ...(snap.opportunities?.highImpressionDeepRank || []),
        ...(snap.topQueries || []),
      ]
      // dedupe
      const seen = new Set<string>()
      queries = queries.filter((q) => {
        if (!q.term || seen.has(q.term)) return false
        seen.add(q.term)
        return q.impressions >= 5
      })
    }

    const brand = /yousafe|yousafeconsultancy/
    const opportunities: Opp[] = queries
      .filter((q) => !brand.test(q.term))
      .map((q) => {
        const posW = q.position <= 20 ? 1.4 : q.position <= 40 ? 1.1 : 0.9
        const ctrGap = 1 - Math.min(q.ctr / 0.05, 1)
        const score = q.impressions * ctrGap * posW
        let action: Opp['action'] = 'expand_or_build'
        if (q.position >= 4 && q.position <= 20 && q.ctr < 0.03) action = 'title_rewrite'
        if (q.impressions < 10) action = 'ignore'
        const suggestedContentType =
          /housing|apartment|dorm|rent/i.test(q.term)
            ? 'legal_guide'
            : /dependent|spouse|family/i.test(q.term)
              ? 'legal_guide'
              : 'legal_guide'
        const ownerHint = resolveOwner({
          primaryKeyword: q.term,
          contentType: suggestedContentType,
          region: /uk|british/i.test(q.term) ? 'UK' : /canada|canadian|pgwp/i.test(q.term) ? 'CA' : /485|pte|australia/i.test(q.term) ? 'AU' : 'US',
        })
        return { ...q, score, action, suggestedContentType, ownerHint }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)

    return NextResponse.json({
      source,
      siteUrl: access?.siteUrl || process.env.GSC_SITE_URL,
      count: opportunities.length,
      opportunities,
    })
  } catch (err) {
    console.error('[seo-factory/opportunities]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}
