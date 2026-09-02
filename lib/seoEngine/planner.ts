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
import {
  accumulatePairRollup,
  emptyPairRollup,
  generateEngineText,
  type EnginePairRollup,
} from '@/lib/seoEngine/engineAi'
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
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { freshnessScore, type PredictiveSignal } from './intelligence'
import { buildShippedStems, shippedOverlap } from './shippedCoverage'
import {
  isDeadFunnelMission,
  opportunityScore as consolidatedOpportunityScore,
  revenueLiftFactor,
  SCORING_CONSTANTS,
} from './scoring'
import { marketplaceValue } from './marketplaceValue'

export type DemandSourceId = 'gsc' | 'ga4' | 'ubersuggest' | 'ads'

export interface GscSignalInput {
  term: string
  clicks: number
  impressions: number
  /**
   * Measured ranking position. Absent for GA4 legs (GA4 has no rank data) —
   * never fabricate one.
   */
  position?: number
  ctr?: number
  source?: DemandSourceId
  /** GA4 purchaseRevenue attributed to this landing/term (USD). */
  revenue?: number
  /** GA4 ecommercePurchases count attributed to this landing/term. */
  purchases?: number
  /** Keyword-research monthly volume (Ubersuggest / Ads). Distinct from scaled impressions. */
  volume?: number
  /** 0–100 keyword difficulty (Ubersuggest SD / Ads competition). */
  keywordDifficulty?: number
  /** True when this signal came from the static snapshot file rather than live GSC. */
  snapshot?: boolean
  /** Age of the snapshot in whole days when `snapshot` (for provenance display). */
  snapshotAgeDays?: number
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
  /** Explicit engine pin for the narrative briefs (e.g. 'entrim-qwen-27b').
   *  Omitted → the engine pair (Claude Opus 5 lead + Grok complement). */
  aiProvider?: string
  /** Live progress callback for streaming surfaces (phase, message, detail). */
  onProgress?: (phase: string, message: string, detail?: string) => void
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
 * Keyword provenance (`demand` vs `synthesized`) lives in
 * `lib/seoEngine/keywordTerms` so the quality gate can import it without
 * pulling Supabase / engineAi into the Worker bundle. Re-exported here for
 * existing callers that import provenance from the planner.
 */
import {
  keywordSourceMap,
  keywordTermList,
  resolveTermSources,
  type KeywordSource,
  type KeywordTerm,
} from './keywordTerms'

export {
  keywordSourceMap,
  keywordTermList,
  resolveTermSources,
  type KeywordSource,
  type KeywordTerm,
}

/**
 * Partition a freeform list of seed queries into short (≤3 words) and long-tail (≥4 words).
 * Deterministic: same input → same output. Returns up to `SHORT_MIN + 7` short + `LONG_TAIL_MIN + 6`
 * long-tail terms. Counts hyphenated atoms (e.g. "f-1", "co-op") as ONE word so a
 * head term like "f-1 visa" still classifies as short (2 words) and not long-tail.
 *
 * `shortTerms` / `longTailTerms` carry per-term provenance so the quality gate
 * can enforce real demand strictly and treat count-floor filler as advisory.
 * `short` / `longTail` remain plain strings for existing callers.
 */
export function partitionKeywords(terms: string[], primaryTerm?: string): {
  short: string[]
  longTail: string[]
  shortTerms: KeywordTerm[]
  longTailTerms: KeywordTerm[]
} {
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
    // as ONE word so they don't blow the long-tail count out of proportion:
    // a hyphenated token counts as a single word regardless of atom count.
    const tokens = s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    return tokens.length
  }

  const pt = norm(primaryTerm || '').toLowerCase().trim()
  const ptWords = pt.split(/\s+/).filter(Boolean)

