import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { scoreClusterCoverage, suggestInternalLinks } from '@/lib/seoFactory/coverageLinks'

/**
 * POST /api/content-studio/coverage/suggest
 * Coverage vs cluster + internal-link opportunities (exclude self + existing links).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const content = String(body.content || body.bodyText || '')
    const title = String(body.title || '')
    const url = String(body.url || body.canonicalUrl || '')
    const clusterKeywords = Array.isArray(body.clusterKeywords) ? body.clusterKeywords.map(String) : []
    const requiredEntities = Array.isArray(body.requiredEntities) ? body.requiredEntities.map(String) : undefined
    const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt : undefined

    const coverage = scoreClusterCoverage({
      title,
      bodyText: content,
      clusterKeywords,
      requiredEntities,
      updatedAt,
    })

    const { data } = await auth.db
      .from('content_jobs')
      .select('title, canonical_url, primary_keyword, content, topic')
      .not('canonical_url', 'is', null)
      .limit(80)

    const corpus = (data || [])
      .map((j: Record<string, unknown>) => ({
        url: String(j.canonical_url || ''),
        title: String(j.title || j.topic || ''),
        bodyText: String(j.content || '').slice(0, 2000),
        primaryKeyword: String(j.primary_keyword || ''),
      }))
      .filter((p: { url: string }) => /^https?:\/\//i.test(p.url))

    const suggestions = suggestInternalLinks({
      currentUrl: url,
      currentTitle: title,
      currentBody: content,
      corpus,
      limit: Math.min(10, Number(body.limit) || 6),
    })

    return NextResponse.json({ ok: true, coverage, suggestions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'coverage suggest failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
