import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { discoverKeywords } from '@/lib/seoFactory/keywordDiscover'
import { groupKeywords } from '@/lib/seoFactory/keywordGrouping'
import { scoreClusterCoverage, suggestInternalLinks } from '@/lib/seoFactory/coverageLinks'
import { scoreAndClassify } from '@/lib/seoFactory/opportunityAction'
import { detectCannibalization } from '@/lib/seoFactory/cannibalDetect'
import { buildSeoBrief, formatSeoBriefForWriter } from '@/lib/seoFactory/seoBrief'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'

/**
 * POST /api/content-studio/briefs/from-intel
 * Assemble a writer-ready SeoBrief from GSC + discover + cluster + coverage.
 * Does not call a paid SEO API. Optional existing draft in `content`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const seed = String(body.seed || body.topic || '').trim()
    if (!seed) return NextResponse.json({ error: 'seed is required' }, { status: 400 })

    const siteUrl = typeof body.siteUrl === 'string' ? body.siteUrl : process.env.GSC_SITE_URL || null
    const range = resolveGscDayWindow(90)
    let gscQueries: string[] = []
    let gscHits: Array<{ query: string; page: string; impressions: number; clicks: number; ctr: number; position: number }> = []
    try {
      let q = auth.db.from('seo_gsc_rows').select('query, page, impressions, clicks, ctr, position').eq('start_date', range.startDate).eq('end_date', range.endDate).limit(1500)
      if (siteUrl) q = q.eq('site_url', siteUrl)
      const { data } = await q
      gscHits = (data || []) as typeof gscHits
      gscQueries = [...new Set(gscHits.map((r) => r.query).filter(Boolean))]
    } catch { /* intel degrades without GSC rows */ }

    const discovered = await discoverKeywords({ seed, gscQueries })
    const clusters = groupKeywords(discovered.candidates)
    const content = String(body.content || '')
    const title = String(body.title || seed)
    const url = String(body.url || '')
    const coverage = content
      ? scoreClusterCoverage({ title, bodyText: content, clusterKeywords: clusters[0]?.keywords.map((k) => k.keyword) || [seed] })
      : undefined

    const { data: jobs } = await auth.db
      .from('content_jobs')
      .select('title, canonical_url, primary_keyword, content, topic')
      .not('canonical_url', 'is', null)
      .limit(60)
    const corpus = (jobs || []).map((j: Record<string, unknown>) => ({
      url: String(j.canonical_url || ''),
      title: String(j.title || j.topic || ''),
      bodyText: String(j.content || '').slice(0, 1500),
      primaryKeyword: String(j.primary_keyword || ''),
    })).filter((p: { url: string }) => /^https?:\/\//i.test(p.url))
    const links = suggestInternalLinks({ currentUrl: url, currentTitle: title, currentBody: content, corpus, limit: 6 })

    const matchingHits = gscHits.filter((h) => h.query.toLowerCase().includes(seed.toLowerCase()) || seed.toLowerCase().includes(h.query.toLowerCase().slice(0, 24)))
    const opportunity = matchingHits.length
      ? scoreAndClassify(matchingHits.map((h) => ({
        query: h.query,
        page: h.page,
        impressions: h.impressions,
        clicks: h.clicks,
        ctr: h.ctr,
        position: h.position,
        coverageScore: coverage?.score,
        relatedVariantCount: discovered.candidates.length,
        inSuggestions: discovered.candidates.some((c) => c.sources.includes('suggest')),
      })))[0]
      : undefined
    const cannibals = detectCannibalization({ hits: matchingHits.length ? matchingHits : gscHits.slice(0, 400) })

    const brief = buildSeoBrief({
      seed,
      candidates: discovered.candidates,
      clusters,
      coverage,
      opportunity,
      cannibals,
      links,
    })
    return NextResponse.json({
      ok: true,
      brief,
      writerContract: formatSeoBriefForWriter(brief),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'brief from intel failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
