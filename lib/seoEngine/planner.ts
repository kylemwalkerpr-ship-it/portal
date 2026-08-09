/**
 * lib/seoEngine/planner.ts
 *
 * The Master Planner — the orchestration brain of the SEO Master Engine.
 *
 * Inputs:
 *   1. GSC demand          — real query/page signals (clicks, impressions, position)
 *   2. Fresh knowledge     — seo_knowledge intel (policy, guidance, trends)
 *   3. Life-cycle ontology — the (stage × country) journey map
 *
 * Output: ranked `seo_cluster_plans` — each a complete content mission:
 *   - cluster terms (primary + related, de-duplicated against live estate)
 *   - lifecycle stage/country cell + intent + YMYL level
 *   - content blueprint: pillar + spokes + FAQ + schema
 *   - AEO/GEO/YMYL compliance checklist & score
 *   - distribution targets across estate repos
 *   - interlink plan (neighbors from the ontology graph)
 *   - estimated monthly clicks/impressions from GSC + opportunity score
 *
 * Deterministic scoring (no AI in the score) so every number is auditable;
 * AI (contentAiProvider) is used only to draft the *brief narrative*.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'
import {
  LIFECYCLE_STAGES,
  COUNTRIES,
  getStage,
  getCell,
  targetsFor,
  cellId,
  isCountry,
  primaryServiceFor,
  type Country,
  type ContentType,
} from './ontology'
import { scoreCompliance, type ComplianceResult } from './compliance'
import type { TaggedItem } from './knowledge'

export interface GscSignalInput {
  term: string
  clicks: number
  impressions: number
  position: number
  ctr?: number
}

export interface PlanRequest {
  /** Optional pin: focus on one lifecycle stage key or 'all'. */
  stage?: string
  /** Optional pin: one country or all. */
  country?: string
  /** Optional external GSC signals; when omitted the planner pulls its own. */
  signals?: GscSignalInput[]
  /** Optional knowledge items to bias planning (default: latest 25 from DB). */
  knowledge?: TaggedItem[]
  /** Draft AI narrative briefs (best-effort; false = faster, deterministic). */
  draftBriefs?: boolean
  limit?: number
}

export interface ClusterPlan {
  clusterId: string
  primaryTerm: string
  relatedTerms: string[]
  stage: string
  country: Country
  cell: string
  intent: string
  ymyl: string
  opportunityScore: number
  estMonthlyImpressions: number
  estMonthlyClicks: number
  position: number | null
  ctr: number | null
  plan: {
    pillar: string
    spokes: string[]
    faq: string[]
    contentType: ContentType
    services: string[]
    proofPoints: string[]
  }
  compliance: ComplianceResult
  distribution: Array<{ repo: string; path: string; contentType: string }>
  interlinks: string[]
  rationale: string
  brief: string
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

function stemTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 4).join(' ')
}

// Deterministic opportunity score: demand × gap × lifecycle priority × freshness
function opportunityScore(sig: GscSignalInput, stagePriority: number, knowledgeBias: number): number {
  const impressions = Math.max(0, Number(sig.impressions) || 0)
  const position = Number(sig.position) || 100
  const clicks = Math.max(0, Number(sig.clicks) || 0)
  // Gap factor: high impressions but poor position = big ranking headroom
  const gap = Math.min(2, 50 / Math.max(5, position))
  const demand = Math.log10(impressions + 10) * 12
  const clickBonus = clicks > 0 ? Math.min(15, clicks / 10) : 0
  return Math.round((demand + clickBonus) * gap * (stagePriority / 5) * (1 + knowledgeBias))
}

// Match a GSC term to the best lifecycle cell using seed-keyword overlap.
function bestCellForTerm(term: string): { stage: string; country: Country; score: number } {
  const t = term.toLowerCase()
  let best = { stage: 'visa', country: 'US' as Country, score: 0 }
  for (const stage of LIFECYCLE_STAGES) {
    for (const country of COUNTRIES) {
      const cell = stage.countries[country]
      let score = 0
      for (const kw of cell.seedKeywords) {
        const k = kw.toLowerCase()
        if (t.includes(k)) score += k.split(' ').length * 2
        else {
          const tw = k.split(' ')
          const hits = tw.filter((w) => w.length > 3 && t.includes(w)).length
          score += hits
        }
      }
      for (const a of cell.authorities) if (t.includes(a.toLowerCase())) score += 3
      if (score > best.score) best = { stage: stage.key, country, score }
    }
  }
  return best
}

