import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  DEFAULT_OPPORTUNITY_WEIGHTS,
  scoreOpportunityList,
  type OpportunityEvidence,
  type OpportunityWeights,
} from '@/lib/seoFactory/opportunityScore'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'

/**
 * GET/POST /api/content-studio/opportunities/score
 * First-party scores from seo_gsc_rows. No invented volume/KD/CPC.
 */
async function loadRows(db: { from: (t: string) => any }, siteUrl: string | null, range: { startDate: string; endDate: string }, limit: number) {
  let q = db
    .from('seo_gsc_rows')
    .select('query, page, clicks, impressions, ctr, position')
    .eq('start_date', range.startDate)
    .eq('end_date', range.endDate)
    .order('impressions', { ascending: false })
    .limit(limit)
  if (siteUrl) q = q.eq('site_url', siteUrl)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data || []) as Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }>
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const sp = request.nextUrl.searchParams
    const days = Number(sp.get('days') || '90')
    const range = resolveGscDayWindow(days)
    const siteUrl = sp.get('siteUrl') || process.env.GSC_SITE_URL || null
    const limit = Math.min(200, Math.max(10, Number(sp.get('limit') || '50')))
    const raw = await loadRows(auth.db, siteUrl, range, limit)
    const evidence: OpportunityEvidence[] = raw.map((r) => ({
      query: r.query,
      page: r.page,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      position: r.position,
    }))
    const opportunities = scoreOpportunityList(evidence)
    return NextResponse.json({
      ok: true,
      weights: DEFAULT_OPPORTUNITY_WEIGHTS,
      range,
      count: opportunities.length,
      opportunities,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'opportunity score failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const weights = { ...DEFAULT_OPPORTUNITY_WEIGHTS, ...(body.weights && typeof body.weights === 'object' ? body.weights as Partial<OpportunityWeights> : {}) }
    const rows = Array.isArray(body.rows) ? (body.rows as OpportunityEvidence[]) : null
    if (rows) {
      const opportunities = scoreOpportunityList(rows, weights as OpportunityWeights)
      return NextResponse.json({ ok: true, weights, count: opportunities.length, opportunities })
    }
    return GET(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'opportunity score failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