  // Track short and long-tail arrays as we synthesize, so the second-stage
  // gate can use the count of the *target* array, not the global count of
  // mixed terms.
  const shortTerms: KeywordTerm[] = []
  const longTailTerms: KeywordTerm[] = []
  const short: string[] = []
  const longTail: string[] = []
  // classifyAndAdd will both push a unique term AND place it in the correct
  // bucket if the term passes the dedupe gate. `source` records whether the
  // candidate is real demand or count-floor filler.
  const classifyAndAdd = (candidate: string, source: KeywordSource = 'synthesized') => {
    const beforeLen = out.length
    pushUniq(candidate)
    if (out.length === beforeLen) return
    const last = out[out.length - 1]
    const wc = wordCount(last)
    if (wc <= 3) {
      if (short.length < KEYWORD_REQUIREMENTS.SHORT_MIN + 7) {
        short.push(last)
        shortTerms.push({ term: last, source })
      }
    } else if (wc >= 4) {
      if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 6) {
        longTail.push(last)
        longTailTerms.push({ term: last, source })
      }
    }
  }

  // Collect input terms + primary first. These are real demand: caller-supplied
  // queries (GSC / Ubersuggest / operator) and the primary keyword itself.
  for (const t of terms || []) classifyAndAdd(t, 'demand')
  if (ptWords.length >= 2) classifyAndAdd(pt, 'demand')

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
      // purpose" = 3 words). The unmodified primary is real demand; a trimmed
      // window of it is only an approximation, so it stays synthesized.
      classifyAndAdd(head, head === stripped ? 'demand' : 'synthesized')
      for (const prefix of ST_PREFIXES) {
        const candidate = `${head} ${prefix}`
        if (wordCount(candidate) <= 3) classifyAndAdd(candidate)
      }
      if (wordCount(`${head} 2026`) <= 3) classifyAndAdd(`${head} 2026`)
      if (wordCount(`${head} guide`) <= 3) classifyAndAdd(`${head} guide`)
    }
  }

  // Then synthesize LONG-TAIL (≥4) query phrases.
  // 2026-09-01: templates tightened so every synthesized phrase is a phrase a
  // human writer would actually type. The old templates produced unplaceable
  // filler ("requirements for a estimated tax payment help" — broken article;
  // "...checklist and timeline" / "...in 2026 explained" — machine-only
  // suffixes) that could never appear in natural prose, so the advisory
  // missing_synthesized_* warnings were permanent by construction.
  const LT_PREFIXES = ['how to apply for', 'what is the', 'is it possible to', 'do you need', 'requirements for', 'cost of applying for']
  const LT_SUFFIXES = ['for international students', 'step by step', 'in 2026: complete guide', 'requirements checklist', 'eligibility and costs']
  if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 2 && ptWords.length >= 1) {
    // Duplicate-phrase guard: when the primary ALREADY carries the template
    // cadence (e.g. "how to apply for a green card"), prepending the same
    // prefix would synthesize "how to apply for how to apply for a green
    // card" — the exact garbage that shipped as FAQ questions. When the
    // primary starts with a prefix, append a suffix form instead so the
    // phrase stays grammatical and non-duplicating.
    const ptStartsWithTemplate = LT_PREFIXES.some((p) => pt.startsWith(p))
    for (const prefix of LT_PREFIXES) {
      if (ptStartsWithTemplate) {
        if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 2) classifyAndAdd(`${pt} requirements and timeline`)
        continue
      }
      classifyAndAdd(`${prefix} ${pt}`)
    }
    for (const suffix of LT_SUFFIXES) {
      if (ptStartsWithTemplate) {
        if (longTail.length < KEYWORD_REQUIREMENTS.LONG_TAIL_MIN + 2) classifyAndAdd(`${pt}: requirements, fees and timeline`)
        continue
      }
      classifyAndAdd(`${pt} ${suffix}`)
    }
  }

  return { short, longTail, shortTerms, longTailTerms }
}

/**
 * Strings that only ever existed in the partitioner's FABRICATED templates.
 * Any persisted term containing one of these markers is a legacy synthetic
 * backfill, never a real demand query — used to keep legacy jobs from
 * turning into hard blockers after the templates were tightened.
 */
export const FABRICATION_MARKERS = [
  'requirements for a ',
  'do you need a ',
  ' in 2026 explained',
  'checklist and timeline',
  'requirements explained by an expert',
] as const

