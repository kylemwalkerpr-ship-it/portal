import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { latestEngineRuns, DEFAULT_SOURCES } from '@/lib/seoEngine/knowledge'
import { loadVisibilityFeed } from '@/lib/seoEngine/llmVisibility'
import { loadGateRuns } from '@/lib/seoEngine/gate'
import { loadRankingScores } from '@/lib/seoEngine/rankingModel'

/**
 * GET /api/seo-engine/status
 * Engine health for the Master Planner dashboard:
 *   - lifecycle cells seeded
 *   - knowledge items stored (by kind)
 *   - cluster plans by status
 *   - recent engine runs (audit trail)
 *   - source registry with enabled flags
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createSupabaseAdminClient()
    const [
      cells, knowledge, plans, runs, config, visibility, gate, ranking,
      linksPlanned, linksApplied, rankCount,
    ] = await Promise.all([
      supabase.from('seo_lifecycle_stages').select('id', { count: 'exact', head: true }),
      supabase.from('seo_knowledge').select('id', { count: 'exact', head: true }),
      supabase.from('seo_cluster_plans').select('id', { count: 'exact', head: true }),
      latestEngineRuns(8),
      supabase.from('seo_engine_config').select('key,value'),
      loadVisibilityFeed(50),
      loadGateRuns(50),
      loadRankingScores({ limit: 3 }),
      supabase.from('seo_interlinks').select('id', { count: 'exact', head: true }).eq('status', 'planned'),
      supabase.from('seo_interlinks').select('id', { count: 'exact', head: true }).eq('status', 'applied'),
      supabase.from('seo_ranking_scores').select('id', { count: 'exact', head: true }),
    ])

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      lifecycle: { seededCells: cells.count ?? 0 },
      knowledge: { total: knowledge.count ?? 0 },
      plans: { total: plans.count ?? 0 },
      interlinks: { planned: linksPlanned.count ?? 0, applied: linksApplied.count ?? 0 },
      llmVisibility: { total: visibility.total, cited: visibility.cited, shareOfVoice: visibility.shareOfVoice },
      rankingModel: {
        computed: rankCount.count ?? ranking.length,
        latestTotal: ranking[0] ? Math.round(Number(ranking[0].total) || 0) : null,
        latestTopic: ranking[0] ? String(ranking[0].topic) : null,
      },
      gate: { runs: gate.runs.length, passRate: gate.passRate, avgScore: gate.avgScore },
      runs: runs as Array<Record<string, unknown>>,
      sources: DEFAULT_SOURCES.map((s) => ({ id: s.id, label: s.label, kind: s.kind, countries: s.countries })),
      config: Object.fromEntries((config.data || []).map((c) => [c.key, c.value])),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'status failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