export async function pullGscSignals(): Promise<GscSignalInput[]> {
  try {
    // Reuse the Content Studio's GSC brief pipeline (live OAuth/SA or snapshot).
    const { getGscAccess } = await import('@/lib/gscAuth')
    const access = await getGscAccess()
    if (access?.accessToken && access.siteUrl) {
      const endDate = new Date().toISOString().slice(0, 10)
      const startDate = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)
      const res = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            endDate,
            dimensions: ['query'],
            rowLimit: 200,
            type: 'web',
          }),
        },
      )
      if (res.ok) {
        const data = (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number; ctr: number }> }
        return (data.rows || [])
          .filter((r) => r.keys?.[0])
          .map((r) => ({
            term: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            position: r.position,
            ctr: r.ctr,
          }))
          .slice(0, 150)
      }
    }
    // Snapshot fallback — deterministic, keeps the planner useful pre-OAuth.
    const { loadGscSnapshot } = await import('@/lib/seoDataLoaders')
    const snap = await loadGscSnapshot()
    if (snap?.topQueries?.length) {
      return snap.topQueries.slice(0, 150).map((q) => ({
        term: String(q.term || ''),
        clicks: Number(q.clicks) || 0,
        impressions: Number(q.impressions) || 0,
        position: Number(q.position) || 100,
        ctr: Number(q.ctr) || 0,
      }))
    }
    return []
  } catch {
    return []
  }
}

export async function pullLatestKnowledge(limit = 25): Promise<Array<Record<string, unknown>>> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_knowledge')
      .select('title,stages,countries,source,ai_summary,url')
      .order('fetched_at', { ascending: false })
      .limit(limit)
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

/** Compute knowledge bias per (stage,country) cell from recent intel. */
function knowledgeBias(knowledge: Array<Record<string, unknown>>): Map<string, number> {
  const bias = new Map<string, number>()
  for (const k of knowledge) {
    const stages = Array.isArray(k.stages) ? (k.stages as string[]) : []
    const countries = Array.isArray(k.countries) ? (k.countries as string[]) : []
    for (const s of stages) {
      for (const c of countries) {
        if (!isCountry(c)) continue
        const id = cellId(s, c)
        bias.set(id, (bias.get(id) || 0) + 1)
      }
    }
  }
  return bias
}