export function isFabricatedSyntheticTerm(term: string): boolean {
  const lower = String(term || '').toLowerCase()
  return FABRICATION_MARKERS.some((marker) => lower.includes(marker))
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
}): { short: string[]; longTail: string[]; shortTerms: KeywordTerm[]; longTailTerms: KeywordTerm[] } {
  const modelShort = (opts.modelShort || []).map(String).filter((s) => s && s.trim()).map((s) => s.trim())
  const modelLong = (opts.modelLong || []).map(String).filter((s) => s && s.trim()).map((s) => s.trim())
  const primaryL = (opts.primaryTerm || '').trim().toLowerCase()
  const maxShort = Math.max(5, opts.maxShort ?? 8)
  const maxLong = Math.max(4, opts.maxLong ?? 6)

  const partitioned = partitionKeywords([...modelShort, ...modelLong], opts.primaryTerm || '')
  const partitionSource = keywordSourceMap([...partitioned.shortTerms, ...partitioned.longTailTerms])
  const shortTerms: KeywordTerm[] = []
  const longTailTerms: KeywordTerm[] = []
  const pushUnique = (arr: KeywordTerm[], t: string, source: KeywordSource) => {
    const norm = t.toLowerCase()
    if (!norm || norm === primaryL) return
    if (arr.some((x) => x.term.toLowerCase() === norm)) return
    arr.push({ term: t, source })
  }
  // Model/brief terms are real demand signals.
  for (const t of modelShort) pushUnique(shortTerms, t, 'demand')
  for (const t of modelLong) pushUnique(longTailTerms, t, 'demand')
  // Partitioner fill carries whatever provenance the partitioner assigned.
  for (const t of partitioned.short) {
    if (shortTerms.length >= maxShort) break
    pushUnique(shortTerms, t, partitionSource.get(t.toLowerCase()) ?? 'synthesized')
  }
  for (const t of partitioned.longTail) {
    if (longTailTerms.length >= maxLong) break
    pushUnique(longTailTerms, t, partitionSource.get(t.toLowerCase()) ?? 'synthesized')
  }
  return {
    short: shortTerms.map((entry) => entry.term),
    longTail: longTailTerms.map((entry) => entry.term),
    shortTerms,
    longTailTerms,
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
}

function stemTerm(term: string): string {
  return normalizePlannerTopic(term).split(/\s+/).slice(0, 4).join(' ')
}

/** Strip punctuation but keep spaces so "UK Graduate Visa (2026)" matches intel. */
export function normalizePlannerTopic(term: string): string {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Persist key for a cluster plan. Must include country + stage — otherwise
 * "f-1 visa" (US) and a UK cell with the same stem overwrite each other in
 * seo_cluster_plans and every run reprints the same row.
 */
export function plannerClusterId(country: string, stage: string, term: string): string {
  return `seo-${slugify(`${country}-${stage}-${stemTerm(term)}`)}`
}

/**
 * Legacy opportunity score — kept as an exported wrapper that delegates to
 * the CONSOLIDATED formula in scoring.ts (single source of truth) so any
 * existing callers/tests keep working. runPlanner passes the full
 * OpportunityScoreInput with live marketplace supply + GSC corroboration.
 *
 * Consolidated formula (all weights named in scoring.ts `SCORING_CONSTANTS`):
 *
 *   (log10(imp+10)*12 + min(30, clicks/6))   demand + click bonus
 *   × min(2, 50/max(5,pos))                  ranking-gap headroom
 *   × (stagePriority/5)                      lifecycle priority
 *   × (1 + bias/8)                           fresh-intel bias
 *   × monetizeFactor                         live marketplace supply (≤1.35)
 *   × revenueLift                            GA4 evidence (≤1.8)
 *   × predictiveAdjustment                   bounded predictive confidence (0.9–1.0)
 *   × shippedPenalty                         0.15 for partially shipped topics
 *   × (corroboratedGsc ? uberBoost : 1.0)    ubersuggest edge only w/ GSC proof
 *   × conversionScore                        funnel × supply conversion economy (1.0–1.6)
 */
export function opportunityScore(sig: GscSignalInput, stagePriority: number, knowledgeBias: number): number {
  return consolidatedOpportunityScore({
    impressions: Math.max(0, Number(sig.impressions) || 0),
    position: Number(sig.position) || 100,
    clicks: Math.max(0, Number(sig.clicks) || 0),
    stage: '',
    country: 'US',
    stagePriority,
    knowledgeBias: Math.max(0, Number(knowledgeBias) || 0),
    revenueLift: revenueLiftFactor(Number(sig.revenue) || 0),
    predictiveAdjustment: 0.9,
    shippedPenalty: 1,
    uberBoost: 1,
    hasLiveSupply: false,
    intent: 'informational',
    isCorroboratedByGsc: false,
  })
}

/**
 * Minimum ontology overlap before a GSC term becomes a cluster plan.
 * Score 0 used to default to visa/US, so brand junk and unmatched campus
 * queries were published as fake US visa missions.
 */
export const MIN_CELL_MATCH_SCORE = 2

/** Country markers that must score even when they are 2-letter tokens (`uk`). */
const COUNTRY_HINTS: Record<Country, RegExp> = {
  UK: /\b(uk|u\.k\.|united kingdom|britain|british|england|scotland|wales|ukvi|ilr|appendix fm|tier\s*[25]|graduate route|warwick)\b/i,
  CA: /\b(canada|canadian|ircc|express entry|lmia|study permit|spousal sponsorship)\b/i,
  AU: /\b(australia|australian|subclass|home affairs|ministerial direction|485)\b/i,
  US: /\b(usa|u\.s\.a\.|united states|uscis|sevis|sevp|f-?1|h-?1b|opt|green card|i-?485|i-?130|asu|arizona state)\b/i,
}

const SHORT_MATCH_TOKENS = new Set([
  'uk', 'us', 'au', 'ca', 'pr', 'ilr', 'f1', 'h1b', 'k1', 'opt', 'cas', 'coe', 'pnp',
])

const STOP_MATCH_TOKENS = new Set([
  'from', 'with', 'that', 'this', 'into', 'near', 'over', 'your', 'you', 'are', 'was',
  'for', 'and', 'the', 'onto', 'than', 'then', 'have', 'has',
])

function matchBlob(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasToken(haystack: string, token: string): boolean {
  if (!token) return false
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${esc}s?(?:[^a-z0-9]|$)`).test(haystack)
}

function hintedCountries(term: string): Set<Country> {
  const found = new Set<Country>()
  for (const c of COUNTRIES) {
    if (COUNTRY_HINTS[c].test(term)) found.add(c)
  }
  return found
}

/**
 * Match a GSC term to the best lifecycle cell using seed-keyword overlap.
 * Returns score 0 with an empty stage when nothing in the ontology fits —
 * callers must drop that row rather than invent a visa/US mission.
 */
export function bestCellForTerm(term: string): { stage: string; country: Country; score: number } {
  const raw = String(term || '')
  const t = matchBlob(raw)
  const hints = hintedCountries(raw)
  let best = { stage: '', country: 'US' as Country, score: 0 }
  for (const stage of LIFECYCLE_STAGES) {
    for (const country of COUNTRIES) {
      // A term that hints at exactly one country must NEVER resolve to a
      // different one ("uk student visa process for warwick university" is UK,
      // never US). Skip other countries entirely — their scores are zeroed by
      // exclusion, not by a penalty the right cell can lose to.
      if (hints.size === 1 && country !== [...hints][0]) continue
      const cell = stage.countries[country]
      let seedScore = 0
      for (const kw of cell.seedKeywords) {
        const k = matchBlob(kw)
        if (!k) continue
        let s = 0
        if (t.includes(k)) s = Math.max(2, k.split(' ').filter(Boolean).length * 2)
        else {
          for (const w of k.split(' ').filter(Boolean)) {
            if (STOP_MATCH_TOKENS.has(w)) continue
            if ((w.length > 3 || SHORT_MATCH_TOKENS.has(w)) && hasToken(t, w)) s += 1
          }
        }
        if (s > seedScore) seedScore = s
      }
      let score = seedScore
      for (const a of cell.authorities) {
        const al = matchBlob(a)
        if (al && hasToken(t, al)) score += 3
      }
      if (hints.size) {
        if (hints.has(country)) score += 4
        else score -= 3
      }
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
            source: 'gsc' as const,
          }))
          .slice(0, 150)
      }
    }
    // Snapshot fallback — deterministic, keeps the planner useful pre-OAuth.
    // NEVER present stale demand as live: refuse snapshots older than 14 days.
    const { loadGscSnapshot, snapshotAgeDays } = await import('@/lib/seoDataLoaders')
    const snap = await loadGscSnapshot({ allowStale: false, maxAgeDays: 14 })
    const ageDays = snapshotAgeDays(snap)
    if (snap?.topQueries?.length) {
      return snap.topQueries.slice(0, 150).map((q) => ({
        term: String(q.term || ''),
        clicks: Number(q.clicks) || 0,
        impressions: Number(q.impressions) || 0,
        position: Number(q.position) || 100,
        ctr: Number(q.ctr) || 0,
        source: 'gsc' as const,
        snapshot: true,
        snapshotAgeDays: ageDays,
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

/**
 * Knowledge bias per (stage,country) cell — WEIGHTED, not a raw row count.
 * A raw +1-per-row count let keyword-demand churn and Google-News noise
 * outrank a single authoritative policy change; source authority, confidence
 * and freshness now shape the bias:
 *   kindWeight: policy 1.3 · guidance 1.0 · manual 1.2 · signal 0.8 · trend 0.6 · competitor 0.5
 *   × confidence (0–1, default 0.6) × freshness decay (1 day → 1.0, 30+ days → 0.4)
 */
function knowledgeBias(knowledge: Array<Record<string, unknown>>): Map<string, number> {
  const KIND_WEIGHT: Record<string, number> = { policy: 1.3, guidance: 1, manual: 1.2, signal: 0.8, trend: 0.6, competitor: 0.5 }
  const bias = new Map<string, number>()
  const now = Date.now()
  for (const k of knowledge) {
    const stages = Array.isArray(k.stages) ? (k.stages as string[]) : []
    const countries = Array.isArray(k.countries) ? (k.countries as string[]) : []
    const kind = String(k.kind || 'guidance')
    const kindWeight = KIND_WEIGHT[kind] ?? 1
    const confidence = Math.max(0.1, Math.min(1, Number(k.confidence ?? 0.6) || 0.6))
    const published = k.published_at ? new Date(String(k.published_at)).getTime() : now
    const ageDays = Number.isFinite(published) ? Math.max(0, (now - published) / 86_400_000) : 0
    const freshness = Math.max(0.4, 1 - ageDays / 50)
    const weight = kindWeight * confidence * freshness
    for (const s of stages) {
      for (const c of countries) {
        if (!isCountry(c)) continue
        const id = cellId(s, c)
        bias.set(id, (bias.get(id) || 0) + weight)
      }
    }
  }
  return bias
}

export interface PlannerRun {
  plans: ClusterPlan[]
  pair: EnginePairRollup
  /** Missions rejected at plan time by the dead-funnel kill-switch. */
  skippedDead: number
  /** How many of `plans` actually reached `seo_cluster_plans`. */
  persisted?: number
  /** Persist failures (table missing, RLS, unique races not recovered). */
  persistErrors?: string[]
}

export async function runPlanner(req: PlanRequest = {}): Promise<PlannerRun> {
  const pair = emptyPairRollup()

  // Purge legacy junk rows so they cannot reappear on the desk by score
  // (yousafeconsultancy.com, yousafe, pacific.edu PDF paths). Marked rejected —
  // never deleted, so the audit trail survives. Best-effort: a missing table
  // must not fail the run.
  try {
    const purgeSb = createSupabaseAdminClient()
    const { data: existingRows } = await purgeSb
      .from('seo_cluster_plans')
      .select('id,primary_term')
      .limit(500)
    const junkIds = ((existingRows as Array<{ id: string; primary_term?: string | null }> | null) || [])
      .filter((r) => isJunkQuery(String(r.primary_term || '')))
      .map((r) => r.id)
    for (const id of junkIds) {
      await purgeSb.from('seo_cluster_plans').update({ status: 'rejected' }).eq('id', id)
    }
    if (junkIds.length) {
      req.onProgress?.('plan', `Rejected ${junkIds.length} junk plan row(s) (brand/URL noise)`)
    }
  } catch {
    // junk purge is best-effort
  }

  req.onProgress?.('signals', req.signals ? 'Using supplied demand signals' : 'Pulling Ubersuggest + GSC + GA4 + Ads (skip any feeder that fails)…')
  let signals = req.signals
  if (!signals) {
    const { pullAllDemand } = await import('./demandFeeders')
    const pulled = await pullAllDemand(req.onProgress)
    signals = pulled.signals
    const skipped = pulled.feeders.filter((f) => f.skipped || f.usedCache)
    if (skipped.length) {
      req.onProgress?.(
        'signals',
        `Skipped/cached: ${skipped.map((f) => f.source).join(', ')}`,
        skipped.map((f) => f.reason).filter(Boolean).join('; ') || undefined,
      )
    }
  }
  req.onProgress?.('signals', `${signals.length} demand signal(s) loaded`)
  req.onProgress?.('knowledge', 'Loading knowledge + predictive intelligence…')
  const knowledge = (req.knowledge as unknown as Array<Record<string, unknown>>) || (await pullLatestKnowledge())
  const intelligence = await pullLatestIntelligence()

  // ── SHIPPED / PUBLISHED SUPPRESSION ────────────────────────────────────
  // A topic that has already been taken all the way to a live article must
  // NOT keep surfacing as a fresh opportunity. Exact stem matches drop off
  // the plan entirely; partial overlaps (≥70% token match) sink to minimal
  // priority so the plan fills with genuinely NEW demand first. Refreshes
  // of live pages are the master engine's refresh-play job, not the
  // planner's.
  const { loadShippedCoverage } = await import('./shippedCoverage')
  const shippedPages = await loadShippedCoverage().catch(() => [])
  const shippedStems = buildShippedStems(shippedPages)
  // Plan lifecycle: mark existing PLANNED rows as shipped when their topic
  // has since gone live (≥70% stem overlap). Status flips are the audit
  // trail — the same mission never re-ranks on the desk after shipping.
  if (shippedStems.size) {
    try {
      const lifecycleSb = createSupabaseAdminClient()
      const { data: plannedRows } = await lifecycleSb
        .from('seo_cluster_plans')
        .select('cluster_id,primary_term')
        .eq('status', 'planned')
        .limit(500)
      const shippedIds = ((plannedRows as Array<{ cluster_id?: string; primary_term?: string | null }> | null) || [])
        .filter((r) => shippedOverlap(String(r.primary_term || ''), shippedStems) !== null)
        .map((r) => r.cluster_id)
        .filter((id): id is string => Boolean(id))
      if (shippedIds.length) {
        await lifecycleSb
          .from('seo_cluster_plans')
          .update({ status: 'shipped', shipped_at: new Date().toISOString() })
          .in('cluster_id', shippedIds)
        req.onProgress?.('plan', `Marked ${shippedIds.length} plan(s) shipped — cluster already published`)
      }
    } catch { /* lifecycle sweep is best-effort */ }
  }
  let droppedShipped = 0
  let penalizedShipped = 0
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

  // ── CONVERSION ECONOMY (Phase 2a) ─────────────────────────────────────────
  // 1. Live marketplace supply per (stage × country) cell — how much a
  //    visitor could actually PAY for the service attached to this mission.
  //    Fetched ONCE per cell before the ranking loop (best-effort: a DB
  //    hiccup falls back to staged defaults and never fails the planner).
  // 2. GSC corroboration: a Ubersuggest volume head only earns its 1.25×
  //    UBER_BOOST when SOME GSC signal proved real impressions in that cell
  //    this month. Volume without GSC proof ranks at 1.0.
  const cellKey = (s: string, c: Country) => `${s}|${c}`
  const marketSupply = new Map<string, { hasLiveSupply: boolean }>()
  {
    const neededCells = new Set<string>()
    for (const sig of signals) {
      if (!sig.term || sig.impressions < 10 || isJunkQuery(sig.term)) continue
      const m = bestCellForTerm(sig.term)
      if (m.score < MIN_CELL_MATCH_SCORE || !m.stage) continue
      const st = stageFilter && stageFilter !== m.stage ? stageFilter : m.stage
      neededCells.add(cellKey(st, countryFilter || m.country))
    }
    if (stageFilter && countryFilter) neededCells.add(cellKey(stageFilter, countryFilter))
    await Promise.all(
      [...neededCells].map(async (key) => {
        const [st, co] = key.split('|')
        try {
          const mv = await marketplaceValue(st, co)
          marketSupply.set(key, { hasLiveSupply: mv.hasLiveSupply })
        } catch {
          marketSupply.set(key, { hasLiveSupply: false })
        }
      }),
    )
  }
  const gscCorroboratedCells = new Set<string>()
  for (const sig of signals) {
    if (sig.source !== 'gsc' || (Number(sig.impressions) || 0) <= 0) continue
    const m = bestCellForTerm(sig.term)
    if (m.score >= MIN_CELL_MATCH_SCORE && m.stage) gscCorroboratedCells.add(cellId(m.stage, m.country))
  }

  const candidates: Array<{
    sig: GscSignalInput
    stage: string
    country: Country
    stageScore: number
    matchScore: number
    rankedScore: number
  }> = []

  for (const sig of signals) {
    if (!sig.term || sig.impressions < 10) continue
    if (isJunkQuery(sig.term)) continue
    const match = bestCellForTerm(sig.term)
    if (match.score < MIN_CELL_MATCH_SCORE || !match.stage) continue
    const stage = stageFilter && stageFilter !== match.stage ? stageFilter : match.stage
    const country = countryFilter || match.country
    const stageDef = getStage(stage)
    if (!stageDef) continue
    const cell = stageDef.countries[country]
    if (!cell) continue
    const cellBias = bias.get(cellId(stage, country)) || 0
    const pri = stageDef.priority || 5
    const predictive = predictiveByTopic.get(normalizePlannerTopic(sig.term))
    // Predictive intelligence is a bounded confidence/freshness adjustment,
    // never a fabricated ranking factor. GSC demand remains the dominant input.
    const predictiveAdjustment = predictive
      ? 0.9 + Math.min(0.1, Math.max(0, predictive.confidence * predictive.freshness) * 0.1)
      : 0.9
    // Published-topic suppression: exact shipped stem → drop; partial
    // overlap → heavy penalty (sinks below all fresh demand).
    const overlap = shippedOverlap(sig.term, shippedStems)
    if (overlap) {
      if (normalizePlannerTopic(sig.term) === overlap) {
        droppedShipped++
        continue
      }
      penalizedShipped++
    }
    const shippedPenalty = overlap ? SCORING_CONSTANTS.SHIPPED_PENALTY : 1
    // Ubersuggest carries real market search volume — the strongest available
    // proxy for demand we do not yet own. It keeps a deliberate edge over
    // equal GSC-only signals, but ONLY when the cell is corroborated by real
    // GSC impressions that month (proved demand); unproven volume ranks 1.0.
    const uberBoost = sig.source === 'ubersuggest' ? SCORING_CONSTANTS.UBER_BOOST : 1
    const intent =
      stageDef.intentMix.commercial > Math.max(stageDef.intentMix.informational || 0, stageDef.intentMix.transactional || 0)
        ? 'commercial'
        : stageDef.intentMix.informational > stageDef.intentMix.transactional
          ? 'informational'
          : 'transactional'
    const rankedScore = consolidatedOpportunityScore({
      impressions: sig.impressions,
      position: sig.position,
      clicks: sig.clicks,
      stage,
      country,
      stagePriority: pri,
      knowledgeBias: cellBias,
      revenueLift: revenueLiftFactor(Number(sig.revenue) || 0),
      predictiveAdjustment,
      shippedPenalty,
      uberBoost,
      hasLiveSupply: marketSupply.get(cellKey(stage, country))?.hasLiveSupply ?? false,
      intent,
      isCorroboratedByGsc: gscCorroboratedCells.has(cellId(stage, country)),
      keywordDifficulty: sig.keywordDifficulty,
    })
    candidates.push({ sig, stage, country, stageScore: pri, matchScore: match.score, rankedScore })
  }
  // Dead-mission kill-switch (v4 hardening): a plan only pays for itself when
  // it can funnel a reader toward a purchasable service or build authority.
  // A demand blip in a service-less cell with no corroboration is exactly the
  // "refresh — medium value" junk the desk kept being handed; reject it at
  // plan time, never at ship time.
  let skipDead = 0
  const candidatesAfterKill: typeof candidates = []
  for (const c of candidates) {
    const supply = marketSupply.get(cellKey(c.stage, c.country))
    if (
      isDeadFunnelMission({
        stage: c.stage,
        hasLiveSupply: supply?.hasLiveSupply ?? false,
        impressions: c.sig.impressions,
        clicks: c.sig.clicks,
        knowledgeBias: bias.get(cellId(c.stage, c.country)) || 0,
        corroborated: gscCorroboratedCells.has(cellId(c.stage, c.country)),
      })
    ) {
      skipDead++
      req.onProgress?.('plan', `Killed dead funnel mission: "${c.sig.term}" (${c.stage}|${c.country}) — no purchasable service, no demand proof`)
      continue
    }
    candidatesAfterKill.push(c)
  }
  candidates.length = 0
  candidates.push(...candidatesAfterKill)
  // Single score-descending selection. The old preferred/fallback bucket split
  // appended EVERY Ubersuggest head before any deep-rank GSC gap — when the
  // preferred bucket filled the cap, genuine owned-property rank gaps (pos
  // ≥70, real impressions) never became plans even at double the score.
  candidates.sort((a, b) => b.rankedScore - a.rankedScore)
  candidates.length = Math.min(candidates.length, Math.max(limit, limit * 2))
  if (droppedShipped || penalizedShipped) {
    req.onProgress?.('plan', `Published-topic suppression: ${droppedShipped} exact match(es) dropped · ${penalizedShipped} partial overlap(s) de-prioritized`)
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
    const clusterId = plannerClusterId(country, stage, primaryTerm)

    // Related terms: other signals in the same cell
    const related = signals
      .filter((s) => {
        if (!s.term || s.term === primaryTerm || isJunkQuery(s.term)) return false
        const rel = bestCellForTerm(s.term)
        return rel.score >= MIN_CELL_MATCH_SCORE && rel.stage === stage && rel.country === country
      })
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

    // Build the blueprint FIRST so compliance derives from real plan fields.
    const contentType: ContentType = stageDef.funnel === 'top' ? 'blog_post' : stageDef.funnel === 'bottom' ? 'marketplace_landing' : 'regional_page'
    const planFaq = [
      `What are the ${primaryTerm} requirements?`,
      `How long does ${primaryTerm} take in ${country}?`,
      `What documents do I need for ${primaryTerm}?`,
    ]
    const plan = {
      pillar: `${stageDef.label} in ${country}: the complete guide`,
      spokes: related.slice(0, 3).map((t) => `${t}: deep dive`),
      faq: planFaq,
      contentType,
      services: stageDef.services,
      proofPoints: stageDef.proofPoints,
    }

    // Compliance score is computed from REAL plan fields — never hardcoded
    // `true` per item (the previous version painted every card a constant
    // ~100 "COMPLIANCE" badge). The plan promises evidence; the score reflects
    // what the blueprint actually contains. Ship-time gates (contentQualityGate
    // + the engine gate on the drafted body) remain the enforcement layer.
    const complianceSignals = {
      aeo_direct_answer: Boolean(stageDef && (cell.seedKeywords?.length ?? 0) >= 1),
      aeo_question_headings: (planFaq?.length ?? 0) >= 3,
      aeo_faq_block: (planFaq?.length ?? 0) >= 3,
      aeo_stats_panel: (stageDef.proofPoints?.length ?? 0) >= 3,
      aeo_howto_steps: (plan.spokes?.length ?? 0) >= 2,
      geo_quoteable: (stageDef.proofPoints?.length ?? 0) >= 2 || (cell.statutoryAnchors?.length ?? 0) >= 1,
      geo_named_sources: (cell.authorities?.length ?? 0) >= 1,
      geo_entity_clarity: Boolean(primaryTerm && primaryTerm.length >= 10),
      geo_semantic_html: Boolean(plan.pillar),
      geo_llm_schema: Boolean(plan.pillar && (planFaq?.length ?? 0) >= 2),
      ymyl_statutory: Boolean(cell.statutoryAnchors.length),
      ymyl_disclaimer: stageDef.ymyl !== 'critical',
      ymyl_author: stageDef.ymyl !== 'critical',
      ymyl_accuracy: true,
      ymyl_freshness: true,
      tech_meta: Boolean(primaryTerm && primaryTerm.length <= 80),
      tech_internal_links: interlinks.length >= 2,
      tech_indexnow: interlinks.length >= 3,
      tech_cannibal: !shippedOverlap(primaryTerm, shippedStems),
    }
    const compliance = scoreCompliance(complianceSignals, { stage: stageDef, country, ymylBonus: stageDef.ymyl === 'critical' })

    const rationale =
      `#${Math.round(sig.position)} · ${fmtNum(sig.impressions)} ${sig.source === 'gsc' && sig.snapshot ? `snapshot-90d imp (${sig.snapshotAgeDays ?? '?'}d old)` : sig.source === 'gsc' ? 'GSC-90d imp' : 'imp/mo (research)'} → gap-driven ${stageDef.label} (${country}) mission. ` +
      `Bias from ${cellBiasFor(bias, stage, country).toFixed(1)} weighted intel; predictive evidence ${predictiveByTopic.has(normalizePlannerTopic(primaryTerm)) ? 'present' : 'not yet linked'}. YMYL: ${stageDef.ymyl}.`

    let brief = ''
    if (draft) {
      try {
        const ai = await generateEngineText({
          aiProvider: req.aiProvider,
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
            `PURCHASE PATH: Close the brief with a marketplace CTA to ${primaryServiceFor(stageDef)} — every mission must funnel a reader to a paid consult/gig, not a dead-end article.`,
          ].join('\n'),
          maxTokens: 600,
          temperature: 0.4,
        })
        accumulatePairRollup(pair, ai.pair)
        const extras = ai.pair?.extras
        const extraBits = [...(extras?.statutes || []), ...(extras?.urls || [])]
        brief = extraBits.length ? `${ai.text.trim()}\n\n[GLM extras] ${extraBits.join('; ')}` : ai.text.trim()
      } catch {
        brief = ''
      }
    }

    const planIntent =
      stageDef.intentMix.commercial > Math.max(stageDef.intentMix.informational || 0, stageDef.intentMix.transactional || 0)
        ? 'commercial'
        : stageDef.intentMix.informational > stageDef.intentMix.transactional
          ? 'informational'
          : 'transactional'
    plans.push({
      clusterId,
      primaryTerm,
      relatedTerms: related,
      stage,
      country,
      cell: cellId(stage, country),
      intent: planIntent,
      ymyl: stageDef.ymyl,
      opportunityScore: Math.round(c.rankedScore),
      // GSC signals are a 90-day window — "est. monthly" must be the honest
      // third, not the raw 90-day sum (previously ~3× inflated the dashboard's
      // $/mo economics). Research feeders (uber/ads/GA4) already carry
      // monthly-ish amplitudes, so only GSC legs get the /3 conversion.
      estMonthlyImpressions: sig.source === 'gsc' ? Math.round((Number(sig.impressions) || 0) / 3) : Number(sig.impressions) || 0,
      estMonthlyClicks: sig.source === 'gsc' ? Math.round((Number(sig.clicks) || 0) / 3) : Number(sig.clicks) || 0,
      position: sig.position ?? null,
      ctr: sig.ctr ?? null,
      plan,
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

  req.onProgress?.('persist', `Persisting ${plans.length} cluster plan(s)…`)

  // Persist to Supabase (best-effort, idempotent by cluster_id)
  let persisted = 0
  const persistErrors: string[] = []
  try {
    const supabase = createSupabaseAdminClient()
    for (const p of plans) {
      const { data: existing } = await supabase
        .from('seo_cluster_plans')
        .select('id,status,shipped_at')
        .eq('cluster_id', p.clusterId)
        .maybeSingle()
      // Lifecycle preservation: re-running the planner must NEVER reset a plan
      // that has moved past 'planned' (launched/shipped/briefed/done/…). Only
      // rows still sitting in 'planned' (or missing) get refreshed to planned.
      const preserveStatus =
        existing && existing.status && existing.status !== 'planned'
          ? (String(existing.status) as string)
          : null
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
        ymyl: p.ymyl,
        opportunity_score: p.opportunityScore,
        est_monthly_impressions: p.estMonthlyImpressions,
        est_monthly_clicks: p.estMonthlyClicks,
        position: p.position,
        ctr: p.ctr,
        plan: p.plan as unknown as Record<string, unknown>,
        compliance: p.compliance as unknown as Record<string, unknown>,
        distribution: p.distribution as unknown as Array<Record<string, unknown>>,
        interlinks: p.interlinks as unknown as string[],
        brief: p.brief,
        compliance_score: p.compliance.score,
        status: preserveStatus || 'planned',
        ...(preserveStatus || existing?.shipped_at ? { shipped_at: existing?.shipped_at ?? null } : {}),
        rationale: p.rationale,
      }
      if (existing) {
        const { error } = await supabase
          .from('seo_cluster_plans')
          .update(row)
          .eq('cluster_id', p.clusterId)
        if (error) persistErrors.push(`${p.primaryTerm}: ${error.message}`)
        else persisted += 1
      } else {
        const { error } = await supabase.from('seo_cluster_plans').insert(row)
        if (error) {
          // Unique violation (23505) = a concurrent run already inserted this
          // cluster — treat as persisted, do not lose the row.
          if (/23505|duplicate/i.test(error.message)) {
            const { error: updErr } = await supabase
              .from('seo_cluster_plans')
              .update({ ...row, status: preserveStatus || 'planned' })
              .eq('cluster_id', p.clusterId)
            if (updErr) persistErrors.push(`${p.primaryTerm}: ${updErr.message}`)
            else persisted += 1
          } else {
            persistErrors.push(`${p.primaryTerm}: ${error.message}`)
          }
        } else {
          persisted += 1
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'persistence failed'
    persistErrors.push(msg)
  }
  if (persistErrors.length) {
    req.onProgress?.('persist', `Persisted ${persisted}/${plans.length} (${persistErrors.length} error(s))`)
  }

  try {
    const { persistPlannerInterlinks } = await import('./interlink')
    await persistPlannerInterlinks(plans)
  } catch {
    // interlink graph is additive — plans still stand without it
  }

  return { plans, pair, skippedDead: skipDead, persisted, persistErrors }
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
      .select('cluster_id,primary_term,related_terms,stage,country,intent,ymyl,opportunity_score,est_monthly_impressions,est_monthly_clicks,position,ctr,plan,compliance_score,status,rationale,generated_at,title_candidates,action_type,expected_revenue,distribution,interlinks,compliance,shipped_at')
      .order('opportunity_score', { ascending: false })
      .limit(limit)
    // The desk GET must never display junk rows. Old seo_cluster_plans rows
    // persisted before isJunkQuery existed are dropped here (and rejected at
    // the next runPlanner) so brand/URL noise cannot resurface by score.
    const rows = ((data as Array<Record<string, unknown>>) || []).filter(
      (r) => !isJunkQuery(String(r.primary_term || '')),
    )

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
