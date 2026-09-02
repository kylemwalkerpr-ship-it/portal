import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient, isServiceRoleAchieved } from '@/lib/supabase'
import { latestEngineRuns, DEFAULT_SOURCES } from '@/lib/seoEngine/knowledge'
import { loadRankingScores } from '@/lib/seoEngine/rankingModel'
import { reportSpecCoverage } from '@/lib/seoEngine/specCoverage'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

type Admin = ReturnType<typeof createSupabaseAdminClient>

async function countExact(
  supabase: Admin,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply?: (q: any) => any,
): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select('id', { count: 'exact', head: true })
    if (apply) q = apply(q)
    const { count } = await q
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

async function latestRow(
  supabase: Admin,
  table: string,
  cols: string,
  order: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select(cols)
      .order(order, { ascending: false })
      .limit(1)
    if (error) return null
    return (((data as unknown) as Array<Record<string, unknown>>) || [])[0] ?? null
  } catch {
    return null
  }
}

/**
 * GET /api/seo-engine/status
 * Live desk health: exact table counts (not list-window lengths) plus the
 * newest row on each engine table so the studio can show last-movement age.
 */
export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE })

    const supabase = createSupabaseAdminClient()
    const [
      cells, knowledge, plans, runs, config,
      linksPlanned, linksApplied, rankCount,
      llmPromptTotal, llmPromptCited, llmAllTotal, llmAllCited,
      gateTotal, gatePassed, recentGates,
      ranking,
      latestKnowledge, latestPlan, latestLink, latestLlm, latestGate,
    ] = await Promise.all([
      countExact(supabase, 'seo_lifecycle_stages'),
      countExact(supabase, 'seo_knowledge'),
      countExact(supabase, 'seo_cluster_plans'),
      latestEngineRuns(8),
      supabase.from('seo_engine_config').select('key,value'),
      countExact(supabase, 'seo_interlinks', (q) => q.eq('status', 'planned')),
      countExact(supabase, 'seo_interlinks', (q) => q.eq('status', 'applied')),
      countExact(supabase, 'seo_ranking_scores'),
      // Engine-outage audits (flagged audit_failed) are NOT "not cited"
      // outcomes — exclude them from the headline share-of-voice.
      countExact(supabase, 'seo_llm_visibility', (q) => q.eq('fan_out', false).not('flags', 'ov', `{audit_failed}`)),
      countExact(supabase, 'seo_llm_visibility', (q) => q.eq('fan_out', false).eq('cited', true).not('flags', 'ov', `{audit_failed}`)),
      countExact(supabase, 'seo_llm_visibility'),
      countExact(supabase, 'seo_llm_visibility', (q) => q.eq('cited', true).not('flags', 'ov', `{audit_failed}`)),
      countExact(supabase, 'seo_gate_runs'),
      countExact(supabase, 'seo_gate_runs', (q) => q.eq('passed', true)),
      supabase.from('seo_gate_runs').select('score,passed').order('created_at', { ascending: false }).limit(20),
      loadRankingScores({ limit: 1 }),
      latestRow(supabase, 'seo_knowledge', 'id,title,kind,fetched_at', 'fetched_at'),
      latestRow(supabase, 'seo_cluster_plans', 'id,primary_term,status,created_at', 'created_at'),
      latestRow(supabase, 'seo_interlinks', 'id,status,source_slug,created_at', 'created_at'),
      latestRow(supabase, 'seo_llm_visibility', 'id,query,cited,created_at', 'created_at'),
      latestRow(supabase, 'seo_gate_runs', 'id,score,passed,created_at', 'created_at'),
    ])

    const gateRows = ((recentGates.data as Array<{ score?: number; passed?: boolean }>) || [])
    const gateScores = gateRows.map((r) => Number(r.score) || 0)
    const llmTotal = llmPromptTotal || llmAllTotal
    const llmCited = llmPromptTotal ? llmPromptCited : llmAllCited

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      authMode: isServiceRoleAchieved() ? 'service-role' : 'degraded-anon',
      lifecycle: { seededCells: cells },
      knowledge: {
        total: knowledge,
        latestTitle: latestKnowledge ? String(latestKnowledge.title || '') : null,
        latestAt: latestKnowledge ? String(latestKnowledge.fetched_at || '') : null,
      },
      plans: {
        total: plans,
        latestTerm: latestPlan ? String(latestPlan.primary_term || '') : null,
        latestAt: latestPlan ? String(latestPlan.created_at || '') : null,
      },
      interlinks: {
        planned: linksPlanned,
        applied: linksApplied,
        latestAt: latestLink ? String(latestLink.created_at || '') : null,
      },
      llmVisibility: {
        total: llmTotal,
        cited: llmCited,
        shareOfVoice: llmTotal ? Math.round((llmCited / llmTotal) * 100) : 0,
        latestQuery: latestLlm ? String(latestLlm.query || '') : null,
        latestAt: latestLlm ? String(latestLlm.created_at || '') : null,
      },
      rankingModel: {
        computed: rankCount,
        latestTotal: ranking[0] ? Math.round(Number(ranking[0].total) || 0) : null,
        latestTopic: ranking[0] ? String(ranking[0].topic) : null,
        latestAt: ranking[0] ? String((ranking[0] as { created_at?: string }).created_at || '') : null,
      },
      gate: {
        runs: gateTotal,
        passed: gatePassed,
        passRate: gateTotal ? Math.round((gatePassed / gateTotal) * 100) : 0,
        avgScore: gateScores.length ? Math.round(gateScores.reduce((a, b) => a + b, 0) / gateScores.length) : 0,
        latestAt: latestGate ? String(latestGate.created_at || '') : null,
      },
      runs: runs as Array<Record<string, unknown>>,
      specCoverage: reportSpecCoverage(),
      ahrefs: await import('@/lib/seoEngine/ahrefsAudit').then((m) => m.loadLatestAhrefsSnapshot()).catch(() => null),
      sources: DEFAULT_SOURCES.map((s) => ({ id: s.id, label: s.label, kind: s.kind, countries: s.countries })),
      config: Object.fromEntries((config.data || []).map((c) => [c.key, c.value])),
    }, { headers: NO_STORE })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'status failed' },
      { status: 500, headers: NO_STORE },
    )
  }
}

export const dynamic = 'force-dynamic'