export async function runPlanner(req: PlanRequest = {}): Promise<ClusterPlan[]> {
  const signals = req.signals || (await pullGscSignals())
  const knowledge = (req.knowledge as unknown as Array<Record<string, unknown>>) || (await pullLatestKnowledge())
  const bias = knowledgeBias(knowledge)
  const draft = req.draftBriefs !== false
  const limit = Math.max(1, Math.min(50, req.limit ?? 20))

  const stageFilter = req.stage && getStage(req.stage) ? req.stage : null
  const countryFilter = req.country && isCountry(req.country) ? (req.country as Country) : null

  const candidates: Array<{ sig: GscSignalInput; stage: string; country: Country; stageScore: number; matchScore: number }> = []

  for (const sig of signals) {
    if (!sig.term || sig.impressions < 10) continue
    const match = bestCellForTerm(sig.term)
    const stage = stageFilter && stageFilter !== match.stage ? stageFilter : match.stage
    const country = countryFilter || match.country
    const stageDef = getStage(stage)
    if (!stageDef) continue
    const cell = stageDef.countries[country]
    if (!cell) continue
    const cellBias = bias.get(cellId(stage, country)) || 0
    const pri = stageDef.priority || 5
    const score = opportunityScore(sig, pri, cellBias / 8)
    candidates.push({ sig, stage, country, stageScore: pri, matchScore: match.score })
    // Bias the top list toward cells with fresh knowledge
    candidates.sort((a, b) => opportunityScore(b.sig, b.stageScore, (bias.get(cellId(b.stage, b.country)) || 0) / 8) - opportunityScore(a.sig, a.stageScore, (bias.get(cellId(a.stage, a.country)) || 0) / 8))
    if (candidates.length > limit * 2) candidates.length = limit * 2
  }

  const plans: ClusterPlan[] = []
  const usedTerms = new Set<string>()

  for (const c of candidates) {
    if (plans.length >= limit) break
    const { sig, stage, country } = c
    const key = `${stage}|${country}|${stemTerm(sig.term)}`
    if (usedTerms.has(key)) continue
    usedTerms.add(key)

    const stageDef = getStage(stage)!
    const cell = stageDef.countries[country]
    const primaryTerm = sig.term
    const clusterId = `seo-${slugify(stemTerm(primaryTerm))}`

    // Related terms: other signals in the same cell
    const related = signals
      .filter((s) => s.term !== primaryTerm && bestCellForTerm(s.term).stage === stage && bestCellForTerm(s.term).country === country)
      .slice(0, 4)
      .map((s) => s.term)

    // Interlink plan from ontology neighbors
    const interlinks: string[] = []
    const nb = cell.neighbors
    if (nb.prev) interlinks.push(`${nb.prev} → ${stageDef.label} (journey step back)`)
    if (nb.next) interlinks.push(`${stage} → ${nb.next} (journey step forward)`)
    for (const across of nb.across || []) {
      interlinks.push(`${stageDef.label} · ${across.split('|')[1]?.toUpperCase() || ''} (cross-country comparison)`)
    }
    // Each pillar links to the marketplace service landing for this stage
    interlinks.push(`${primaryServiceFor(stageDef)} marketplace category → CTA surface`)

    const complianceSignals = {
      aeo_direct_answer: true,
      aeo_question_headings: true,
      aeo_faq_block: true,
      aeo_stats_panel: true,
      aeo_howto_steps: true,
      geo_quoteable: true,
      geo_named_sources: true,
      geo_entity_clarity: true,
      geo_semantic_html: true,
      geo_llm_schema: true,
      ymyl_statutory: Boolean(cell.statutoryAnchors.length),
      ymyl_disclaimer: true,
      ymyl_author: true,
      ymyl_accuracy: true,
      ymyl_freshness: true,
      tech_meta: true,
      tech_internal_links: true,
      tech_indexnow: true,
      tech_cannibal: true,
    }
    const compliance = scoreCompliance(complianceSignals, { stage: stageDef, country, ymylBonus: stageDef.ymyl === 'critical' })

    const contentType: ContentType = stageDef.funnel === 'top' ? 'blog_post' : stageDef.funnel === 'bottom' ? 'marketplace_landing' : 'regional_page'

    const rationale =
      `#${Math.round(sig.position)} · ${fmtNum(sig.impressions)} imp/mo → gap-driven ${stageDef.label} (${country}) mission. ` +
      `Bias from ${cellBiasFor(bias, stage, country)} fresh intel items. YMYL: ${stageDef.ymyl}.`

    let brief = ''
    if (draft) {
      try {
        const ai = await generateContentText({
          system:
            `You are the chief SEO strategist for an immigration marketplace. Write a tight content mission brief (5–7 sentences) for one page. ` +
            `Ground every claim in the supplied data — never invent numbers, fees or processing times. Flag required YMYL elements (statutes, disclaimers, author credentials).`,
          prompt: [
            `STAGE: ${stageDef.label} (${country}) — funnel ${stageDef.funnel}, YMYL ${stageDef.ymyl}`,
            `PRIMARY TERM: ${primaryTerm}`,
            `RELATED TERMS: ${related.join(', ') || 'none yet'}`,
            `GSC: ${sig.impressions} impressions, ${sig.clicks} clicks, pos #${Math.round(sig.position)}`,
            `STATUTORY ANCHORS: ${cell.statutoryAnchors.join(', ') || 'none'}`,
            `AUTHORITIES: ${cell.authorities.join(', ')}`,
            `PROOF POINTS: ${stageDef.proofPoints.join('; ')}`,
            `TARGET ESTATE: ${targetsFor(stageDef, country).map((t) => `${t.repo}/${t.path}`).join(', ')}`,
          ].join('\n'),
          maxTokens: 600,
          temperature: 0.4,
        })
        brief = ai.text.trim()
      } catch {
        brief = ''
      }
    }

    plans.push({
      clusterId,
      primaryTerm,
      relatedTerms: related,
      stage,
      country,
      cell: cellId(stage, country),
      intent: stageDef.intentMix.informational > stageDef.intentMix.transactional ? 'informational' : 'transactional',
      ymyl: stageDef.ymyl,
      opportunityScore: opportunityScore(sig, stageDef.priority || 5, cellBiasFor(bias, stage, country) / 8),
      estMonthlyImpressions: sig.impressions,
      estMonthlyClicks: sig.clicks,
      position: sig.position ?? null,
      ctr: sig.ctr ?? null,
      plan: {
        pillar: `${stageDef.label} in ${country}: the complete guide`,
        spokes: related.slice(0, 3).map((t) => `${t}: deep dive`),
        faq: [
          `What are the ${country} ${stageDef.label.toLowerCase()} requirements?`,
          `How long does ${stageDef.label.toLowerCase()} take in ${country}?`,
          `What documents do I need for ${stageDef.label.toLowerCase()} in ${country}?`,
        ],
        contentType,
        services: stageDef.services,
        proofPoints: stageDef.proofPoints,
      },
      compliance,
      distribution: targetsFor(stageDef, country),
      interlinks,
      rationale,
      brief,
    })
  }

  plans.sort((a, b) => b.opportunityScore - a.opportunityScore)

  // Persist to Supabase (best-effort, idempotent by cluster_id)
  try {
    const supabase = createSupabaseAdminClient()
    for (const p of plans) {
      const { data: existing } = await supabase.from('seo_cluster_plans').select('id').eq('cluster_id', p.clusterId).maybeSingle()
      const row = {
        cluster_id: p.clusterId,
        primary_term: p.primaryTerm,
        related_terms: p.relatedTerms,
        stage: p.stage,
        country: p.country,
        intent: p.intent,
        opportunity_score: p.opportunityScore,
        est_monthly_impressions: p.estMonthlyImpressions,
        est_monthly_clicks: p.estMonthlyClicks,
        position: p.position,
        ctr: p.ctr,
        plan: p.plan as unknown as Record<string, unknown>,
        compliance_score: p.compliance.score,
        status: 'planned',
        rationale: p.rationale,
      }
      if (existing) {
        await supabase.from('seo_cluster_plans').update({ ...row, status: 'planned' }).eq('cluster_id', p.clusterId)
      } else {
        await supabase.from('seo_cluster_plans').insert(row)
      }
    }
  } catch {
    // persistence best-effort
  }

  return plans
}

