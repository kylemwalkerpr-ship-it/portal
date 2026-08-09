/**
 * lib/seoEngine/llmVisibility.ts
 *
 * LLM / AEO VISIBILITY TRACKER (share of voice in generative engines)
 *
 * GEO (Generative Engine Optimization) reality: ChatGPT, Perplexity, Google AI
 * Overviews and friends cite sources they trust. We cannot control them — but
 * we CAN measure our share of voice over time by running prompt audits: ask an
 * LLM to answer a real estate query with sources, then check whether the estate
 * was cited.
 *
 * Every audit is stored in `seo_llm_visibility` (query, engine, cited,
 * cited_urls, brand_mentions, snippet, raw_score) so the dashboard shows a
 * verifiable trend: which queries we win, which we lose, and what changed.
 *
 * The audit uses the same AI cascade as content generation (contentAiProvider),
 * so it costs nothing extra and runs on the daily cron.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { generateContentText } from '@/lib/contentAiProvider'

/** The estate's observable surface — everything we want LLMs to cite. */
export const ESTATE_DOMAINS: string[] = [
  'yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
]

export const BRAND_MENTIONS: string[] = ['yousafe', 'you safe consultancy']

/** Canonical audit query bank — high-value estate queries (GSC-backed terms). */
export const DEFAULT_AUDIT_QUERIES: string[] = [
  'How do I get a student visa for Canada from Nigeria?',
  'What are the UK Skilled Worker visa requirements in 2026?',
  'Express Entry CRS calculator: how many points do I need for Canada PR?',
  'H-1B visa sponsorship: what documents do employers need?',
  'How long does a US green card take after marriage?',
  'Australia subclass 190: what are the state nomination requirements?',
  'UK spouse visa financial requirement 2026: how much do I need?',
  'How do I move my parents to Canada permanently?',
  'What is the ILR to citizenship timeline in the UK?',
  'Study in the USA: F-1 visa interview tips and checklist',
]

export interface VisibilityAuditOptions {
  queries?: string[]
  engineLabel?: string
  maxAudits?: number
}

export interface VisibilityAuditResult {
  query: string
  engine: string
  model: string | null
  cited: boolean
  citedUrls: string[]
  brandMentions: string[]
  snippet: string
  rawScore: number
  stage: string | null
  country: string | null
}

function extractUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s)\]>"']+/g) || []
  return urls.map((u) => u.replace(/[.,;:]+$/, '')).filter((u) => u.includes('.'))
}

function scoreVoice(citedUrls: string[], mentions: string[]): number {
  // Share-of-voice: citations weighted more than bare mentions.
  let score = 0
  for (const u of citedUrls) {
    if (ESTATE_DOMAINS.some((d) => u.includes(d))) score += 1
  }
  for (const m of mentions) if (m) score += 0.5
  return Math.min(1, score / 3)
}

