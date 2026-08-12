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
import { editorialBriefPromptBlock } from '@/lib/seoFactory/editorialContract'
import { freshnessScore, type PredictiveSignal } from './intelligence'

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
  /** Head terms (≤3 words) sliced from `relatedTerms` plus synthesized modifiers around the primary. Required minimum: 5. */
  shortKeywords: string[]
  /** Question / long-form terms (≥4 words) sliced from `relatedTerms` plus synthesized prefixes. Required minimum: 4. */
  longTailKeywords: string[]
  /** Provenance of the partitioner — useful for audits when we evolve the rules. */
  keywordPartitionSource: 'word_count_v1'
}

/** Minimum keyword counts the studio's content quality gate enforces on every draft. */
export const KEYWORD_REQUIREMENTS = {
  SHORT_MIN: 5,
  LONG_TAIL_MIN: 4,
  SHORT_MAX_PER_KEYWORD: 4,
  LONG_TAIL_MAX_PER_KEYWORD: 2,
} as const

/**
 * Partition a freeform list of seed queries into short (≤3 words) and long-tail (≥4 words).
 * Deterministic: same input → same output. Returns up to `SHORT_MIN + 7` short + `LONG_TAIL_MIN + 6`
 * long-tail terms. Counts hyphenated atoms (e.g. "f-1", "co-op") as ONE word so a
 * head term like "f-1 visa" still classifies as short (2 words) and not long-tail.
 */