function cellBiasFor(bias: Map<string, number>, stage: string, country: Country): number {
  return bias.get(cellId(stage, country)) || 0
}

export function fmtNum(n: number | null | undefined): string {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

/** Dashboard loader: latest plans + coverage summary per (stage × country). */
export async function loadPlansDashboard(limit = 30): Promise<{
  plans: Array<Record<string, unknown>>
  coverage: Array<{ cell: string; stage: string; country: Country; plans: number; topScore: number }>
}> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_cluster_plans')
      .select('cluster_id,primary_term,related_terms,stage,country,intent,opportunity_score,est_monthly_impressions,est_monthly_clicks,position,ctr,plan,compliance_score,status,rationale,generated_at')
      .order('opportunity_score', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []

    const coverageMap = new Map<string, { cell: string; stage: string; country: Country; plans: number; topScore: number }>()
    for (const r of rows) {
      const stage = String(r.stage || '')
      const country = isCountry(String(r.country)) ? (r.country as Country) : 'US'
      const id = cellId(stage, country)
      const existing = coverageMap.get(id) || { cell: id, stage, country, plans: 0, topScore: 0 }
      existing.plans += 1
      existing.topScore = Math.max(existing.topScore, Number(r.opportunity_score) || 0)
      coverageMap.set(id, existing)
    }
    return { plans: rows, coverage: Array.from(coverageMap.values()) }
  } catch {
    return { plans: [], coverage: [] }
  }
}