/** Run one audit for a single query. Never throws — returns a partial record. */
export async function auditQuery(query: string, engineLabel = 'deepseek', model: string | null = null): Promise<VisibilityAuditResult> {
  const empty: VisibilityAuditResult = {
    query, engine: engineLabel, model, cited: false, citedUrls: [], brandMentions: [],
    snippet: '', rawScore: 0, stage: null, country: null,
  }
  try {
    const ai = await generateContentText({
      system:
        `You are an answer engine doing a research round. Answer the user's question directly, then list the authoritative sources you used as URLs. ` +
        `Be honest: only list sources you actually relied on. Return the answer text first, then a line "Sources:" followed by one URL per line.`,
      prompt: query,
      maxTokens: 900,
      temperature: 0.2,
    })
    const text = (ai.text || '').trim()
    const citedUrls = extractUrls(text).filter((u) => ESTATE_DOMAINS.some((d) => u.includes(d)))
    const brandMentions = BRAND_MENTIONS.filter((b) => text.toLowerCase().includes(b.toLowerCase()))
    const snippet = text.replace(/\s+/g, ' ').slice(0, 500)

    // Tag stage/country deterministically from the query text
    let stage: string | null = null
    let country: string | null = null
    const lower = query.toLowerCase()
    const countryMap: Array<[string, string]> = [
      ['usa', 'US'], ['america', 'US'], ['united states', 'US'],
      ['uk', 'UK'], ['united kingdom', 'UK'], ['britain', 'UK'],
      ['canada', 'CA'], ['australia', 'AU'],
    ]
    for (const [key, c] of countryMap) if (lower.includes(key)) { country = c; break }
    const stageMap: Array<[RegExp, string]> = [
      [/visa|green card|permanent residence|pr /, 'visa'],
      [/student visa|study permit|study in|f-1|f1/, 'schools'],
      [/work visa|skilled worker|h-1b|h1b|express entry|subclass/, 'work'],
      [/spouse|partner|marriage|family|parents|children|relative/, 'family'],
      [/citizenship|naturali[sz]ation|ilr/, 'citizenship'],
      [/house|housing|rent|accommodation/, 'housing'],
      [/settle|bank|health|driver/, 'settlement'],
      [/move to|relocate|immigrate/, 'intent'],
    ]
    for (const [re, s] of stageMap) if (re.test(lower)) { stage = s; break }

    return {
      ...empty,
      cited: citedUrls.length > 0 || brandMentions.length > 0,
      citedUrls,
      brandMentions,
      snippet,
      rawScore: scoreVoice(citedUrls, brandMentions),
      stage,
      country,
    }
  } catch {
    return empty
  }
}

/** Run a batch of audits and persist to seo_llm_visibility. */
export async function runVisibilityAudits(opts: VisibilityAuditOptions = {}): Promise<{
  audits: VisibilityAuditResult[]
  cited: number
  total: number
  shareOfVoice: number
  engine: string
}> {
  const queries = (opts.queries || DEFAULT_AUDIT_QUERIES).slice(0, Math.min(15, opts.maxAudits ?? 10))
  const engine = opts.engineLabel || 'deepseek'
  const audits: VisibilityAuditResult[] = []

  for (const q of queries) {
    const result = await auditQuery(q, engine)
    audits.push(result)
    try {
      const supabase = createSupabaseAdminClient()
      await supabase.from('seo_llm_visibility').insert({
        query: result.query,
        engine: result.engine,
        model: result.model,
        cited: result.cited,
        cited_urls: result.citedUrls,
        brand_mentions: result.brandMentions,
        snippet: result.snippet,
        raw_score: result.rawScore,
        stage: result.stage,
        country: result.country,
      })
    } catch {
      // storage best-effort — the audit itself stands
    }
  }

  const cited = audits.filter((a) => a.cited).length
  const total = audits.length
  return {
    audits,
    cited,
    total,
    shareOfVoice: total ? Math.round((cited / total) * 100) : 0,
    engine,
  }
}

