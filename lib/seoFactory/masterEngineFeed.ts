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
  type LearnedWeightsInput,
  type MasterEngineInput,
  type MasterEngineReport,
} from '@/lib/seoFactory/masterEngine'
import { attachSiteHealthFacts } from '@/lib/seoFactory/siteHealthSnapshot'
import { loadLlmVisibilityEvidence } from '@/lib/seoEngine/llmVisibility'
import { computeGscMix, type GscMix, type GscMixQueryRow } from '@/lib/seoFactory/gscMix'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'
import {
  applyRewardNudges,
  learnWeights,
  type HistoricalOutcome,
} from '@/lib/seoFactory/masterEngineLearn'
import { buildOutcomeHistoryFromLiveGsc } from '@/lib/seoFactory/outcomeHistory'
import { scoreContentQuality, contentQualityComposite, buildContentLane1, type ContentQualityResult } from '@/lib/seoFactory/contentQuality'
import { scoreEeatTrust, eeatTrustComposite, buildEeatLane1, type EeatTrustResult } from '@/lib/seoFactory/eeatTrust'
import { scoreSemanticNlp, semanticNlpComposite, buildSemanticLane1, type SemanticNlpResult } from '@/lib/seoFactory/semanticNlp'
import { buildSpecialistPromptBlock, loadOpenSignalsForTopic, type SpecialistSignal } from '@/lib/seoFactory/specialistFeeds'

/** Learned per-intent subsystem weights feed straight from applyRewardNudges. */
type LearnReportWeights = NonNullable<LearnedWeightsInput['byIntent']>

export interface MasterEngineFeedRequest {
  topic: string
  primaryKeyword?: string
  region?: string
  contentType?: string
  title?: string
  canonicalUrl?: string
  gsc?: MasterEngineInput['gsc']
  competingUrls?: string[]
  /** Optional draft content — when set AND CONTENT_AI_LLM_QUALITY=1 the three
   *  paid LLM judgment lanes (content quality · E-E-A-T · semantic/NLP) run
   *  against it and fold their scores into the prompt block. */
  content?: string
}

/** Optional LLM quality lane — the ONLY Entrim-spend path in the feed.
 *  CONTENT_AI_LLM_QUALITY=1 opts in; otherwise null and zero extra spend. */
export type MasterEngineLlmQuality = null | {
  enabled: boolean
  contentQuality: ContentQualityResult | null
  eeatTrust: EeatTrustResult | null
  semanticNlp: SemanticNlpResult | null
}