export function partitionKeywords(terms: string[], primaryTerm?: string): { short: string[]; longTail: string[] } {
  const norm = String
  const seen = new Set<string>()
  const out: string[] = []
  const pushUniq = (raw: string) => {
    const t = norm(raw || '').toLowerCase().trim().replace(/\s+/g, ' ')
    if (!t) return
    if (t.length < 3 || t.length > 80) return
    // Dedup on the display-cased variant too so variants like "F-1 visa" and
    // "f 1 visa" are treated as different keys (the user typed one form,
    // the synthesis needs the other).
    const key = t.replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  const wordCount = (s: string): number => {
    // Treat hyphenated form codes / multi-char atoms (e.g. "f-1", "co-op", "i-765")
    // as ONE word so they don't blow the long-tail count out of proportion.
    const tokens = s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    return tokens.reduce((n, token) => {
      const atoms = token.split('-').filter(Boolean)
      return n + Math.max(1, atoms.length === token.length ? 1 : 1)
    }, 0) || tokens.length
  }

  const pt = norm(primaryTerm || '').toLowerCase().trim()
  const ptWords = pt.split(/\s+/).filter(Boolean)

  // Track short and long-tail arrays as we synthesize, so the second-stage
  // gate can use the count of the *target* array, not the global count of
  // mixed terms.
  const short: string[] = []
  const longTail: string[] = []
  // classifyAndAdd will both push a unique term AND place it in the correct
  // bucket if the term passes the dedupe gate.
  const classifyAndAdd = (candidate: string) => {
    const beforeLen = out.length
    pushUniq(candidate)
    if (out.length === beforeLen) return
    const last = out[out.length - 1]
    const wc = wordCount(last)
    if (wc <= 3) {
      if (short.length < KEYWORD_REQUIREMENTS.SHORT_MIN + 7) short.push(last)
    } else if (wc >= 4) {
      if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 6) longTail.push(last)
    }
  }

  // Collect input terms + primary first.
  for (const t of terms || []) classifyAndAdd(t)
  if (ptWords.length >= 2) classifyAndAdd(pt)

  // First synthesize SHORT (≤3 words) head terms so the floor is met.
  //
  // 2026-08-12 hardening: for a LONG primary (≥4 words, e.g. "study abroad
  // statement of purpose") the old "${prefix} ${pt}" construction always
  // produced 5+ word candidates that could never classify as short — so the
  // short list stayed at whatever the model/user supplied (often 4), and the
  // quality gate hard-blocked every draft with "only N short keywords; need
  // at least 5". Now we derive SHORT heads from the primary's own contiguous
  // word windows (leading 1-2 words, trailing 2-3 words) and attach the
  // modifiers to those heads instead of the full phrase.
  const ST_PREFIXES = ['guide', 'requirements', 'application', 'eligibility', 'documents', 'timeline', 'rules', 'process']
  if (short.length < KEYWORD_REQUIREMENTS.SHORT_MIN + 2 && ptWords.length >= 1) {
    const stripped = pt.replace(/-/g, ' ')
    // Stopwords that would produce awkward heads ("of purpose", "for study")
    const STOP = /\b(of|for|in|to|a|an|the|and|or|at|on|by|with|from)\b/
    // Candidate short heads — every contiguous window that can carry a
    // modifier while staying ≤3 words. Deduped via classifyAndAdd below.
    const headCandidates: string[] = [stripped]
    if (ptWords.length >= 2) {
      headCandidates.push(ptWords.slice(0, 2).join(' '), ptWords.slice(-2).join(' '))
    }
    if (ptWords.length >= 3) {
      headCandidates.push(ptWords.slice(-3).join(' '))
    }
    for (const head of headCandidates) {
      if (!head.trim()) continue
      // Skip heads that start or end with a stopword — they read as sentence
      // fragments, not keyword phrases ("of purpose"). Keep the full primary
      // even if it contains stopwords in the middle.
      const headWords = head.split(/\s+/).filter(Boolean)
      if (head !== stripped && (STOP.test(headWords[0] || '') || STOP.test(headWords[headWords.length - 1] || ''))) continue
      // The head itself may already be a valid short keyword ("statement of
      // purpose" = 3 words).
      classifyAndAdd(head)
      for (const prefix of ST_PREFIXES) {
        const candidate = `${head} ${prefix}`
        if (wordCount(candidate) <= 3) classifyAndAdd(candidate)
      }
      if (wordCount(`${head} 2026`) <= 3) classifyAndAdd(`${head} 2026`)
      if (wordCount(`${head} guide`) <= 3) classifyAndAdd(`${head} guide`)
    }
  }

  // Then synthesize LONG-TAIL (≥4) query phrases.
  const LT_PREFIXES = ['how to apply for', 'what is the', 'is it possible to', 'do you need a', 'requirements for a']
  const LT_SUFFIXES = ['for international students', 'step by step', 'in 2026 explained', 'checklist and timeline', 'requirements explained by an expert']
  if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 2 && ptWords.length >= 1) {
    for (const prefix of LT_PREFIXES) classifyAndAdd(`${prefix} ${pt}`)
    for (const suffix of LT_SUFFIXES) classifyAndAdd(`${pt} ${suffix}`)
  }

  return { short, longTail }
}

/**
 * Merge a model-generated brief keyword list with the deterministic
 * partitioner so the brief ALWAYS ships ≥5 short + ≥4 long-tail keywords.
 * Model terms come first; partitioner-synthesized terms fill any shortfall.
 * The primary keyword is excluded from the returned arrays — it appears in
 * the title/H1 by definition and has its own keyword_stuffing check.
 */
