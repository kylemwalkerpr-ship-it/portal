import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadUbersuggestConfig } from '@/lib/seoEngine/ubersuggest'
import { ubersuggestSignalsToDiscover } from '@/lib/seoEngine/ubersuggestDiscover'
import { loadShippedCoverage } from '@/lib/seoEngine/researchDemand'

export const runtime = 'nodejs'
export const maxDuration = 180
export const dynamic = 'force-dynamic'

async function opportunitiesFromCache(excludeTopics: string[] = []) {
  const [cfg, shipped] = await Promise.all([
    loadUbersuggestConfig(),
    loadShippedCoverage(200).catch(() => []),
  ])
  const opportunities = ubersuggestSignalsToDiscover(cfg.lastGoodSignals || [], {
    shippedKeywords: shipped.map((s) => s.primaryKeyword || s.title).filter(Boolean),
    excludeTopics,
    limit: 32,
  })
  return {
    connected: cfg.enabled,
    lastGoodAt: cfg.lastGoodAt ?? null,
    lastError: cfg.lastError ?? null,
    source: (cfg.lastGoodSignals || []).length ? 'cache' : 'empty',
    opportunities,
  }
}

/**
 * GET  /api/content-studio/ubersuggest/opportunities
 * POST /api/content-studio/ubersuggest/opportunities  { refresh?: true, excludeTopics?: string[] }
 *
 * Discover briefs from Ubersuggest last-good demand. Does not require a
 * planner run. POST refresh pulls live MCP (skip-on-fail → last-good).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const exclude = request.nextUrl.searchParams.getAll('exclude')
    const payload = await opportunitiesFromCache(exclude)
    return NextResponse.json({ ok: true, ...payload })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ubersuggest opportunities failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = (await request.json().catch(() => ({}))) as { refresh?: boolean; excludeTopics?: string[] }
    const exclude = Array.isArray(body.excludeTopics) ? body.excludeTopics.map(String) : []
    if (body.refresh) {
      try {
        const { pullUbersuggestSignals } = await import('@/lib/seoEngine/ubersuggest')
        await pullUbersuggestSignals()
      } catch {
        /* skip-on-fail — last-good (if any) is still returned */
      }
    }
    const payload = await opportunitiesFromCache(exclude)
    return NextResponse.json({
      ok: true,
      ...payload,
      source: body.refresh ? (payload.opportunities.length ? 'live-or-cache' : 'empty') : payload.source,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ubersuggest opportunities failed' }, { status: 500 })
  }
}
