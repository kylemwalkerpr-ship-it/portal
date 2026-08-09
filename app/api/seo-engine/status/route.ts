import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { latestEngineRuns, DEFAULT_SOURCES } from '@/lib/seoEngine/knowledge'
import { loadInterlinkGraph } from '@/lib/seoEngine/interlink'
import { loadVisibilityFeed } from '@/lib/seoEngine/llmVisibility'
import { loadGateRuns } from '@/lib/seoEngine/gate'

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
    const [cells, knowledge, plans, runs, config, interlink, visibility, gate] = await Promise.all([
      supabase.from('seo_lifecycle_stages').select('id', { count: 'exact', head: true }),
      supabase.from('seo_knowledge').select('kind', { count: 'exact', head: true }),
      supabase.from('seo_cluster_plans').select('status', { count: 'exact', head: true }),
      latestEngineRuns(8),
      supabase.from('seo_engine_config').select('key,value'),
      loadInterlinkGraph(200),
      loadVisibilityFeed(200),
      loadGateRuns(200),
    ])

    const kinds: Record<string, number> = {}
    for (const r of knowledge.data || []) kinds[r.kind] = (kinds[r.kind] || 0) + 1
    const statuses: Record<string, number> = {}
    for (const p of plans.data || []) statuses[p.status] = (statuses[p.status] || 0) + 1

    return NextResponse.json({
      ok: true,
      lifecycle: { seededCells: cells.count ?? 0 },
      knowledge: { total: knowledge.count ?? 0, byKind: kinds },
      plans: { total: plans.count ?? 0, byStatus: statuses },
      interlinks: { planned: interlink.planned, applied: interlink.applied, byReason: interlink.byReason },
      llmVisibility: { total: visibility.total, cited: visibility.cited, shareOfVoice: visibility.shareOfVoice, byStage: visibility.byStage },
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
