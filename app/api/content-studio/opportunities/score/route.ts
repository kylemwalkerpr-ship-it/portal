import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  DEFAULT_OPPORTUNITY_WEIGHTS,
  type OpportunityEvidence,
  type OpportunityWeights,
} from '@/lib/seoFactory/opportunityScore'
import { scoreAndClassify } from '@/lib/seoFactory/opportunityAction'
import { resolveGscDayWindow } from '@/lib/gscAnalytics'
import { loadPersistedGscWindow } from '@/lib/seoFactory/gscRows'
import { isQualifiedGscDemandQuery } from '@/lib/seoFactory/queryNoise'

/**
 * GET/POST /api/content-studio/opportunities/score
 * First-party scores from seo_gsc_rows. No invented volume/KD/CPC.
 * Falls back to the latest stored window when the rolling UTC window is empty.
 *
 * P1 qualified visibility: this is an ACTION surface, so only qualified demand
 * may reach `scoreAndClassify`. Real-but-off-mission rows (campus housing /
 * dining / parking process queries with no immigration-document or
 * tenancy-legal anchor) are dropped here and stay observable in the
 * /api/content-studio/gsc/performance visibility summary instead of becoming
 * opportunities. `excludedNonActionable` reports how many rows were dropped so
 * the exclusion is auditable rather than silent.
 */
async function loadRows(db: { from: (t: string) => any }, siteUrl: string | null, range: { startDate: string; endDate: string }, limit: number) {
  const persisted = await loadPersistedGscWindow(db, {
    siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    limit,
    select: 'query, page, clicks, impressions, ctr, position',
  })
  return {
    rows: persisted.rows as Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }>,
    range: persisted.range,
    usedFallback: persisted.usedFallback,
  }
}

/**
 * GSC action boundary: the persisted read already drops malformed junk, and
 * this metric-aware guard additionally removes off-mission and deep-tail rows.
 * Only the four-class `qualified` bucket may reach opportunity scoring.
 */
function filterActionableOpportunityRows<T extends { query?: unknown; impressions?: unknown; clicks?: unknown; position?: unknown }>(
  rows: T[],
): { rows: T[]; excludedNonActionable: number } {
  const actionable = (rows || []).filter((row) => isQualifiedGscDemandQuery(String(row?.query || ''), {
    impressions: Number(row?.impressions) || 0,
    clicks: Number(row?.clicks) || 0,
    position: Number(row?.position) || 0,
  }))
  return { rows: actionable, excludedNonActionable: (rows || []).length - actionable.length }
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
    const loaded = await loadRows(auth.db, siteUrl, range, limit)
    const { rows, excludedNonActionable } = filterActionableOpportunityRows(loaded.rows)
    const evidence: OpportunityEvidence[] = rows.map((r) => ({
      query: r.query,
      page: r.page,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      position: r.position,
    }))
    const opportunities = scoreAndClassify(evidence)
    return NextResponse.json({
      ok: true,
      weights: DEFAULT_OPPORTUNITY_WEIGHTS,
      range: { ...range, ...loaded.range },
      usedFallback: loaded.usedFallback,
      excludedNonActionable,
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
      const { rows: actionable, excludedNonActionable } = filterActionableOpportunityRows(
        rows as Array<OpportunityEvidence & { query?: unknown }>,
      )
      const opportunities = scoreAndClassify(actionable as OpportunityEvidence[], weights as OpportunityWeights)
      return NextResponse.json({
        ok: true,
        weights,
        excludedNonActionable,
        count: opportunities.length,
        opportunities,
      })
    }
    return GET(request)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'opportunity score failed'
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 })
  }
}
