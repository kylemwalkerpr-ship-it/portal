/**
 * Master SEO Engine feed for Content Studio.
 *
 * Briefs and drafts used to see only the radar/GSC slice the UI happened to
 * forward. This module assembles the same inputs the Master Engine panel uses
 * (GSC, site health, LLM share-of-voice, cluster plans, knowledge) and turns
 * scoreMaster + masterEngineFixPlan into a prompt block Grok must write
 * against.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  masterEngineFixPlan,
  scoreMaster,
  type DerivedFeatures,
  type MasterEngineInput,
  type MasterEngineReport,
} from '@/lib/seoFactory/masterEngine'
import { attachSiteHealthFacts } from '@/lib/seoFactory/siteHealthSnapshot'
import { loadLlmVisibilityEvidence } from '@/lib/seoEngine/llmVisibility'
import { computeGscMix, type GscMix, type GscMixQueryRow } from '@/lib/seoFactory/gscMix'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'

export interface MasterEngineFeedRequest {
  topic: string
  primaryKeyword?: string
  region?: string
  contentType?: string
  title?: string
  canonicalUrl?: string
  gsc?: MasterEngineInput['gsc']
  competingUrls?: string[]
}

export interface MasterEngineFeed {
  ok: boolean
  intent: string
  composite: number | null
  grade: string | null
  recommendationCount: number
  promptBlock: string
  /** Eligible vs junk vs deep-tail GSC mix — the studio cannot hide behind a
   *  0.3% CTR when the eligible position is deep and junk share is high. */
  gscMix: GscMix
  lineage: Record<string, unknown>
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n * 100)}`
}

async function loadMatchingKnowledge(term: string, region?: string): Promise<string[]> {
  const q = term.trim()
  if (q.length < 3) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_knowledge')
      .select('title,ai_summary,summary,url,countries')
      .order('fetched_at', { ascending: false })
      .limit(40)
    const rows = (data as Array<Record<string, unknown>>) || []
    const needle = q.toLowerCase()
    const regionKey = String(region || '').toUpperCase()
    return rows
      .filter((r) => {
        const blob = `${r.title || ''} ${r.ai_summary || ''} ${r.summary || ''}`.toLowerCase()
        if (!blob.includes(needle.split(/\s+/)[0] || needle)) return false
        if (!regionKey) return true
        const countries = Array.isArray(r.countries) ? r.countries.map(String) : []
        return countries.length === 0 || countries.some((c) => c.toUpperCase() === regionKey)
      })
      .slice(0, 4)
      .map((r) => {
        const title = String(r.title || 'untitled')
        const summary = String(r.ai_summary || r.summary || '').replace(/\s+/g, ' ').slice(0, 160)
        return summary ? `${title} — ${summary}` : title
      })
  } catch {
    return []
  }
}

async function loadMatchingCluster(term: string, region?: string): Promise<string | null> {
  const q = term.trim()
  if (q.length < 3) return null
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_cluster_plans')
      .select('primary_term,stage,country,intent,opportunity_score,rationale,compliance_score')
      .order('opportunity_score', { ascending: false })
      .limit(40)
    const rows = (data as Array<Record<string, unknown>>) || []
    const needle = q.toLowerCase()
    const regionKey = String(region || '').toUpperCase()
    const hit = rows.find((r) => {
      const primary = String(r.primary_term || '').toLowerCase()
      if (!primary) return false
      const regionOk = !regionKey || String(r.country || '').toUpperCase() === regionKey
      return regionOk && (primary.includes(needle) || needle.includes(primary))
    })
    if (!hit) return null
    const bits = [
      String(hit.primary_term || ''),
      hit.stage ? `stage ${hit.stage}` : '',
      hit.country ? String(hit.country) : '',
      hit.intent ? `intent ${hit.intent}` : '',
      hit.opportunity_score != null ? `opp ${Math.round(Number(hit.opportunity_score))}` : '',
      hit.compliance_score != null ? `compliance ${Math.round(Number(hit.compliance_score))}` : '',
    ].filter(Boolean)
    const rationale = String(hit.rationale || '').replace(/\s+/g, ' ').slice(0, 180)
    return rationale ? `${bits.join(' · ')} — ${rationale}` : bits.join(' · ')
  } catch {
    return null
  }
}

export function renderMasterEnginePromptBlock(
  report: MasterEngineReport,
  extras: { knowledge?: string[]; cluster?: string | null } = {},
): string {
  const recs = (report.recommendations || []).filter((r) => r.open !== false).slice(0, 6)
  const risks = (report.risks || []).slice(0, 4)
  const derived: Partial<DerivedFeatures> = report.derived || {}
  const lines = [
    'MASTER SEO ENGINE — write the brief/draft so it closes THESE gaps. Do not invent scores; only act on the lines below.',
    `- Intent ${report.intentLabel || report.intent}${report.composite != null ? ` · composite ${report.composite}/100` : ''}${report.grade ? ` (${report.grade})` : ''}${report.coverage?.pct != null ? ` · signal coverage ${report.coverage.pct}%` : ''}`,
  ]
  const weak = Object.entries(report.subsystems || {})
    .filter(([, v]) => v && v.score != null && v.score < 0.55)
    .sort((a, b) => (a[1].score ?? 1) - (b[1].score ?? 1))
    .slice(0, 5)
    .map(([id, v]) => `${id} ${fmtPct(v.score)}`)
  if (weak.length) lines.push(`- Weak subsystems: ${weak.join(' · ')}`)
  // GSC push-through Phase B: surface the eligible vs junk mix so Autopilot
  // and briefs cannot hide behind a site-wide 0.3% CTR.
  const gscMix = report.gscMix
  if (gscMix && (gscMix.eligible.impressions > 0 || gscMix.junk.share > 0 || gscMix.strikeDistance.length)) {
    lines.push(
      `- GSC mix: eligible position ${gscMix.eligible.position.toFixed(1)} · junk share ${Math.round(gscMix.junk.share * 100)}% · ${gscMix.strikeDistance.length} strike-distance URL(s)`,
    )
  }
  const gapBits = [
    derived.competitiveGap != null ? `competitive gap ${fmtPct(derived.competitiveGap)}` : '',
    derived.contentSuperiority != null ? `content superiority ${fmtPct(derived.contentSuperiority)}` : '',
    derived.authorityGap != null ? `authority gap ${fmtPct(derived.authorityGap)}` : '',
    derived.trustAdvantage != null ? `trust ${fmtPct(derived.trustAdvantage)}` : '',
  ].filter(Boolean)
  if (gapBits.length) lines.push(`- Derived: ${gapBits.join(' · ')}`)
  if (recs.length) {
    lines.push('- Prioritized actions (fold each into H2s / FAQ / schema / citations):')
    for (const r of recs) {
      lines.push(`  · [${r.subsystem}] ${r.action}`)
    }
  }
  if (risks.length) {
    lines.push('- Risks to avoid:')
    for (const r of risks) lines.push(`  · ${r.message}`)
  }
  if (report.prediction?.top10Probability != null) {
    lines.push(
      `- Forecast: top-10 probability ${Math.round(report.prediction.top10Probability * 100)}%` +
        (report.prediction.expectedLift != null ? ` · expected lift ${Math.round(report.prediction.expectedLift * 100)}%` : ''),
    )
  }
  if (extras.cluster) lines.push(`- Matching cluster plan: ${extras.cluster}`)
  if (extras.knowledge?.length) {
    lines.push('- Fresh knowledge (cite only if it matches an official source):')
    for (const k of extras.knowledge) lines.push(`  · ${k}`)
  }
  lines.push(
    '- Engine rule: answer-first opening, statute/official source where YMYL, named-author E-E-A-T, FAQ + Article JSON-LD, ≥2 estate interlinks, no invented fees or timelines.',
  )
  return lines.join('\n')
}

/**
 * Load the per-query GSC breakdown the same way the radar already does —
 * live `topQueries` when GSC is configured, else the committed snapshot — and
 * map it to `{ term, impressions, clicks, position }` queryRows.
 *
 * Production callers (generate-stream, suggest-brief, jobToMasterInput) pass
 * aggregates only or nothing, so without this the classifier in computeGscMix
 * never sees a single row: 10.3K impressions at pos 33 get scored as eligible
 * volume and the studio can still hide behind a site-wide 0.3% CTR. No new
 * table, no new GSC client — reuses loadGscSnapshot / gscAnalytics.
 */
async function hydrateGscQueryRows(
  existing?: GscMixQueryRow[],
): Promise<GscMixQueryRow[]> {
  if (existing && existing.length) return existing

  try {
    const live = await fetchSiteSearchAnalytics(28)
    if (live.configured && live.topQueries.length) {
      return live.topQueries.map((q) => ({
        term: q.key,
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
        position: q.position,
      }))
    }
  } catch {
    /* fall through to snapshot */
  }

  try {
    const snap = await loadGscSnapshot()
    return (snap.topQueries ?? []).map((q) => ({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
    }))
  } catch {
    return []
  }
}

export async function assembleMasterEngineFeed(
  req: MasterEngineFeedRequest,
): Promise<MasterEngineFeed> {
  const topic = String(req.topic || '').trim()
  const primaryKeyword = String(req.primaryKeyword || topic).trim()
  const empty: MasterEngineFeed = {
    ok: false,
    intent: 'unknown',
    composite: null,
    grade: null,
    recommendationCount: 0,
    promptBlock: '',
    gscMix: computeGscMix({
      impressions: req.gsc?.impressions,
      clicks: req.gsc?.clicks,
      ctr: req.gsc?.ctr,
      position: req.gsc?.position,
      queries: req.gsc?.queryRows,
    }),
    lineage: { modelVersion: 'seo-master-engine-feed-v1', ok: false },
  }
  if (!topic) return empty

  try {
    // GSC push-through Phase B punch 1: hydrate the per-query breakdown inside
    // the feed so the classifier actually sees rows in the real write path.
    const queryRows = await hydrateGscQueryRows(req.gsc?.queryRows as GscMixQueryRow[] | undefined)
    const hydratedMix = queryRows.length
      ? computeGscMix({
          queryRows,
          impressions: req.gsc?.impressions,
          clicks: req.gsc?.clicks,
          ctr: req.gsc?.ctr,
          position: req.gsc?.position,
        })
      : null
    const gsc = queryRows.length
      ? {
          ...req.gsc,
          queryRows,
          // Keep aggregate fields so existing null-checks still fire; backfill
          // from the re-aggregated totals when the caller sent no aggregate.
          impressions: req.gsc?.impressions ?? hydratedMix?.totals.impressions ?? 0,
          clicks: req.gsc?.clicks ?? hydratedMix?.totals.clicks ?? 0,
          ctr: req.gsc?.ctr ?? hydratedMix?.totals.ctr ?? 0,
          position: req.gsc?.position ?? hydratedMix?.totals.position ?? 0,
        }
      : req.gsc

    let input: MasterEngineInput = {
      topic,
      primaryKeyword,
      region: req.region,
      contentType: req.contentType,
      title: req.title || topic,
      canonicalUrl: req.canonicalUrl,
      liveUrl: req.canonicalUrl,
      gsc,
      competingUrls: req.competingUrls,
    }
    const [withHealth, llmV, knowledge, cluster, ahrefs] = await Promise.all([
      attachSiteHealthFacts(input, req.canonicalUrl).catch(() => input),
      loadLlmVisibilityEvidence(primaryKeyword).catch(() => null),
      loadMatchingKnowledge(primaryKeyword, req.region),
      loadMatchingCluster(primaryKeyword, req.region),
      import('@/lib/seoEngine/ahrefsAudit').then((m) => m.loadLatestAhrefsSnapshot()).catch(() => null),
    ])
    input = withHealth
    if (llmV) input.llmVisibility = llmV
    if (ahrefs) {
      const count = (id: string) => ahrefs.issues.find((i) => i.issueId === id)?.count ?? null
      input.ahrefs = {
        healthScore: ahrefs.healthScore,
        csOpen: ahrefs.csOpen,
        csOpenTypes: ahrefs.csOpenTypes,
        totalOpen: ahrefs.totalOpen,
        ogIncomplete: count('open_graph_tags_incomplete'),
        schemaErrors: count('structured_data_has_schema_org_validation_error'),
        orphans: count('orphan_page'),
        broken4xx: count('4xx_page') ?? count('404_page'),
        indexNowBacklog: count('pages_to_submit_to_indexnow'),
      }
    }

    const report = scoreMaster(input)
    const fix = masterEngineFixPlan(input)
    const promptBlock = [
      renderMasterEnginePromptBlock(report, { knowledge, cluster }),
      fix.promptBlock,
    ].filter(Boolean).join('\n\n')

    return {
      ok: true,
      intent: report.intent,
      composite: report.composite,
      grade: report.grade,
      recommendationCount: (report.recommendations || []).filter((r) => r.open !== false).length,
      promptBlock,
      gscMix: report.gscMix,
      lineage: {
        modelVersion: 'seo-master-engine-feed-v1',
        intent: report.intent,
        intentLabel: report.intentLabel,
        composite: report.composite,
        grade: report.grade,
        coveragePct: report.coverage?.pct ?? null,
        recommendationCount: (report.recommendations || []).filter((r) => r.open !== false).length,
        riskCount: report.risks?.length ?? 0,
        usedLearned: Boolean(report.adaptation?.usedLearned),
        generatedAt: report.generatedAt,
      },
    }
  } catch (err) {
    console.warn(
      '[masterEngineFeed] assemble failed — studio continues without engine block',
      err instanceof Error ? err.message : err,
    )
    return empty
  }
}