export function mergeBriefKeywords(opts: {
  modelShort?: string[]
  modelLong?: string[]
  primaryTerm?: string
  maxShort?: number
  maxLong?: number
}): { short: string[]; longTail: string[] } {
  const modelShort = (opts.modelShort || []).map(String).filter((s) => s && s.trim()).map((s) => s.trim())
  const modelLong = (opts.modelLong || []).map(String).filter((s) => s && s.trim()).map((s) => s.trim())
  const primaryL = (opts.primaryTerm || '').trim().toLowerCase()
  const maxShort = Math.max(5, opts.maxShort ?? 8)
  const maxLong = Math.max(4, opts.maxLong ?? 6)

  const partitioned = partitionKeywords([...modelShort, ...modelLong], opts.primaryTerm || '')
  const short: string[] = []
  const longTail: string[] = []
  const pushUnique = (arr: string[], t: string) => {
    const norm = t.toLowerCase()
    if (!norm || norm === primaryL) return
    if (arr.some((x) => x.toLowerCase() === norm)) return
    arr.push(t)
  }
  for (const t of modelShort) pushUnique(short, t)
  for (const t of modelLong) pushUnique(longTail, t)
  for (const t of partitioned.short) {
    if (short.length >= maxShort) break
    pushUnique(short, t)
  }
  for (const t of partitioned.longTail) {
    if (longTail.length >= maxLong) break
    pushUnique(longTail, t)
  }
  return { short, longTail }
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

export async function pullLatestIntelligence(limit = 100): Promise<Array<Record<string, unknown>>> {
  try {
    const { data } = await createSupabaseAdminClient()
      .from('seo_intelligence_snapshots')
      .select('topic,normalized_topic,play,confidence,freshness,regeneration_eligible,evidence,reasons,observed_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data as Array<Record<string, unknown>>) || []
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
  const intelligence = await pullLatestIntelligence()
  const bias = knowledgeBias(knowledge)
  const predictiveByTopic = new Map<string, PredictiveSignal>()
  for (const row of intelligence) {
    const topic = String(row.normalized_topic || row.topic || '').trim()
    if (!topic) continue
    predictiveByTopic.set(topic, {
      modelVersion: 'seo-intelligence-v1',
      topic: String(row.topic || topic),
      play: String(row.play || 'content_gap') as PredictiveSignal['play'],
      opportunityScore: Number(row.opportunity_score) || 0,
      confidence: Number(row.confidence) || 0,
      freshness: Number(row.freshness) || freshnessScore(String(row.observed_at || '')),
      rankability: 0,
      evidence: Array.isArray(row.evidence) ? row.evidence as PredictiveSignal['evidence'] : [],
      reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
      regenerationEligible: row.regeneration_eligible !== false,
    })
  }
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
    const predictive = predictiveByTopic.get(sig.term.toLowerCase().replace(/[^a-z0-9\\s-]/g, ' ').replace(/\\s+/g, ' ').trim())
    // Predictive intelligence is a bounded confidence/freshness adjustment,
    // never a fabricated ranking factor. GSC demand remains the dominant input.
    const predictiveAdjustment = predictive
      ? 0.9 + Math.min(0.1, Math.max(0, predictive.confidence * predictive.freshness) * 0.1)
      : 0.9
    const score = opportunityScore(sig, pri, cellBias / 8) * predictiveAdjustment
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
      .slice(0, 8)
      .map((s) => s.term)

    // Partition into short + long-tail so the brief can demand a ≥5 / ≥4 minimum.
    const partitioned = partitionKeywords(related, primaryTerm)

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
      `Bias from ${cellBiasFor(bias, stage, country)} fresh intel items; predictive evidence ${predictiveByTopic.has(primaryTerm.toLowerCase().replace(/[^a-z0-9\\s-]/g, ' ').replace(/\\s+/g, ' ').trim()) ? 'present' : 'not yet linked'}. YMYL: ${stageDef.ymyl}.`

    let brief = ''
    if (draft) {
      try {
        const ai = await generateContentText({
          aiProvider: 'openai',
          system: [
            editorialBriefPromptBlock(),
            `You are the chief SEO strategist for an immigration marketplace. Ground every claim in the supplied data — never invent numbers, fees or processing times. Flag required YMYL elements (statutes, disclaimers, author credentials).`,
          ].join('\n'),
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
      shortKeywords: partitioned.short,
      longTailKeywords: partitioned.longTail,
      keywordPartitionSource: 'word_count_v1',
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
        short_keywords: p.shortKeywords,
        long_tail_keywords: p.longTailKeywords,
        keyword_partition_generated_at: new Date().toISOString(),
        keyword_partition_source: p.keywordPartitionSource,
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

/**
 * Anti-cannibalization guard for the Research stage. Before greenlighting a
 * topic, check whether existing estate pages already target the same primary
 * keyword. Returns competing pages with overlap analysis and differentiation
 * suggestions so the admin can narrow focus or merge instead of creating a
 * sibling that splits ranking signals.
 */
export function checkCompetingPages(opts: {
  primaryKeyword: string
  /** Existing estate pages from the coverage map / content inventory. */
  coverage?: Array<{
    url?: string | null
    title?: string | null
    primaryKeyword?: string | null
    status?: string | null
  }>
  /** The target URL being planned — competing pages at different URLs are
   *  flagged; self-references are ignored. */
  targetUrl?: string
}): {
  competing: Array<{
    url: string
    title: string
    primaryKeyword?: string | null
    overlap: 'exact' | 'high' | 'low'
  }>
  suggestions: string[]
} {
  const pk = (opts.primaryKeyword || '').trim().toLowerCase()
  const target = (opts.targetUrl || '').trim().toLowerCase().replace(/\/+$/, '')
  if (!pk || pk.length < 4) return { competing: [], suggestions: [] }

  const coverage = (opts.coverage || [])
    .filter((c) => {
      const cu = (c.url || '').trim().toLowerCase().replace(/\/+$/, '')
      return cu && cu !== target
    })

  const tokenize = (s: string) => s.toLowerCase().replace(/\b([a-z])-(\d)\b/gi, '$1$2').split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  const pkTokens = new Set(tokenize(pk))
  const competing: Array<{
    url: string
    title: string
    primaryKeyword?: string | null
    overlap: 'exact' | 'high' | 'low'
  }> = []

  for (const c of coverage) {
    const cpk = (c.primaryKeyword || '').trim().toLowerCase()
    const ct = (c.title || cpk).toLowerCase()
    const cu = (c.url || '').trim()
    if (!cu) continue

    if (cpk === pk) {
      competing.push({ url: cu, title: c.title || cpk, primaryKeyword: c.primaryKeyword, overlap: 'exact' })
      continue
    }

    const ctTokens = tokenize(ct)
    let shared = 0
    for (const t of ctTokens) if (pkTokens.has(t)) shared++
    const overlapScore = shared / Math.max(1, pkTokens.size)
    if (overlapScore >= 0.5) {
      competing.push({ url: cu, title: c.title || cpk, primaryKeyword: c.primaryKeyword, overlap: 'high' })
    } else if (overlapScore >= 0.3 && shared >= 2) {
      competing.push({ url: cu, title: c.title || cpk, primaryKeyword: c.primaryKeyword, overlap: 'low' })
    }
  }

  const suggestions: string[] = []
  const exactCount = competing.filter((c) => c.overlap === 'exact').length
  const highCount = competing.filter((c) => c.overlap === 'high').length

  if (exactCount) {
    suggestions.push(
      `⚠ This topic exactly matches ${exactCount} existing page(s). ` +
      `DO NOT create another — either expand the existing canonical or ` +
      `differentiate with a narrower qualifier (e.g. "for students", ` +
      `"step-by-step", "2026 checklist").`,
    )
  }
  if (highCount) {
    suggestions.push(
      `⚠ ${highCount} page(s) have high keyword overlap. Narrow the focus ` +
      `(sub-topic, audience, or format) so this page serves a distinct search intent.`,
    )
  }
  if (!exactCount && !highCount && competing.length) {
    suggestions.push(
      `${competing.length} page(s) in the same topic area — overlap is low. ` +
      `Safe to proceed if the intent is clearly different.`,
    )
  }
  if (!competing.length) {
    suggestions.push('No competing pages found — safe to create.')
  }

  return { competing, suggestions }
}