export interface MasterEngineFeed {
  ok: boolean
  intent: string
  composite: number | null
  grade: string | null
  recommendationCount: number
  promptBlock: string
  /** Plan-phase honesty: only the market/estate signals are computable
   *  before a draft exists, so the brief's composite never covers on-page
   *  quality — surface the coverage so "F · 19/100" reads as a partial
   *  snapshot, not a verdict on the strategy or the coming article. */
  coveragePct?: number | null
  computedSignals?: number | null
  totalSignals?: number | null
  phase?: 'plan' | 'page'
  /** Eligible vs junk vs deep-tail GSC mix — the studio cannot hide behind a
   *  0.3% CTR when the eligible position is deep and junk share is high. */
  gscMix: GscMix
  llmQuality?: MasterEngineLlmQuality
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
      .select('primary_term,stage,country,intent,opportunity_score,rationale,compliance_score,plan')
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
    // Demand provenance so the writer prompt never implies live GSC numbers
    // when the mission was planned on a dated snapshot or research volumes.
    const planJson = (hit.plan && typeof hit.plan === 'object' ? hit.plan : {}) as Record<string, unknown>
    const dsrc = String(planJson.demandSource || '')
    const snapAge = planJson.snapshotAgeDays != null ? String(planJson.snapshotAgeDays) : ''
    const provenance =
      dsrc === 'snapshot'
        ? `demand source: static GSC snapshot (${snapAge || '?'} days old)`
        : dsrc === 'gsc-90d'
          ? 'demand source: live GSC last-90-days (monthly estimate)'
          : dsrc
            ? 'demand source: market-research volume (not owned-site impressions)'
            : ''
    const bits = [
      String(hit.primary_term || ''),
      hit.stage ? `stage ${hit.stage}` : '',
      hit.country ? String(hit.country) : '',
      hit.intent ? `intent ${hit.intent}` : '',
      hit.opportunity_score != null ? `opp ${Math.round(Number(hit.opportunity_score))}` : '',
      hit.compliance_score != null ? `compliance ${Math.round(Number(hit.compliance_score))}` : '',
      provenance,
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
 * Optional LLM quality lane — THREE paid Entrim judgment calls per feed.
 * CONTENT_AI_LLM_QUALITY=1 opts in; any other value (or absence) returns null
 * so production stays fail-closed with zero extra Entrim spend. When enabled
 * but the request carries no draft content there is nothing to judge → null.
 * Every scorer never-throws, so this whole lane degrades to null, never a
 * failed feed.
 */
export async function maybeRunLlmQuality(
  req: MasterEngineFeedRequest,
): Promise<MasterEngineLlmQuality> {
  if (process.env.CONTENT_AI_LLM_QUALITY !== '1') return null
  const content = String(req.content || '').trim()
  if (!content) return null
  const slug = String(req.primaryKeyword || req.topic || 'guide').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const pageUrl = String(req.canonicalUrl || `https://yousafeconsultancy.com/${slug}/`)
  const ymyl = req.contentType === 'legal_guide'
  const [contentQuality, eeatTrust, semanticNlp] = await Promise.all([
    scoreContentQuality({
      pageUrl,
      targetText: content,
      competitorTexts: [],
      lane1: buildContentLane1({ targetText: content, competitorTexts: [], detectedIntent: req.region }),
    }).catch(() => null),
    scoreEeatTrust({
      pageUrl,
      targetText: content,
      competitorTexts: [],
      lane1: buildEeatLane1({ targetText: content, ymyl }),
    }).catch(() => null),
    scoreSemanticNlp({
      pageUrl,
      targetText: content,
      competitorTexts: [],
      lane1: buildSemanticLane1({ questionIntent: true }),
    }).catch(() => null),
  ])
  return { enabled: true, contentQuality, eeatTrust, semanticNlp }
}

/** Compact, truthful prompt-line rendering of the optional LLM quality lane. */
export function renderLlmQualityBlock(q: Exclude<MasterEngineLlmQuality, null>): string {
  const fmt = (n: number | null): string => (n == null ? '—' : `${Math.round(n * 100)}/100`)
  const bits = [
    `content-quality ${fmt(q.contentQuality ? contentQualityComposite(q.contentQuality) : null)}`,
    `E-E-A-T trust ${fmt(q.eeatTrust ? eeatTrustComposite(q.eeatTrust) : null)}`,
    `semantic/NLP ${fmt(q.semanticNlp ? semanticNlpComposite(q.semanticNlp) : null)}`,
  ].join(' · ')
  const flags = [
    ...(q.contentQuality?.flags || []),
    ...(q.eeatTrust?.flags || []),
    ...(q.semanticNlp?.flags || []),
  ]
  return `- LLM quality lane (CONTENT_AI_LLM_QUALITY=1): ${bits}${flags.length ? ` · flags: ${flags.slice(0, 6).join(', ')}` : ''}`
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
    const snap = await loadGscSnapshot({ allowStale: false, maxAgeDays: 14 })
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
    llmQuality: null,
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
    const [withHealth, llmV, knowledge, cluster, ahrefs, learned, llmQuality, specialistSignals] = await Promise.all([
      attachSiteHealthFacts(input, req.canonicalUrl).catch(() => input),
      loadLlmVisibilityEvidence(primaryKeyword).catch(() => null),
      loadMatchingKnowledge(primaryKeyword, req.region),
      loadMatchingCluster(primaryKeyword, req.region),
      import('@/lib/seoEngine/ahrefsAudit').then((m) => m.loadLatestAhrefsSnapshot()).catch(() => null),
      // Adaptive weights: train from real outcomes (merged jobs' stored engine
      // reports × live GSC page positions) exactly the way /api/seo-engine/master
      // does — in-process and cheap enough to co-run with the other feeds. Any
      // failure degrades to the intent-conditioned prior, never to a failed feed.
      (async (): Promise<{ byIntent: LearnReportWeights } | null> => {
        try {
          const built = await buildOutcomeHistoryFromLiveGsc()
          const history: HistoricalOutcome[] = built.history
          if (!history.length) return null
          const report = learnWeights(history)
          if (!report.models.length) return null
          const nudged = applyRewardNudges(report, history)
          return nudged.byIntent ? { byIntent: nudged.byIntent as LearnReportWeights } : null
        } catch (e) {
          console.warn(
            '[masterEngineFeed] learned weights skipped — using intent-conditioned prior',
            e instanceof Error ? e.message : e,
          )
          return null
        }
      })(),
      maybeRunLlmQuality(req),
      // Specialist intel feeds: role-sourced signals matching this
      // topic/region fold into the prompt block, so overnight policy moves,
      // competitor deltas and support-triage gaps reach the brief. Fail-open.
      loadOpenSignalsForTopic({ topic: primaryKeyword, region: req.region }).catch(
        (): SpecialistSignal[] => [],
      ),
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

    const report = learned ? scoreMaster(input, learned) : scoreMaster(input)
    const fix = masterEngineFixPlan(input)
    const llmBlock = llmQuality
      ? renderLlmQualityBlock(llmQuality)
      : ''
    const specialistBlock = specialistSignals.length
      ? buildSpecialistPromptBlock(specialistSignals)
      : ''
    const promptBlock = [
      renderMasterEnginePromptBlock(report, { knowledge, cluster }),
      fix.promptBlock,
      llmBlock,
      specialistBlock,
    ].filter(Boolean).join('\n\n')

    return {
      ok: true,
      intent: report.intent,
      composite: report.composite,
      grade: report.grade,
      recommendationCount: (report.recommendations || []).filter((r) => r.open !== false).length,
      promptBlock,
      gscMix: report.gscMix,
      llmQuality,
      // Plan-phase honesty: at brief time there is no page yet, so the
      // composite covers only the market/estate signals that had data.
      // Surface how much of the engine was actually computed so the number
      // is never read as a full page-quality verdict ("F · 19/100" was a
      // no-draft artifact, not a strategy verdict).
      coveragePct: report.coverage?.pct ?? null,
      computedSignals: report.coverage?.computed ?? null,
      totalSignals: report.coverage?.total ?? null,
      phase: 'plan',
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
        specialistSignals: specialistSignals.length
          ? specialistSignals.map((s) => ({ role: s.role, priority: s.priority, region: s.region }))
          : [],
        llmQuality: llmQuality
          ? {
              enabled: true,
              contentQuality: llmQuality.contentQuality ? String(llmQuality.contentQuality.model_used) : null,
              eeatTrust: llmQuality.eeatTrust ? String(llmQuality.eeatTrust.model_used) : null,
              semanticNlp: llmQuality.semanticNlp ? String(llmQuality.semanticNlp.model_used) : null,
            }
          : null,
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