export async function loadVisibilityFeed(limit = 50): Promise<{
  audits: Array<Record<string, unknown>>
  shareOfVoice: number
  cited: number
  total: number
  byStage: Record<string, number>
}> {
  try {
    const supabase = createSupabaseAdminClient()
    // Base feed = prompt-audit bank only. Fan-out sub-query audits are a
    // different population (they roll into the recent-50 window daily and
    // would silently change what the headline share-of-voice means); they
    // surface separately via loadVisibilityByCluster on the same GET.
    const { data } = await supabase
      .from('seo_llm_visibility')
      .select('id,query,engine,model,cited,cited_urls,brand_mentions,snippet,raw_score,stage,country,fan_out,cluster_id,source_field,created_at')
      .eq('fan_out', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    const rows = (data as Array<Record<string, unknown>>) || []
    const cited = rows.filter((r) => r.cited).length
    const byStage: Record<string, number> = {}
    for (const r of rows) {
      const s = String(r.stage || 'untagged')
      byStage[s] = (byStage[s] || 0) + 1
    }
    return {
      audits: rows,
      shareOfVoice: rows.length ? Math.round((cited / rows.length) * 100) : 0,
      cited,
      total: rows.length,
      byStage,
    }
  } catch {
    return { audits: [], shareOfVoice: 0, cited: 0, total: 0, byStage: {} }
  }
}

// ── Fan-out audit bank (per-cluster sub-queries) ─────────────────────────────
export type FanOutSource = 'primary' | 'faq' | 'related'

export interface FanOutAuditQuery {
  clusterId: string
  primaryTerm: string
  query: string
  source: FanOutSource
}

/** Shape of a cluster-plan row as consumed by the fan-out builder. */
export interface FanOutPlanRow {
  cluster_id?: string | null
  primary_term?: string | null
  related_terms?: unknown
  plan?: unknown
}

function normalizeAuditQuery(q: string): string {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Build the fan-out audit bank for the top cluster plans: every sub-query an
 * LLM might ask around a cluster's primary term — FAQ questions first (the
 * exact phrasing answer engines quote), then GSC related terms, then the
 * primary term itself. Deterministic, de-duplicated, and capped per plan so
 * the audit batch stays bounded. No AI — pure projection from the plan.
 */
export function buildFanOutAuditQueries(
  plans: FanOutPlanRow[],
  opts: { maxPlans?: number; maxPerPlan?: number } = {},
): FanOutAuditQuery[] {
  const maxPlans = Math.max(1, Math.min(20, opts.maxPlans ?? 10))
  const maxPerPlan = Math.max(2, Math.min(12, opts.maxPerPlan ?? 6))
  const out: FanOutAuditQuery[] = []
  // Per-cluster dedup (NOT global): a sub-query shared by two clusters is
  // audited once per cluster, so each cluster's byCluster cited/total — and
  // its aeoGeo bonus — reflects its own coverage. Global dedup would silently
  // undercount the second cluster by attributing the shared audit only to the
  // first. Caps are per-plan, so the batch stays bounded either way.
  const push = (clusterId: string, primaryTerm: string, query: string, source: FanOutSource, seen: Set<string>) => {
    const q = String(query || '').trim()
    if (!q || q.length < 5) return
    const key = normalizeAuditQuery(q)
    if (seen.has(key)) return
    seen.add(key)
    out.push({ clusterId, primaryTerm: String(primaryTerm || ''), query: q, source })
  }

  for (const p of plans.slice(0, maxPlans)) {
    const seen = new Set<string>()
    const clusterId = String(p.cluster_id || '')
    const primaryTerm = String(p.primary_term || '')
    if (!clusterId || !primaryTerm) continue
    // Reserve one slot for the primary hub query so it is always audited; the
    // fan-out sub-queries (faq + related) fill the rest.
    const subBudget = Math.max(1, maxPerPlan - 1)
    let count = 0
    const plan = p.plan as { faq?: string[] } | null | undefined
    const faq = Array.isArray(plan?.faq) ? (plan.faq as string[]) : []
    const related = Array.isArray(p.related_terms)
      ? (p.related_terms as Array<unknown>).map((t) => String(t)).filter(Boolean)
      : []
    // 1) FAQ questions — exact phrasing answer engines quote. Highest value.
    for (const q of faq) {
      if (count >= subBudget) break
      push(clusterId, primaryTerm, q, 'faq', seen)
      count += 1
    }
    // 2) GSC related terms — the sub-queries around the primary term.
    for (const t of related) {
      if (count >= subBudget) break
      push(clusterId, primaryTerm, t, 'related', seen)
      count += 1
    }
    // 3) The primary term itself (the hub query) — guaranteed slot.
    push(clusterId, primaryTerm, primaryTerm, 'primary', seen)
  }
  return out
}

export interface FanOutAuditRunResult {
  audits: VisibilityAuditResult[]
  clusters: number
  cited: number
  total: number
  shareOfVoice: number
  /** cluster_id → { cited, total } for the aeoGeo family feed. */
  byCluster: Record<string, { cited: number; total: number }>
}

/**
 * Run the fan-out audit batch: build sub-queries from the top cluster plans,
 * audit each against an LLM, and persist with cluster provenance. Results are
 * also returned grouped by cluster so the ranking model's aeoGeo family can
 * consume measured (not guessed) fan-out citation evidence.
 */
export async function runFanOutVisibilityAudits(opts: {
  planLimit?: number
  maxPerPlan?: number
  maxAudits?: number
  engineLabel?: string
} = {}): Promise<FanOutAuditRunResult> {
  const engine = opts.engineLabel || 'deepseek'
  const empty: FanOutAuditRunResult = { audits: [], clusters: 0, cited: 0, total: 0, shareOfVoice: 0, byCluster: {} }
  try {
    const { loadPlansDashboard } = await import('./planner')
    const { plans } = await loadPlansDashboard(opts.planLimit || 10)
    const queries = buildFanOutAuditQueries(plans as FanOutPlanRow[], {
      maxPlans: opts.planLimit || 10,
      maxPerPlan: opts.maxPerPlan,
    }).slice(0, Math.min(30, opts.maxAudits ?? 18))
    if (!queries.length) return empty

    const audits: VisibilityAuditResult[] = []
    const byCluster: Record<string, { cited: number; total: number }> = {}
    const supabase = createSupabaseAdminClient()
    for (const fq of queries) {
      const result = await auditQuery(fq.query, engine)
      audits.push(result)
      const cell = byCluster[fq.clusterId] || { cited: 0, total: 0 }
      cell.total += 1
      if (result.cited) cell.cited += 1
      byCluster[fq.clusterId] = cell
      try {
        await supabase.from('seo_llm_visibility').insert({
          query: result.query,
          engine: result.engine,
          model: result.model,
          cited: result.cited,
          cited_urls: result.citedUrls,
          brand_mentions: result.brandMentions,
          snippet: result.snippet,
          raw_score: result.rawScore,
          stage: result.stage,
          country: result.country,
          fan_out: true,
          cluster_id: fq.clusterId,
          source_field: fq.source,
        })
      } catch {
        // storage best-effort — the audit itself stands
      }
    }
    const cited = audits.filter((a) => a.cited).length
    return {
      audits,
      clusters: Object.keys(byCluster).length,
      cited,
      total: audits.length,
      shareOfVoice: audits.length ? Math.round((cited / audits.length) * 100) : 0,
      byCluster,
    }
  } catch {
    return empty
  }
}

/**
 * Load measured fan-out citation evidence grouped by cluster, for the ranking
 * model's aeoGeo family.
 *
 * Honesty guard: the cap is PER CLUSTER, not global — a cluster's cited/total
 * always reflects ITS OWN most-recent audits, never a window diluted by other
 * clusters' newer rows. (A global cap would let busy clusters push a quiet
 * cluster's evidence out of the count while the reason string implies the
 * full measured set.) Best-effort: returns {} on any failure.
 */
export async function loadVisibilityByCluster(perCluster = 12, maxClusters = 50): Promise<Record<string, { cited: number; total: number }>> {
  try {
    const supabase = createSupabaseAdminClient()
    // Most recently active clusters first, so quota goes to live plans.
    const { data: clusters } = await supabase
      .from('seo_llm_visibility')
      .select('cluster_id')
      .eq('fan_out', true)
      .not('cluster_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(maxClusters)
    const ids = [...new Set(((clusters as Array<{ cluster_id: string | null }>) || []).map((r) => String(r.cluster_id || '')).filter(Boolean))]
    const byCluster: Record<string, { cited: number; total: number }> = {}
    for (const id of ids) {
      const { data: rows } = await supabase
        .from('seo_llm_visibility')
        .select('cluster_id,cited')
        .eq('cluster_id', id)
        .eq('fan_out', true)
        .order('created_at', { ascending: false })
        .limit(perCluster)
      for (const r of (rows as Array<{ cited: boolean | null }>) || []) {
        const cell = byCluster[id] || { cited: 0, total: 0 }
        cell.total += 1
        if (r.cited) cell.cited += 1
        byCluster[id] = cell
      }
    }
    return byCluster
  } catch {
    return {}
  }
}
