/**
 * lib/seoEngine/rankingModel.ts
 *
 * SEO RANKING MODEL — v1 · the Studio powerhouse model.
 *
 * Fuses every observable signal family into ONE explainable, deterministic,
 * self-calibrating score (0–100), projects 30/60/90-day forecasts, and learns
 * from shipped outcomes via a reward/credit-assignment loop.
 *
 * Design philosophy (identical to the rest of the engine):
 *   - Deterministic scoring: NO AI inside the score. Every number is auditable.
 *   - Evidence-led: families consume GSC, knowledge, audits, links, index checks.
 *   - Honest: forecasts carry explicit assumptions; calibration is bounded and
 *     recorded in seo_model_calibration. This is a decision model, not a claim
 *     to reproduce Google's private pipeline.
 *
 * Mirror of the researched landscape (see SEO strategies/RANKING_MODEL_ARCHITECTURE.md):
 *   index-time (indexability, eeat, topicalAuthority, linkEquity) +
 *   query-time (demand, intent, behavioral) +
 *   answer-engine (aeoGeo).
 */

import { confidenceFromEvidence, freshnessScore, type EvidenceLineage } from './intelligence'
import { computeGscMix, junkSharePenalty } from '../seoFactory/gscMix'

export const RANKING_MODEL_VERSION = 'seo-ranking-model-v1'

// ── Signal families ──────────────────────────────────────────────────────────
export const SIGNAL_FAMILIES = [
  'demand',
  'intent',
  'topicalAuthority',
  'aeoGeo',
  'eeat',
  'linkEquity',
  'behavioral',
  'indexability',
] as const
export type SignalFamily = (typeof SIGNAL_FAMILIES)[number]

/** Default weights — sum ≈ 1.0. */
export const FAMILY_WEIGHTS: Record<SignalFamily, number> = {
  demand: 0.18,
  intent: 0.14,
  topicalAuthority: 0.16,
  aeoGeo: 0.14,
  eeat: 0.12,
  linkEquity: 0.1,
  behavioral: 0.08,
  indexability: 0.08,
}

/** Calibration is bounded: a family can never drift more than this from its base. */
export const MAX_FAMILY_DELTA = 0.05
export const CALIBRATION_LEARNING_RATE = 0.02

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)))
}

// ── Intent taxonomy ──────────────────────────────────────────────────────────
export type IntentPrimary = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'local'
export type IntentSubType =
  | 'procedural' | 'comparative' | 'definitional' | 'checklist'
  | 'eligibility' | 'document' | 'timeline' | 'cost' | 'general'

export interface IntentClassification {
  primary: IntentPrimary
  subType: IntentSubType
  /** Human-readable notes on what the reward system (search + answer engines) rewards here. */
  reward: string[]
}

const SUBTYPE_META: Array<{ re: RegExp; sub: IntentSubType; reward: string }> = [
  // Order matters: a form number makes it a document query even when other
  // checklist words are present, so `document` must precede `checklist`.
  { re: /\b(form [a-z]?-?\d+|imm\s?\d+|subclass\s?\d+|i-\d+|n-\d+)\b/i, sub: 'document', reward: 'Document intent → form pack, per-field walkthrough, schema.org Article/FAQ.' },
  { re: /\b(vs\.?|versus|difference|compare|comparison|which is better)\b/i, sub: 'comparative', reward: 'Comparative intent → comparison tables + decision guidance are snippet/AIO-eligible.' },
  { re: /\b(what is|definition|meaning|explained|overview)\b/i, sub: 'definitional', reward: 'Definitional intent → crisp 20–25 word answer capsule + glossary sentence.' },
  { re: /\b(checklist|documents?|required (documents|evidence)|what do i need|requirements?)\b/i, sub: 'checklist', reward: 'Checklist intent → structured lists are directly quotable by answer engines.' },
  { re: /\b(eligibility|who can|am i eligible|qualify|qualification)\b/i, sub: 'eligibility', reward: 'Eligibility intent → requirements matrix + official source citations.' },
  { re: /\b(how long|processing time|timeline|duration|how fast|wait)\b/i, sub: 'timeline', reward: 'Timeline intent → current official processing-time data (freshness-critical).' },
  { re: /\b(cost|fee|how much|price|charges)\b/i, sub: 'cost', reward: 'Cost intent → official fee tables; never invent figures.' },
  { re: /\b(how (to|do|can|does)|steps?|process|procedure|apply for)\b/i, sub: 'procedural', reward: 'Procedural intent → numbered steps; featured-snippet and AIO favorites.' },
]

/** Deterministic intent classification with reward-system alignment notes. */
export function classifyIntent(term: string): IntentClassification {
  const t = String(term || '').toLowerCase()
  const sub = SUBTYPE_META.find((m) => m.re.test(t)) || { sub: 'general' as IntentSubType, reward: 'General informational — cover the core question first, then fan-out sub-queries.' }

  let primary: IntentPrimary = 'informational'
  if (/\b(yousafe|mycaseworks|portal|login|sign in|official site)\b/i.test(t)) primary = 'navigational'
  else if (/\b(near me|in [a-z]+ (city|town)|[a-z]+ city)\b/i.test(t) || /for (indian|nigerian|kenyan|chinese|pakistani|filipino|ghanaian|vietnamese|iranian)/i.test(t)) primary = 'local'
  else if (/\b(buy|hire|pay|order|price|quote|consult|lawyer|attorney|agency|service|gig)\b/i.test(t)) primary = 'transactional'
  else if (/\b(vs\.?|versus|compare|best|top|options|alternative|review)\b/i.test(t)) primary = 'commercial'
  else if (/\b(how|what|when|why|who|can i|do i)\b/i.test(t)) primary = 'informational'

  const reward: string[] = []
  if (primary === 'informational' && sub.sub !== 'general') reward.push(sub.reward)
  if (primary === 'navigational') reward.push('Navigational — only build if the estate must own the brand query; otherwise deprioritize.')
  if (primary === 'local') reward.push('Geo-modified intent → regional journey page handing off to the legal canonical (intent-ownership law).')
  if (primary === 'transactional') reward.push('Transactional → marketplace CTA surface; must not cannibalize the informational canonical.')
  if (/\b(yes|fee|processing time|requirements)\b/i.test(t)) reward.push('High-value YMYL sub-query — statutory anchors + disclaimers mandatory.')

  return { primary, subType: sub.sub, reward }
}

/**
 * Purchase-funnel bias applied to the composite total.
 * Transactional/commercial outrank informational at equal demand;
 * visa/work/housing/citizenship/family stages get an extra lift.
 */
/**
 * Real GA4 purchase revenue lift. $0 → 1×; ~$1k → ~1.5×; capped at 1.85×.
 * Sessions alone never produce this — only attributed purchaseRevenue.
 */
export function revenueLift(revenue?: number | null): number {
  const r = Math.max(0, Number(revenue) || 0)
  if (r <= 0) return 1
  return Math.min(1.85, 1 + Math.log10(r + 10) / 5)
}

export function monetaryBias(
  intent: IntentClassification,
  stage?: string | null,
  revenue?: number | null,
): number {
  let b = 1
  if (intent.primary === 'transactional') b = 1.35
  else if (intent.primary === 'commercial') b = 1.2
  else if (intent.primary === 'navigational') b = 0.5
  if (intent.subType === 'cost' || intent.subType === 'eligibility') b += 0.08
  if (stage && /^(visa|work|housing|citizenship|family)$/i.test(stage)) b += 0.12
  return b * revenueLift(revenue)
}

// ── Model input / output ─────────────────────────────────────────────────────
export interface RankingModelInput {
  topic: string
  scope?: 'topic' | 'page' | 'plan'
  subjectKey?: string | null
  url?: string | null
  country?: string | null
  stage?: string | null
  intentOverride?: IntentPrimary
  gsc?: {
    impressions?: number
    clicks?: number
    ctr?: number
    position?: number
    /**
     * Per-query breakdown (term/url + metrics). When present, demand is scored
     * from the ELIGIBLE aggregate only (junk PDF/URL/brand rows excluded) with
     * a junk-share penalty (GSC push-through Phase B).
     */
    queryRows?: Array<{
      term?: string
      url?: string
      impressions?: number
      clicks?: number
      ctr?: number
      position?: number
    }>
    /** Position history (ascending by date) for the behavioral family. */
    history?: Array<{ position?: number; impressions?: number; clicks?: number; date?: string }>
  }
  audit?: {
    hasAuthor?: boolean
    hasGovCitation?: boolean
    hasDisclaimer?: boolean
    wordCount?: number
    answerCapsule?: boolean
    faqBlock?: boolean
    statsPresent?: boolean
    questionsAsHeadings?: boolean
    schemaTypes?: string[]
    crawlable?: boolean
    canonicalOk?: boolean
    llmsTxt?: boolean
  }
  links?: {
    internalLinks?: number
    referringDomains?: number
    /** 0–100 external authority proxy (backlink engine authority_score). */
    backlinkAuthority?: number
  }
  evidence?: EvidenceLineage[]
  /** 0–1 fresh policy/trend bias for this topic's (stage × country) cell. */
  knowledgeBias?: number
  /** GA4 purchaseRevenue (USD) attributed to this topic/landing. */
  revenue?: number
  /** GA4 ecommercePurchases attributed to this topic/landing. */
  purchases?: number
  /**
   * MEASURED LLM/AEO citation evidence for this topic's cluster: how many
   * fan-out sub-query audits cited the estate. Feeds the aeoGeo family with
   * real observations (never guessed). `total` > 0 is required for the bonus.
   */
  llmVisibility?: { cited: number; total: number }
}

export interface FamilyScore {
  score: number
  weight: number
  reasons: string[]
}

export interface RankingScore {
  modelVersion: string
  topic: string
  scope: string
  subjectKey: string | null
  url: string | null
  country: string | null
  stage: string | null
  intent: IntentClassification
  families: Record<SignalFamily, FamilyScore>
  total: number
  confidence: number
  forecast: ForecastResult
  recommendedActions: string[]
  reasons: string[]
  computedAt: string
}

// ── Family scorers (deterministic) ───────────────────────────────────────────
function expectedCtr(position: number): number {
  if (position <= 1) return 0.28
  if (position <= 3) return 0.15
  if (position <= 5) return 0.1
  if (position <= 10) return 0.05
  if (position <= 20) return 0.025
  return 0.01
}

/** Demand: eligible-only log-scaled volume + CTR gap (suppressed past #20) + position headroom, with a junk-share penalty. */
function scoreDemand(gsc?: RankingModelInput['gsc']): FamilyScore {
  const reasons: string[] = []
  // GSC push-through Phase B + P1: score the QUALIFIED aggregate only — junk
  // (PDF/URL/brand) rows, off-mission real demand (campus housing/lifestyle
  // with no immigration-document anchor) and the deep tail never count as
  // demand, and a property drowning in PDF queries takes the junk-share
  // penalty. An off-mission-only property therefore reads exactly like a
  // property with no GSC data.
  // `qualified` when present; a pre-P1 mix shape only carries the `eligible`
  // alias (same aggregate), and a missing junk share defaults to 0.
  const gscMix = computeGscMix(gsc)
  const eg = gscMix.qualified ?? gscMix.eligible
  const impressions = eg.impressions
  const position = eg.position || 100
  const ctr = eg.ctr
  const clicks = eg.clicks
  if (!impressions && !clicks) {
    reasons.push('No GSC demand observed — treat as exploratory.')
    return { score: 18, weight: FAMILY_WEIGHTS.demand, reasons }
  }
  const junkShare = gscMix.junk?.share ?? 0
  const junkPenalty = junkSharePenalty(junkShare)
  const imp = Math.log10(Math.max(1, impressions) + 9) // ~1–3+
  const posW = position <= 20 ? 1.25 : position <= 40 ? 1.05 : 0.85
  // CTR gap is meaningless past #20 (a pos-32 0.3% CTR is on-curve) — suppress.
  const ctrGap = position > 20 ? 0 : Math.max(0, expectedCtr(position) - ctr)
  const score = clamp100((imp * 30 * posW + ctrGap * 300 + Math.min(clicks, 60) * 0.5) * junkPenalty)
  if (impressions >= 500) reasons.push(`Real demand: ${impressions.toLocaleString()} impressions/mo on eligible queries`)
  else if (impressions > 0) reasons.push(`${impressions.toLocaleString()} impressions/mo on eligible queries (long-tail)`)
  if (ctrGap > 0.02) reasons.push(`CTR gap vs expected at #${Math.round(position)} — headline/intro rewrite upside`)
  if (position > 20) reasons.push(`Deep rank #${Math.round(position)} on eligible queries — headroom to climb`)
  if (junkShare > 0.2) reasons.push(`Junk query share ${Math.round(junkShare * 100)}% — demand penalized`)
  return { score, weight: FAMILY_WEIGHTS.demand, reasons }
}

/** Intent: how aligned the query is with what engines reward. */
function scoreIntent(term: string, intent: IntentClassification): FamilyScore {
  const reasons: string[] = []
  if (intent.primary === 'navigational') {
    reasons.push('Navigational brand query — low organic priority.')
    return { score: 30, weight: FAMILY_WEIGHTS.intent, reasons }
  }
  if (intent.primary === 'local') {
    reasons.push('Geo-modified intent — build a journey page that hands off to the canonical.')
    return { score: 62, weight: FAMILY_WEIGHTS.intent, reasons }
  }
  const base = intent.primary === 'transactional' ? 90 : intent.primary === 'commercial' ? 78 : 55
  const subBonus: Record<IntentSubType, number> = {
    procedural: 26, checklist: 24, document: 22, definitional: 20,
    eligibility: 20, comparative: 18, timeline: 16, cost: 16, general: 6,
  }
  const score = clamp100(base + (subBonus[intent.subType] || 0))
  reasons.push(`Primary: ${intent.primary} · sub-type: ${intent.subType}`)
  reasons.push(intent.reward[0] || 'Clear informational intent — answer first, then fan-out.')
  return { score, weight: FAMILY_WEIGHTS.intent, reasons }
}

/** Topical authority: entity salience + cluster fill + fresh intel bias. */
const TOPIC_ENTITIES = [
  // US
  'opt', 'cpt', 'f-1', 'f1', 'h-1b', 'h1b', 'h-4', 'j-1', 'l-1', 'o-1', 'green card',
  'i-20', 'i-765', 'i-983', 'i-129', 'i-485', 'i-130', 'i-140', 'uscis', 'sevis',
  'stem opt', 'cap-gap', 'eb-1', 'eb-2', 'eb-3',
  // CA
  'pgwp', 'study permit', 'express entry', 'ircc', 'work permit', 'lmia', 'pnp',
  // UK
  'graduate route', 'student visa', 'skilled worker', 'ukvi', 'cas', 'brp', 'ilr',
  // AU
  '485', 'subclass 500', 'subclass 482', 'genuine student', 'gs requirement', 'pte',
  // Shared
  'visa', 'immigration', 'spouse', 'dependent', 'financial capacity', 'bank statement',
  'sop', 'statement of purpose', 'refusal', 'rfe',
]
function scoreTopicalAuthority(term: string, input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const t = term.toLowerCase()
  const hits = TOPIC_ENTITIES.filter((e) => t.includes(e)).length
  const entityDepth = clamp100(Math.min(4, hits) * 18 + (hits ? 12 : 0))
  const clusterBias = clamp100((input.knowledgeBias || 0) * 55 + (input.stage ? 18 : 0))
  const score = clamp100(entityDepth * 0.72 + clusterBias * 0.28)
  if (hits) reasons.push(`${hits} discipline entit${hits === 1 ? 'y' : 'ies'} (${TOPIC_ENTITIES.filter((e) => t.includes(e)).slice(0, 3).join(', ')}) — entity salience signal`)
  else reasons.push('No discipline entity in term — verify cluster fit before committing')
  if (input.knowledgeBias && input.knowledgeBias > 0.3) reasons.push(`Fresh intel bias ${Math.round((input.knowledgeBias || 0) * 100)}% for this cell`)
  if (input.stage) reasons.push(`Lifecycle cell: ${input.stage}`)
  return { score, weight: FAMILY_WEIGHTS.topicalAuthority, reasons }
}

/** AEO/GEO: answer-ability, citation-ability, fan-out coverage. */
const GEO_QUOTE_PATTERNS: RegExp[] = [
  /\b(official|uscis|ircc|ukvi|home affairs|gov\.?uk|sevp)\b/i,
  /\b(step[- ]by[- ]step|checklist|documents? (required|list)|how to apply)\b/i,
  /\b(form [a-z]?-?\d+|imm\s?\d+|subclass\s?\d+|i-\d+)\b/i,
]
function scoreAeoGeo(term: string, input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const a = input.audit || {}
  const t = term.toLowerCase()
  let score = 30
  if (a.answerCapsule) { score += 22; reasons.push('Answer capsule present') }
  if (a.faqBlock) { score += 16; reasons.push('FAQ block present (PAA/AIO-eligible)') }
  if (a.questionsAsHeadings) { score += 8; reasons.push('Question-form H2/H3 headings') }
  if (a.statsPresent) { score += 8; reasons.push('Statistics present (Princeton GEO: +30–40% citation lift)') }
  const hasSchema = Array.isArray(a.schemaTypes)
  if (hasSchema && (a.schemaTypes as string[]).some((s) => /faq|howto|article/i.test(s))) {
    score += 14
    reasons.push('FAQ/HowTo/Article schema')
  }
  const quoteHits = GEO_QUOTE_PATTERNS.filter((re) => re.test(t)).length
  if (quoteHits) { score += quoteHits * 5; reasons.push(`${quoteHits} quotable structural cue(s) in term`) }
  if (/(from |for (indian|nigerian|kenyan|chinese|pakistani|filipino|vietnamese|ghanaian|iranian))/.test(t)) {
    score += 6
    reasons.push('Geo/audience modifier — fan-out sub-query coverage')
  }
  // Measured LLM fan-out citation evidence (llmVisibility audits).
  const v = input.llmVisibility
  if (v && Number(v.total) > 0) {
    const cited = Math.max(0, Number(v.cited) || 0)
    const total = Number(v.total)
    const rate = clamp01(cited / total)
    // Bounded: perfect fan-out citation ≈ +14 (comparable to FAQ schema weight).
    score += Math.round(rate * 14)
    if (rate >= 0.5) reasons.push(`LLM fan-out audits: cited ${cited}/${total} sub-queries (${Math.round(rate * 100)}%) — measured share of voice`)
    else if (rate > 0) reasons.push(`LLM fan-out audits: only ${cited}/${total} sub-queries cited (${Math.round(rate * 100)}%) — gap vs answer engines`)
    else reasons.push(`LLM fan-out audits: 0/${total} sub-queries cited — answer engines not surfacing this cluster yet`)
  } else if (v) {
    reasons.push('No fan-out LLM audits yet — run the fan-out audit batch to measure AEO visibility')
  }
  return { score: clamp100(score), weight: FAMILY_WEIGHTS.aeoGeo, reasons }
}

/** E-E-A-T: verifiable expertise signals. */
function scoreEeat(input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const a = input.audit || {}
  let score = 15
  if (a.hasGovCitation) { score += 32; reasons.push('Official .gov/.edu citation') }
  if (a.hasAuthor) { score += 20; reasons.push('Named author/credential present') }
  if (a.hasDisclaimer) { score += 14; reasons.push('YMYL disclaimer present') }
  if (a.statsPresent) { score += 9; reasons.push('Verifiable data/statistics') }
  const wc = Number(a.wordCount) || 0
  if (wc >= 1500 && wc <= 6000) { score += 10; reasons.push(`Depth in ideal band (${wc}w)`) }
  else if (wc > 0 && wc < 1200) reasons.push(`Thin (${wc}w) — depth pass needed`)
  return { score: clamp100(score), weight: FAMILY_WEIGHTS.eeat, reasons }
}

/** Link equity: internal graph density + external authority proxy. */
function scoreLinkEquity(input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const l = input.links || {}
  let score = 12
  const internal = Number(l.internalLinks) || 0
  if (internal > 0) { score += clamp100(Math.log10(internal + 1) * 24); reasons.push(`${internal} internal in-links`) }
  else reasons.push('No internal in-links yet — run the interlink plan')
  const ba = clamp01(Number(l.backlinkAuthority) || 0)
  if (ba > 0) { score += ba * 52; reasons.push(`Backlink authority proxy ${Math.round(ba * 100)}/100`) }
  else reasons.push('No external authority signal — outreach ledger pending')
  const rd = Number(l.referringDomains) || 0
  if (rd > 0) { score += Math.min(12, rd); reasons.push(`${rd} referring domain(s)`) }
  return { score: clamp100(score), weight: FAMILY_WEIGHTS.linkEquity, reasons }
}

/** Behavioral: position trajectory + CTR trend + click momentum (NavBoost proxy). */
function scoreBehavioral(input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const g = input.gsc || {}
  const history = (g.history || []).filter((h) => h && h.position && h.position > 0)
  const position = Number(g.position) || 100
  const ctr = Number(g.ctr) || 0
  let score = position <= 10 ? 55 : position <= 20 ? 45 : position <= 40 ? 35 : 28
  if (history.length >= 2) {
    const first = history[0].position as number
    const last = history[history.length - 1].position as number
    if (last < first) { score += 26; reasons.push(`Position improving #${Math.round(first)} → #${Math.round(last)}`) }
    else if (last > first) { score -= 12; reasons.push(`Position decaying #${Math.round(first)} → #${Math.round(last)} — funnel climb needed`) }
    else reasons.push(`Stable at #${Math.round(last)}`)
  } else if (position < 100) {
    reasons.push(`Current rank #${Math.round(position)} (no history yet)`)
  }
  const ctrVs = ctr - expectedCtr(position)
  if (ctrVs > 0.01) { score += 14; reasons.push('CTR above expected — title matches intent') }
  else if (ctrVs < -0.02 && position < 100) { score -= 10; reasons.push('CTR below expected — funnel climb: rewrite title/intro') }
  return { score: clamp100(score), weight: FAMILY_WEIGHTS.behavioral, reasons }
}

/** Indexability: crawlable, canonical, schema, llms.txt, depth. */
function scoreIndexability(input: RankingModelInput): FamilyScore {
  const reasons: string[] = []
  const a = input.audit || {}
  let score = 22
  if (a.crawlable !== false) { score += 16; reasons.push('Crawlable') } else reasons.push('Blocked from crawl — fix robots/redirects')
  if (a.canonicalOk !== false) { score += 16; reasons.push('Canonical clean') } else reasons.push('Canonical conflict — consolidate')
  if (Array.isArray(a.schemaTypes) && (a.schemaTypes as string[]).length) { score += 16; reasons.push(`${(a.schemaTypes as string[]).length} schema type(s)`) }
  if (a.llmsTxt) { score += 14; reasons.push('llms.txt present') }
  const wc = Number(a.wordCount) || 0
  if (wc >= 1200) { score += 12; reasons.push(`Depth ${wc}w`) } else if (wc > 0) reasons.push('Thin body — depth pass')
  return { score: clamp100(score), weight: FAMILY_WEIGHTS.indexability, reasons }
}

// ── Forecast ─────────────────────────────────────────────────────────────────
/**
 * Funnel action taxonomy (Phase 2b — "mission verbs that mean money").
 * Every planned action is ONE of these five funnel kinds; each renders a human
 * bet label (FUNNEL_ACTION_LABELS) and an honest expected-USD/month estimate
 * (expectedMonthlyRevenue) so operators pick bets by economics, not verbs.
 *
 * Old actionFamily / ACTION_UPLIFT taxonomy → new kind:
 *   refresh, ctr_rewrite  → funnel_climb      (title/CTR/answer win)
 *   new_page, depth       → funnel_new        (build/expand a service-enabled guide)
 *   schema, geo_fix       → authority_anchor  (FAQ/statutory-neighbor pillar)
 *   interlink, backlink   → authority_anchor  (internal + external authority wiring)
 *   (no old 1:1)          → funnel_revenue    (add pricing + consult CTA)
 *   (cannibal overlap)    → kill_or_merge     (consolidate losers → canonical)
 */
export type FunnelActionKind =
  | 'funnel_new'
  | 'funnel_revenue'
  | 'funnel_climb'
  | 'authority_anchor'
  | 'kill_or_merge'

/** Operator-facing label per funnel kind (UI renders these later). */
export const FUNNEL_ACTION_LABELS: Record<FunnelActionKind, string> = {
  funnel_new: 'Funnel new · service-enabled guide',
  funnel_revenue: 'Funnel revenue · add pricing + consult CTA',
  funnel_climb: 'Funnel climb · win CTR/title/answer',
  authority_anchor: 'Authority anchor · statutory-neighbor pillar',
  kill_or_merge: 'Kill / merge · cannibal overlap ≥0.5',
}

/** One-line rationale per funnel kind (UI hint surface later). */
export const FUNNEL_ACTION_HINT: Record<FunnelActionKind, string> = {
  funnel_new: 'Build or expand the guide that routes this demand into the marketplace funnel.',
  funnel_revenue: 'Add the price/fee table and a consult CTA so an already-served visitor converts.',
  funnel_climb: 'Win the title/H1/intro + answer-capsule battle to lift CTR at the current rank.',
  authority_anchor: 'Anchor the statutory/government-neighbor page with FAQ, schema, citations.',
  kill_or_merge: 'Consolidate the cannibal overlap (evidence ≥0.5) into one canonical winner.',
}

export interface PlannedAction {
  action: FunnelActionKind
  strength?: 1 | 2 | 3
}
export interface ForecastPoint {
  horizonDays: 30 | 60 | 90
  projectedPosition: number
  projectedImpressions: number
  projectedClicks: number
  probabilityOfTop10: number
  lift: number
}
export interface ForecastResult {
  baseline: { position: number | null; impressions: number; clicks: number; ctr: number }
  points: ForecastPoint[]
  assumptions: string[]
}

/**
 * Bounded action-uplift table (each action contributes toward an asymptotic
 * floor). Magnitudes preserve the old ACTION_UPLIFT values where an old family
 * maps 1:1 — new kinds pick values from the same table:
 *   refresh  (0.18/0.22/0.30) → funnel_climb        (absorbs ctr_rewrite)
 *   new_page (0.05/0.40/0.20) → funnel_new          (absorbs depth)
 *   schema   (0.08/0.16/0.12) → authority_anchor    (absorbs geo_fix, interlink)
 *   backlink (0.14/0.16/0.16) → kill_or_merge       (301 merge transfers equity
 *                                                    like a backlink)
 *   depth    (0.10/0.12/0.14) → funnel_revenue      (pricing/CTA = click-weighted)
 */
const FUNNEL_UPLIFT: Record<FunnelActionKind, { pos: number; imp: number; click: number }> = {
  funnel_new: { pos: 0.05, imp: 0.4, click: 0.2 },
  funnel_revenue: { pos: 0.1, imp: 0.12, click: 0.14 },
  funnel_climb: { pos: 0.18, imp: 0.22, click: 0.3 },
  authority_anchor: { pos: 0.08, imp: 0.16, click: 0.12 },
  kill_or_merge: { pos: 0.14, imp: 0.16, click: 0.16 },
}

export function buildForecast(input: {
  position?: number
  impressions?: number
  clicks?: number
  ctr?: number
  modelTotal?: number
  plannedActions?: PlannedAction[]
}): ForecastResult {
  const position = Number(input.position) || 100
  const impressions = Math.max(0, Number(input.impressions) || 0)
  const clicks = Math.max(0, Number(input.clicks) || 0)
  const ctr = Number(input.ctr) || (impressions ? clicks / impressions : 0)
  const total = clamp100(Number(input.modelTotal) || 50)
  const actions = (input.plannedActions || []).slice(0, 6)
  const posLift = actions.reduce((s, a) => s + (FUNNEL_UPLIFT[a.action]?.pos || 0) * (a.strength || 1), 0)
  const impLift = actions.reduce((s, a) => s + (FUNNEL_UPLIFT[a.action]?.imp || 0) * (a.strength || 1), 0)
  const clickLift = actions.reduce((s, a) => s + (FUNNEL_UPLIFT[a.action]?.click || 0) * (a.strength || 1), 0)
  const difficulty = clamp01((100 - total) / 100) // stronger model → faster gains
  const assumptions = [
    `Model total ${Math.round(total)}/100 (${difficulty > 0.5 ? 'high difficulty — gains slower' : 'moderate authority — gains realistic'})`,
    ...(actions.length ? [`Planned actions: ${actions.map((a) => `${FUNNEL_ACTION_LABELS[a.action] || a.action}×${a.strength || 1}`).join(', ')}`] : ['No planned actions — forecast reflects organic baseline']),
    'Forecast is a projection of our own model, not a Google guarantee.',
  ]

  const points: ForecastPoint[] = [30, 60, 90].map((horizon) => {
    // Actions compound over time; full effect lands at 90 days so each horizon
    // is distinct (30 ≈ ⅓, 60 ≈ ⅔, 90 = full).
    const factor = Math.min(1, horizon / 90)
    const realized = (posLift * factor * (1 - difficulty * 0.35))
    const projectedPosition = Math.max(1, Math.round(position * (1 - realized * 0.6)))
    const projectedImpressions = Math.round(impressions * (1 + impLift * factor + Math.max(0, position - projectedPosition) / 40))
    const pctr = expectedCtr(projectedPosition) * 0.85 + ctr * 0.15
    const projectedClicks = Math.round(projectedImpressions * pctr)
    const probabilityOfTop10 = clamp01(1 - Math.max(0, projectedPosition - 1) / 12)
    return { horizonDays: horizon as 30 | 60 | 90, projectedPosition, projectedImpressions, projectedClicks, probabilityOfTop10: Math.round(probabilityOfTop10 * 100) / 100, lift: Math.round(realized * 100) / 100 }
  })

  return {
    baseline: { position: Number(input.position) || null, impressions, clicks, ctr: Math.round(ctr * 10000) / 10000 },
    points,
    assumptions,
  }
}

// ── Expected-revenue math (Phase 2b — funnel bets priced in USD) ─────────────
/** Flat assumed service price when the price range is unknown (documented fallback). */
export const FUNNEL_FALLBACK_PRICE_USD = 400

/**
 * Local replica of crucible.intentCvr. crucible.ts imports THIS module
 * (classifyIntent), so importing back here would create a cycle. Exact values
 * mirror lib/seoEngine/crucible.ts: transactional 0.08 · commercial 0.045 ·
 * local 0.03 · navigational 0.004 · informational/else 0.008.
 */
function intentCvr(intent: string): number {
  const i = (intent || '').toLowerCase()
  if (i === 'transactional' || i === 'transaccional') return 0.08
  if (i === 'commercial') return 0.045
  if (i === 'local') return 0.03
  if (i === 'navigational') return 0.004
  return 0.008 // informational / unclassified — the most conservative bucket
}

function intentTag(intent: string): 'transactional' | 'commercial' | 'local' | 'navigational' | 'informational' {
  const i = (intent || '').toLowerCase()
  if (i === 'transactional' || i === 'transaccional') return 'transactional'
  if (i === 'commercial') return 'commercial'
  if (i === 'local') return 'local'
  if (i === 'navigational') return 'navigational'
  return 'informational'
}

/**
 * Expected USD/month from winning an organic position battle:
 *
 *   usdPerMonth = impressions × (expectedCtr(target) − expectedCtr(current))
 *                 × intentCvr(intent) × ((priceMin + priceMax) / 2)
 *
 * expectedCtr is the ranking-model CTR curve (#1 0.28 · #3 0.15 · #5 0.10 ·
 * #10 0.05 · #20 0.025 · else 0.01). When the service price range is unknown
 * (missing/≤0), FUNNEL_FALLBACK_PRICE_USD ($400) is used — a documented flat
 * consult price. Impressions are NEVER fabricated: they are caller-supplied
 * GSC observations, and callers must omit the call entirely when they have no
 * impression data (honesty rule — see buildCitationActions).
 */
export function expectedMonthlyRevenue(opts: {
  impressions: number
  currentPosition: number
  targetPosition: number
  intent: string
  action: FunnelActionKind
  priceMin: number
  priceMax: number
}): { usdPerMonth: number; note: string } {
  const impressions = Math.max(0, Number(opts.impressions) || 0)
  const current = Math.max(1, Number(opts.currentPosition) || 100)
  const target = Math.max(1, Number(opts.targetPosition) || 1)
  const intent = String(opts.intent || '')
  const deltaCtr = Math.max(0, expectedCtr(target) - expectedCtr(current))
  const priceMin = Number(opts.priceMin)
  const priceMax = Number(opts.priceMax)
  const hasPrice = Number.isFinite(priceMin) && Number.isFinite(priceMax) && priceMin > 0 && priceMax > 0
  const avgPrice = hasPrice ? (priceMin + priceMax) / 2 : FUNNEL_FALLBACK_PRICE_USD
  const usdPerMonth = Math.round(impressions * deltaCtr * intentCvr(intent) * avgPrice)
  const priceNote = hasPrice ? `$${Math.round(priceMin)}-${Math.round(priceMax)} service` : `flat $${FUNNEL_FALLBACK_PRICE_USD} price fallback`
  const note = `💷 ~$${usdPerMonth.toLocaleString('en-US')}/mo · ${impressions.toLocaleString('en-US')} impressions at #${Math.round(current)} → #${Math.round(target)} · ${intentTag(intent)} intent · ${priceNote}`
  return { usdPerMonth, note }
}

// ── Reward / credit-assignment loop ──────────────────────────────────────────
export interface RewardEventInput {
  pageUrl: string
  topic?: string
  action: string
  deltaImpressions?: number
  deltaClicks?: number
  /** Negative = position improved (rank 8 → 4 is deltaPosition −4). */
  deltaPosition?: number
  note?: string
  /**
   * Idempotency key — the reward pass must never double-credit the same
   * observed outcome. Persisted to `seo_reward_events.dedupe_key` (partial
   * unique index) so concurrent/weekly/daily runs collide harmlessly.
   */
  dedupeKey?: string
  /** Canonical page/query attribution fields (cron GSC pass). */
  query?: string
  /** Explicit observation window the delta was measured over (YYYY-MM-DD). */
  windowStart?: string
  windowEnd?: string
  /** Baseline clicks from the prior disjoint observation window (null = none). */
  baselineClicks?: number | null
  /** True only when a baseline existed and the measured change was positive. */
  improvementCredited?: boolean
  /** Stable identity of the action actually observed (e.g. cron_gsc_improvement). */
  observationLabel?: string
}
export interface RewardEvent extends RewardEventInput {
  id: string
  modelVersion: string
  reward: number
  attribution: Partial<Record<SignalFamily, number>>
  observedAt: string
}

/**
 * Which family an action most directly improves. Funnel taxonomy (Phase 2b)
 * routes explicitly first; the legacy regexes below stay as a fallback so
 * stored legacy action strings keep their historical families.
 */
export function actionFamily(action: string): SignalFamily {
  const a = String(action || '').toLowerCase()
  if (a.startsWith('funnel_new')) return 'topicalAuthority'
  if (a.startsWith('funnel_revenue')) return 'demand'
  if (a.startsWith('funnel_climb')) return 'behavioral'
  if (a.startsWith('authority_anchor')) return 'aeoGeo'
  if (a.startsWith('kill_or_merge')) return 'indexability'
  if (/backlink|link|outreach|guest/i.test(a)) return 'linkEquity'
  if (/interlink|internal/i.test(a)) return 'linkEquity'
  if (/schema|canonical|crawl|llms|index/i.test(a)) return 'indexability'
  if (/refresh|ctr|decay/i.test(a)) return 'behavioral'
  if (/depth|expand|content/i.test(a)) return 'aeoGeo'
  if (/geo|answer|faq|aeo/i.test(a)) return 'aeoGeo'
  if (/new|net[- ]?new|build/i.test(a)) return 'topicalAuthority'
  if (/author|eeat|credential|byline/i.test(a)) return 'eeat'
  return 'demand'
}

/** 0..1 reward from observed deltas. Position gain is weighted hardest. */
export function computeReward(delta: { deltaImpressions?: number; deltaClicks?: number; deltaPosition?: number }): number {
  const di = Number(delta.deltaImpressions) || 0
  const dc = Number(delta.deltaClicks) || 0
  const dp = Number(delta.deltaPosition) || 0
  const clickGain = dc > 0 ? clamp01(dc / 60) : 0
  const impGain = di > 0 ? clamp01(di / 800) : 0
  // Decay must COST reward: the old `0.3 * Math.max(0, posGain)` zeroed the
  // negative branch, so a page decaying 8→30 earned the same (zero) reward as
  // one holding steady — the model could never learn "this got worse". The
  // negative term now subtracts from the total before clamping.
  const posGain = dp < 0 ? clamp01(-dp / 12) : dp > 0 ? -0.3 * clamp01(dp / 12) : 0
  return Math.round(clamp01(0.5 * clickGain + 0.2 * impGain + 0.3 * posGain) * 100) / 100
}

/** Build an immutable, attributed reward event. */
export function creditOutcome(event: RewardEventInput, modelVersion = RANKING_MODEL_VERSION): RewardEvent {
  const reward = computeReward(event)
  const family = actionFamily(event.action)
  const attribution: Partial<Record<SignalFamily, number>> = { [family]: Math.round(reward * 0.8 * 100) / 100 }
  // Secondary credit: aeoGeo benefits from most content actions; indexability from structure.
  if (family === 'aeoGeo' && reward > 0) attribution.indexability = Math.round(reward * 0.15 * 100) / 100
  if (family === 'behavioral' && reward > 0) attribution.aeoGeo = Math.round(reward * 0.1 * 100) / 100
  if (family === 'linkEquity' && reward > 0) attribution.topicalAuthority = Math.round(reward * 0.1 * 100) / 100
  return {
    ...event,
    id: `reward-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    modelVersion,
    reward,
    attribution,
    observedAt: new Date().toISOString(),
  }
}

/**
 * Bounded recalibration: re-weights families by observed performance, recorded
 * for audit. Hard invariant: every family stays inside its [base ± MAX_FAMILY_DELTA]
 * band, enforced AFTER renormalization too (normalization alone can push a
 * family past the band when the pre-normalization sum drifts below 1).
 */
export function recalibrateWeights(
  current: Record<SignalFamily, number>,
  rewards: RewardEvent[],
  learningRate = CALIBRATION_LEARNING_RATE,
): Record<SignalFamily, number> {
  const next = { ...current }
  const seen = rewards.filter((r) => r.reward > 0)
  if (!seen.length) return next
  const perFamily: Partial<Record<SignalFamily, { reward: number; count: number }>> = {}
  for (const r of seen) {
    for (const [fam, amount] of Object.entries(r.attribution || {}) as Array<[SignalFamily, number]>) {
      const entry = perFamily[fam] || { reward: 0, count: 0 }
      entry.reward += amount
      entry.count += 1
      perFamily[fam] = entry
    }
  }
  // Compare in the SAME units: per-family means are attribution shares, so the
  // global baseline must be the mean TOTAL attribution per event (creditOutcome
  // shares ≈ reward) — not raw reward, which would systematically downshift
  // every family (attribution < reward for every primary share).
  const avg = seen.reduce((s, r) => {
    const total = Object.values(r.attribution || {}).reduce((a, b) => a + (Number(b) || 0), 0)
    return s + total
  }, 0) / seen.length
  const bandClamp = (weights: Record<SignalFamily, number>) => {
    for (const fam of SIGNAL_FAMILIES) {
      const base = FAMILY_WEIGHTS[fam]
      weights[fam] = Math.max(base - MAX_FAMILY_DELTA, Math.min(base + MAX_FAMILY_DELTA, weights[fam]))
    }
  }
  for (const fam of SIGNAL_FAMILIES) {
    const e = perFamily[fam]
    if (!e || !e.count) continue
    const perf = e.reward / e.count
    const shift = learningRate * (perf - avg)
    next[fam] = current[fam] + shift
  }
  bandClamp(next)
  // Renormalize to sum 1.0, then re-clamp so the band invariant survives.
  const sum = SIGNAL_FAMILIES.reduce((s, fam) => s + next[fam], 0)
  if (sum > 0) {
    for (const fam of SIGNAL_FAMILIES) next[fam] = Math.round((next[fam] / sum) * 1000) / 1000
  }
  bandClamp(next)
  return next
}

// ── Composite score ──────────────────────────────────────────────────────────
export function computeRankingScore(input: RankingModelInput): RankingScore {
  const topic = String(input.topic || '').trim()
  const intent = input.intentOverride ? { ...classifyIntent(topic), primary: input.intentOverride } : classifyIntent(topic)
  const g = input.gsc || {}

  const families: Record<SignalFamily, FamilyScore> = {
    demand: scoreDemand(input.gsc),
    intent: scoreIntent(topic, intent),
    topicalAuthority: scoreTopicalAuthority(topic, input),
    aeoGeo: scoreAeoGeo(topic, input),
    eeat: scoreEeat(input),
    linkEquity: scoreLinkEquity(input),
    behavioral: scoreBehavioral(input),
    indexability: scoreIndexability(input),
  }

  const confidence = input.evidence?.length
    ? confidenceFromEvidence(input.evidence)
    : clamp01((Number.isFinite(Number(g.impressions)) || Boolean(input.audit)) ? 0.5 : 0.25)

  const rawTotal = SIGNAL_FAMILIES.reduce((s, fam) => s + families[fam].score * families[fam].weight, 0)
  const total = clamp100(rawTotal * (0.7 + confidence * 0.3) * monetaryBias(intent, input.stage, input.revenue))

  // Recommended actions from weak families — funnel-phrased bets (Phase 2b).
  const recommendedActions: string[] = []
  if (intent.primary === 'transactional' || intent.primary === 'commercial') {
    recommendedActions.push('Funnel revenue · end every section with a marketplace CTA to the matching consult/visa/housing gig')
  }
  if ((Number(input.revenue) || 0) > 0) {
    recommendedActions.push(`Funnel revenue · protect the purchase path — this landing already made $${Math.round(Number(input.revenue))} in GA4`)
  }
  if (families.aeoGeo.score < 55) recommendedActions.push('Authority anchor · add answer capsule + FAQ block + stats panel (AEO/GEO)')
  if (families.indexability.score < 60) recommendedActions.push('Authority anchor · fix canonical/schema/crawlability; add llms.txt coverage')
  if (families.eeat.score < 55) recommendedActions.push('Authority anchor · add named author credentials, gov citations, YMYL disclaimer')
  if (families.linkEquity.score < 45) recommendedActions.push('Authority anchor · run interlink plan + backlink outreach lane')
  if (families.behavioral.score < 50 && (Number(g.position) || 100) <= 20) recommendedActions.push('Funnel climb · win the title/H1/intro CTR battle (decay fix)')
  if (families.demand.score >= 60 && (Number(g.position) || 100) > 20) recommendedActions.push('Funnel new · own this demand: build/expand the service-enabled canonical')
  if (input.audit?.wordCount && input.audit.wordCount < 1400) recommendedActions.push('Funnel new · depth pass — target 1,800–3,500 words with fan-out sub-sections')

  const forecast = buildForecast({
    position: Number(g.position) || undefined,
    impressions: Number(g.impressions) || undefined,
    clicks: Number(g.clicks) || undefined,
    ctr: Number(g.ctr) || undefined,
    modelTotal: total,
    plannedActions: recommendedActions.slice(0, 4).map((a) => ({
      action: (a.startsWith('Funnel revenue') ? 'funnel_revenue' : a.startsWith('Funnel climb') ? 'funnel_climb' : a.startsWith('Funnel new') ? 'funnel_new' : a.startsWith('Kill / merge') ? 'kill_or_merge' : 'authority_anchor') as FunnelActionKind,
      strength: 2 as const,
    })),
  })

  const reasons = [
    ...families.demand.reasons,
    ...families.intent.reasons.slice(0, 1),
    `Confidence ${Math.round(confidence * 100)}%`,
  ]

  return {
    modelVersion: RANKING_MODEL_VERSION,
    topic,
    scope: input.scope || 'topic',
    subjectKey: input.subjectKey || null,
    url: input.url || null,
    country: input.country || null,
    stage: input.stage || null,
    intent,
    families,
    total,
    confidence,
    forecast,
    recommendedActions,
    reasons,
    computedAt: new Date().toISOString(),
  }
}

// ── Lineage timelines ────────────────────────────────────────────────────────
export interface TimelineNode {
  id: string
  sourceJobId: string | null
  status: string
  createdAt: string | null
  title?: string | null
  topic?: string | null
  regenerationMode?: string | null
  regenerationReason?: string | null
}
export interface TimelineEvent {
  id: string
  ts: number
  status: string
  actor: string
  message: string
  evidence?: Record<string, unknown>
}
export interface TimelineEntry {
  kind: 'node' | 'event'
  ts: number
  id: string
  label: string
  status: string
  mode?: string | null
  reason?: string | null
  actor?: string
  evidence?: Record<string, unknown>
}

/**
 * Assemble a job → regeneration chain into a time-ordered, annotated timeline.
 * Walks `sourceJobId` links back to the original job, then merges queue events.
 */
export function assembleLineageTimeline(nodes: TimelineNode[], events: TimelineEvent[]): TimelineEntry[] {
  const byId = new Map<string, TimelineNode>()
  for (const n of nodes) byId.set(n.id, n)
  const chain: TimelineNode[] = []
  const rootId = nodes[0]?.id
  let cursor: string | undefined = rootId
  const guard = new Set<string>()
  while (cursor && byId.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor)
    const node = byId.get(cursor)!
    chain.unshift(node)
    cursor = node.sourceJobId || undefined
  }
  const entries: TimelineEntry[] = chain.map((n) => ({
    kind: 'node',
    ts: n.createdAt ? new Date(n.createdAt).getTime() : 0,
    id: n.id,
    label: n.topic || n.title || n.id.slice(0, 8),
    status: n.status,
    mode: n.regenerationMode,
    reason: n.regenerationReason,
  }))
  for (const e of events) {
    entries.push({ kind: 'event', ts: e.ts, id: e.id, label: e.message, status: e.status, actor: e.actor, evidence: e.evidence })
  }
  return entries.sort((a, b) => a.ts - b.ts)
}

// ── Opportunity enrichment helpers (radar rows + autopilot ordering) ─────────
/** A radar/war-room style opportunity row — everything rankingForOpportunity needs. */
export interface OpportunityRankingSource {
  term?: string | null
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
  history?: Array<{ position?: number; impressions?: number; clicks?: number; date?: string }>
  region?: string
  stage?: string
  lifecycleStage?: string
  revenue?: number
  purchases?: number
}

/** Compute the full ranking score for an opportunity/radar row (deterministic). */
export function rankingForOpportunity(o: OpportunityRankingSource): RankingScore {
  return computeRankingScore({
    topic: String(o.term || ''),
    scope: 'topic',
    country: o.region || null,
    stage: o.stage || o.lifecycleStage || null,
    revenue: Number(o.revenue) || 0,
    purchases: Number(o.purchases) || 0,
    gsc: {
      impressions: Number(o.impressions) || 0,
      clicks: Number(o.clicks) || 0,
      ctr: Number(o.ctr) || 0,
      position: Number(o.position) || 100,
      history: o.history,
    },
  })
}

/** Lightweight model total for ordering — avoids carrying the full score object. */
export function modelTotalForOpportunity(o: OpportunityRankingSource): number {
  if (!o?.term) return 0
  return rankingForOpportunity(o).total
}

/**
 * Lean ranking view for radar rows / suggestion APIs — keeps hot endpoints
 * small. The UI only consumes total, confidence, recommendedActions, forecast.
 */
export interface LeanRanking {
  total: number
  confidence: number
  recommendedActions: string[]
  forecast: ForecastResult
}

export function leanRanking(score: RankingScore): LeanRanking {
  return {
    total: score.total,
    confidence: score.confidence,
    recommendedActions: score.recommendedActions,
    forecast: score.forecast,
  }
}

/**
 * Attach a lean `ranking` view to every row of a war-room style queue; returns
 * the avg model total. T only needs the OpportunityRankingSource fields — typed
 * interfaces without an index signature are fine.
 */
export function enrichQueueWithRanking<T extends OpportunityRankingSource>(
  queue: T[],
): { queue: Array<T & { ranking: LeanRanking }>; modelAvg: number } {
  const enriched = queue.map((o) => ({ ...o, ranking: leanRanking(rankingForOpportunity(o)) }))
  const modelAvg = enriched.length
    ? Math.round(enriched.reduce((s, o) => s + o.ranking.total, 0) / enriched.length)
    : 0
  return { queue: enriched, modelAvg }
}

/** Sort rows by ranking-model total desc (fallback score when ranking is absent). */
export function sortByModelTotal<T extends { ranking?: { total?: number } }>(
  rows: T[],
  fallback: (o: T) => number = () => 0,
): T[] {
  return [...rows].sort((a, b) => (b.ranking?.total ?? fallback(b)) - (a.ranking?.total ?? fallback(a)))
}

/** One auto-run plan term with optional GSC signals, for model-driven ordering. */
export interface PlanTermRow {
  term: string
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
  region?: string
  revenue?: number
  purchases?: number
}

/**
 * Reorder auto-run plan terms by ranking-model total (fallback: preserve input
 * order — Array#sort is stable, so equal totals keep their relative order).
 *
 * The auto-run route uses this so the candidate PICK ORDER matches the ranking
 * model; the lane-mix SET stays plan-driven (model priority takes precedence
 * over the lane mix, but never adds/removes terms).
 */
export function orderTermsByModel(terms: string[], plan: PlanTermRow[] = []): string[] {
  const row = (t: string) => plan.find((p) => p.term === t)
  const total = (t: string) => {
    const r = row(t)
    return modelTotalForOpportunity(
      r
        ? { term: r.term, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position, region: r.region, revenue: r.revenue, purchases: r.purchases }
        : { term: t },
    )
  }
  return [...terms].sort((a, b) => total(b) - total(a))
}

// ── Persistence (best-effort, lazy Supabase — mirrors knowledge.ts) ──────────
type Db = Awaited<ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>>
async function db(): Promise<Db | null> {
  try {
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    return createSupabaseAdminClient()
  } catch {
    return null
  }
}

export async function persistRankingScore(score: RankingScore): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await db()
    if (!client) return { ok: false, error: 'no db' }
    const key = score.subjectKey || `${score.scope}:${score.topic}`
    // computed_at is set explicitly so re-scoring an existing subject refreshes
    // its ordering (upsert otherwise leaves the original default untouched).
    const { error } = await client.from('seo_ranking_scores').upsert({
      model_version: score.modelVersion,
      scope: score.scope,
      subject_key: key,
      normalized_topic: score.topic.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim(),
      topic: score.topic,
      url: score.url,
      country: score.country,
      stage: score.stage,
      intent_primary: score.intent.primary,
      intent_subtype: score.intent.subType,
      families: score.families as unknown as Record<string, unknown>,
      total: score.total,
      confidence: score.confidence,
      forecast: score.forecast as unknown as Record<string, unknown>,
      recommended_actions: score.recommendedActions,
      reasons: score.reasons,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'subject_key' })
    if (error) {
      console.warn('[seoEngine] persistRankingScore', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'persistRankingScore failed'
    console.warn('[seoEngine] persistRankingScore', error)
    return { ok: false, error }
  }
}

export async function loadRankingScores(opts: { limit?: number; scope?: string; country?: string; stage?: string } = {}): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    let q = client.from('seo_ranking_scores').select('*').order('computed_at', { ascending: false }).limit(Math.min(100, opts.limit ?? 25))
    if (opts.scope) q = q.eq('scope', opts.scope)
    if (opts.country) q = q.eq('country', opts.country)
    if (opts.stage) q = q.eq('stage', opts.stage)
    const { data } = await q
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

export async function persistForecast(
  topic: string,
  forecast: ForecastResult,
  subjectKey?: string | null,
  opts?: { runDate?: string },
): Promise<{ ok: boolean; error?: string; wrote: number }> {
  try {
    const client = await db()
    if (!client) return { ok: false, error: 'no db', wrote: 0 }
    const runDate = (opts?.runDate || new Date().toISOString().slice(0, 10)).slice(0, 10)
    let wrote = 0
    for (const p of forecast.points) {
      // One row per (topic, subject, horizon, day) — the daily cron does not pile up duplicates.
      const { error } = await client.from('seo_forecast_runs').upsert({
        model_version: RANKING_MODEL_VERSION,
        topic: topic.slice(0, 400),
        subject_key: subjectKey || '',
        horizon_days: p.horizonDays,
        projected_position: p.projectedPosition,
        projected_impressions: p.projectedImpressions,
        projected_clicks: p.projectedClicks,
        probability_top10: p.probabilityOfTop10,
        assumptions: forecast.assumptions,
        run_date: runDate,
      }, { onConflict: 'topic,subject_key,horizon_days,run_date' })
      if (error) {
        console.warn('[seoEngine] persistForecast', error.message)
        return { ok: false, error: error.message, wrote }
      }
      wrote += 1
    }
    return { ok: true, wrote }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'persistForecast failed'
    console.warn('[seoEngine] persistForecast', error)
    return { ok: false, error, wrote: 0 }
  }
}

export async function loadForecasts(limit = 30): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    const { data } = await client.from('seo_forecast_runs').select('*').order('created_at', { ascending: false }).limit(limit)
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

function rewardEventRow(event: RewardEvent): Record<string, unknown> {
  return {
    model_version: event.modelVersion,
    page_url: event.pageUrl,
    topic: event.topic || null,
    action: event.action,
    delta_impressions: event.deltaImpressions || 0,
    delta_clicks: event.deltaClicks || 0,
    delta_position: event.deltaPosition || 0,
    reward: event.reward,
    attribution: event.attribution as unknown as Record<string, unknown>,
    note: event.note || null,
    ...(event.query ? { query: event.query } : {}),
    ...(event.windowStart ? { window_start: event.windowStart } : {}),
    ...(event.windowEnd ? { window_end: event.windowEnd } : {}),
    ...(event.baselineClicks != null ? { baseline_clicks: event.baselineClicks } : { baseline_clicks: null }),
    improvement_credited: event.improvementCredited === true,
    observation_label: event.observationLabel || null,
    ...(event.dedupeKey ? { dedupe_key: event.dedupeKey } : {}),
  }
}

export async function persistRewardEvent(event: RewardEvent): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await db()
    if (!client) return { ok: false, error: 'no db' }
    const row = rewardEventRow(event)
    if (event.dedupeKey) {
      // Idempotent: same key can never double-credit (unique index, migrate
      // applies it). On a pre-migration DB the column is missing — fall back
      // to a plain insert so the ledger keeps working.
      const { error } = await client
        .from('seo_reward_events')
        .upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      if (error && !/dedupe_key/.test(error.message) && !/42P01/.test(error.message)) {
        console.warn('[seoEngine] persistRewardEvent', error.message)
        return { ok: false, error: error.message }
      }
      return { ok: true }
    }
    const { error } = await client.from('seo_reward_events').insert(row)
    if (error) {
      console.warn('[seoEngine] persistRewardEvent', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'persistRewardEvent failed'
    console.warn('[seoEngine] persistRewardEvent', error)
    return { ok: false, error }
  }
}

export async function loadRewardLedger(limit = 40): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    const { data } = await client.from('seo_reward_events').select('*').order('observed_at', { ascending: false }).limit(limit)
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

export async function recordCalibration(weights: Record<SignalFamily, number>, eventsCount: number, note: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await db()
    if (!client) return { ok: false, error: 'no db' }
    const { error } = await client.from('seo_model_calibration').insert({
      model_version: RANKING_MODEL_VERSION,
      weights,
      events_count: eventsCount,
      note: note.slice(0, 500),
    })
    if (error) {
      console.warn('[seoEngine] recordCalibration', error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'recordCalibration failed'
    console.warn('[seoEngine] recordCalibration', error)
    return { ok: false, error }
  }
}

export async function loadCalibrationHistory(limit = 10): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    const { data } = await client.from('seo_model_calibration').select('*').order('recalibrated_at', { ascending: false }).limit(limit)
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}

export const OBSERVED_REWARD_CALIBRATION_PREFIX = 'observed-reward calibration'

async function loadCalibrationHistoryForTraining(limit = 50): Promise<Array<Record<string, unknown>>> {
  const client = await db()
  if (!client) throw new Error('calibration database unavailable')
  const { data, error } = await client
    .from('seo_model_calibration')
    .select('*')
    .like('note', OBSERVED_REWARD_CALIBRATION_PREFIX + '%')
    .order('recalibrated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('calibration read failed: ' + error.message)
  return ((data as Array<Record<string, unknown>>) || []).filter(isObservedCalibrationRow)
}

/**
 * Strict training boundary for persisted reward rows.
 *
 * Only a verified, intervention-bound GSC improvement may train weights:
 * real HTTP(S) canonical page + exact query + explicit completed window +
 * measured baseline + positive measured click delta + known recorded action.
 * Legacy forecast-prefixed rows, manual notes, plain observations and partial
 * evidence remain auditable in the ledger but are never model-training inputs.
 */
export function isTrainingEligibleRewardRow(row: Record<string, unknown>): boolean {
  const pageUrl = String(row.page_url || '').trim()
  const query = String(row.query || '').trim()
  const windowStart = String(row.window_start || '').trim()
  const windowEnd = String(row.window_end || '').trim()
  const action = String(row.action || '').trim()
  const label = String(row.observation_label || '').trim()
  const reward = Number(row.reward) || 0
  const deltaClicks = Number(row.delta_clicks) || 0
  const dedupeKey = String(row.dedupe_key || '').trim()
  const attribution =
    row.attribution && typeof row.attribution === 'object'
      ? (row.attribution as Record<string, unknown>)
      : {}
  const hasAttributedCredit = Object.values(attribution).some((value) => Number(value) > 0)
  const hasBaseline = row.baseline_clicks !== null && row.baseline_clicks !== undefined
  const date = /^\d{4}-\d{2}-\d{2}$/

  return (
    /^https?:\/\//i.test(pageUrl) &&
    Boolean(query) &&
    date.test(windowStart) &&
    date.test(windowEnd) &&
    windowStart <= windowEnd &&
    hasBaseline &&
    action !== '' &&
    action !== 'unknown' &&
    label === 'cron_gsc_improvement' &&
    row.improvement_credited === true &&
    dedupeKey.startsWith('cron-attr:') &&
    hasAttributedCredit &&
    deltaClicks > 0 &&
    reward > 0
  )
}

/** Only calibrations produced from the strict observed-reward boundary are active. */
function observedRewardWatermarkFromNote(note: string): string | null {
  const match = note.match(/(?:^|[·\s])through\s+([^\s·]+)(?:\s|$)/i)
  if (!match?.[1]) return null
  const timestamp = new Date(match[1])
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null
}

export function isObservedCalibrationRow(row: Record<string, unknown>): boolean {
  const note = String(row.note || '').trim()
  return note.startsWith(OBSERVED_REWARD_CALIBRATION_PREFIX) &&
    Boolean(row.weights && typeof row.weights === 'object') &&
    Boolean(observedRewardWatermarkFromNote(note))
}

export async function loadObservedCalibrationHistory(limit = 10): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    const { data, error } = await client
      .from('seo_model_calibration')
      .select('*')
      .like('note', OBSERVED_REWARD_CALIBRATION_PREFIX + '%')
      .order('recalibrated_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return ((data as Array<Record<string, unknown>>) || []).filter(isObservedCalibrationRow)
  } catch {
    return []
  }
}

/** Rehydrate only persisted rows that pass the strict training boundary. */
export function trainingRewardEventFromRow(row: Record<string, unknown>): RewardEvent | null {
  if (!isTrainingEligibleRewardRow(row)) return null
  const attribution =
    row.attribution && typeof row.attribution === 'object'
      ? (row.attribution as Partial<Record<SignalFamily, number>>)
      : {}
  return {
    id: String(row.id || ''),
    modelVersion: String(row.model_version || RANKING_MODEL_VERSION),
    pageUrl: String(row.page_url),
    topic: row.topic ? String(row.topic) : undefined,
    action: String(row.action),
    query: String(row.query),
    windowStart: String(row.window_start),
    windowEnd: String(row.window_end),
    baselineClicks: Number(row.baseline_clicks),
    improvementCredited: true,
    observationLabel: 'cron_gsc_improvement',
    deltaImpressions: Number(row.delta_impressions) || 0,
    deltaClicks: Number(row.delta_clicks) || 0,
    deltaPosition: Number(row.delta_position) || 0,
    reward: Number(row.reward) || 0,
    attribution,
    note: row.note ? String(row.note) : undefined,
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : undefined,
    observedAt: String(row.observed_at || ''),
  }
}

export const MIN_OBSERVED_IMPROVEMENTS_FOR_CALIBRATION = 5
const MAX_OBSERVED_REWARD_PAGES = 50
const MAX_OBSERVED_REWARD_PAGE_SIZE = 1000

/** Read only persisted improvement candidates; JS applies the full strict boundary. */
export async function loadTrainingEligibleRewardRows(
  limit = 200,
): Promise<Array<Record<string, unknown>>> {
  try {
    const client = await db()
    if (!client) return []
    const { data, error } = await client
      .from('seo_reward_events')
      .select('*')
      .eq('improvement_credited', true)
      .eq('observation_label', 'cron_gsc_improvement')
      .gt('reward', 0)
      .order('observed_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return ((data as Array<Record<string, unknown>>) || []).filter(isTrainingEligibleRewardRow)
  } catch {
    return []
  }
}

function observedRewardWatermark(row: Record<string, unknown>): string | null {
  if (!isObservedCalibrationRow(row)) return null
  return observedRewardWatermarkFromNote(String(row.note || ''))
}

async function loadTrainingEligibleRewardRowsForCalibration(
  watermark: string,
  pageSize = 200,
): Promise<Array<Record<string, unknown>>> {
  const client = await db()
  if (!client) throw new Error('reward evidence database unavailable')

  const size = Math.max(1, Math.min(MAX_OBSERVED_REWARD_PAGE_SIZE, Math.floor(pageSize) || 200))
  const rows: Array<Record<string, unknown>> = []

  const baseQuery = () => {
    let query = client
      .from('seo_reward_events')
      .select('*')
      .eq('improvement_credited', true)
      .eq('observation_label', 'cron_gsc_improvement')
      .gt('reward', 0)
    if (watermark) query = query.gt('observed_at', watermark)
    return query
  }

  for (let page = 0; page < MAX_OBSERVED_REWARD_PAGES; page += 1) {
    const from = page * size
    const { data, error } = await baseQuery()
      .order('observed_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + size - 1)
    if (error) throw new Error('reward read failed: ' + error.message)

    const batch = (data as Array<Record<string, unknown>>) || []
    rows.push(...batch.filter(isTrainingEligibleRewardRow))
    if (batch.length < size) return rows
  }

  const probeOffset = MAX_OBSERVED_REWARD_PAGES * size
  const { data: overflow, error: overflowError } = await baseQuery()
    .order('observed_at', { ascending: true })
    .order('id', { ascending: true })
    .range(probeOffset, probeOffset)
  if (overflowError) throw new Error('reward read failed: ' + overflowError.message)
  if (Array.isArray(overflow) && overflow.length > 0) {
    throw new Error('reward evidence exceeds safe calibration page ceiling of ' + probeOffset + ' rows')
  }

  return rows
}

export interface ObservedRewardCalibrationResult {
  eligible: number
  recalibrated: boolean
  weightsChanged: boolean
  weights: Record<SignalFamily, number>
  watermark: string | null
  error?: string
}

/**
 * Recalibrate only from NEW persisted rows that pass the strict observed
 * improvement boundary. Historical forecast/manual calibration rows are never
 * used as the active baseline; until an observed-reward calibration exists we
 * start from the code-defined FAMILY_WEIGHTS.
 */
export async function recalibrateFromObservedRewards(
  limit = 200,
): Promise<ObservedRewardCalibrationResult> {
  try {
    const history = await loadCalibrationHistoryForTraining(50)
    const prior = history.find(isObservedCalibrationRow)
    const watermark = prior ? observedRewardWatermark(prior) : null
    if (prior && !watermark) {
      throw new Error('observed calibration is missing a valid processed-observation watermark')
    }

    const eligibleLedger = await loadTrainingEligibleRewardRowsForCalibration(watermark || '', limit)
    const events = eligibleLedger
      .map(trainingRewardEventFromRow)
      .filter((event): event is RewardEvent => Boolean(event))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    const priorWeights =
      prior?.weights && typeof prior.weights === 'object'
        ? (prior.weights as Partial<Record<SignalFamily, number>>)
        : {}
    const current: Record<SignalFamily, number> = { ...FAMILY_WEIGHTS, ...priorWeights }

    if (events.length < MIN_OBSERVED_IMPROVEMENTS_FOR_CALIBRATION) {
      return {
        eligible: events.length,
        recalibrated: false,
        weightsChanged: false,
        weights: current,
        watermark,
      }
    }

    const next = recalibrateWeights(current, events, CALIBRATION_LEARNING_RATE)
    const weightsChanged = SIGNAL_FAMILIES.some(
      (family) => Math.abs(Number(next[family]) - Number(current[family])) > 1e-9,
    )
    const through = events[events.length - 1]?.observedAt || ''
    if (!through) throw new Error('observed reward calibration has no terminal observation timestamp')

    const wrote = await recordCalibration(
      weightsChanged ? next : current,
      events.length,
      OBSERVED_REWARD_CALIBRATION_PREFIX +
        ' · ' + events.length +
        ' verified improvements · ' + (weightsChanged ? 'weights updated' : 'weights unchanged') +
        ' · through ' + through,
    )
    if (!wrote.ok) {
      return {
        eligible: events.length,
        recalibrated: false,
        weightsChanged,
        weights: current,
        watermark,
        error: wrote.error || 'observed reward calibration persistence failed',
      }
    }
    return {
      eligible: events.length,
      recalibrated: true,
      weightsChanged,
      weights: weightsChanged ? next : current,
      watermark: through,
    }
  } catch (error) {
    return {
      eligible: 0,
      recalibrated: false,
      weightsChanged: false,
      weights: { ...FAMILY_WEIGHTS },
      watermark: null,
      error: error instanceof Error ? error.message : 'observed reward calibration failed',
    }
  }
}

/** Cron pass: compute + persist ranking scores for the top planner missions. */
export async function runRankingPassForPlans(limit = 15): Promise<{ computed: number; topScores: Array<{ topic: string; total: number }> }> {
  try {
    const { loadPlansDashboard, pullGscSignals } = await import('./planner')
    const { loadKnowledgeFeed } = await import('./knowledge')
    const { plans } = await loadPlansDashboard(limit)
    let signals = await pullGscSignals()
    try {
      const { pullGa4Signals, attachGa4Revenue } = await import('./ga4')
      const ga4 = await pullGa4Signals()
      if (ga4.length) signals = attachGa4Revenue(signals, ga4)
    } catch {
      /* GA4 optional */
    }
    // Real intel bias per plan: count fresh knowledge items matching the cell.
    const feed = await loadKnowledgeFeed(40)
    const cellBias = (stage: string, country: string): number => {
      const matches = feed.items.filter((k) => {
        const countries = Array.isArray(k.countries) ? (k.countries as string[]) : []
        const stages = Array.isArray(k.stages) ? (k.stages as string[]) : []
        return countries.some((c) => c.toLowerCase() === country.toLowerCase()) || stages.some((s) => s.toLowerCase() === stage.toLowerCase())
      }).length
      return Math.min(0.5, 0.1 + matches * 0.08)
    }
    const byTerm = new Map(signals.map((s) => [s.term.toLowerCase(), s]))
    const topScores: Array<{ topic: string; total: number }> = []
    // Measured fan-out citation evidence per cluster — the aeoGeo family bonus.
    let llmByCluster: Record<string, { cited: number; total: number }> = {}
    try {
      const { loadVisibilityByCluster } = await import('./llmVisibility')
      llmByCluster = await loadVisibilityByCluster()
    } catch {
      llmByCluster = {}
    }
    // Marketplace prices (live gig tiers or stage defaults) — cached module.
    let priceCache = new Map<string, { priceMin: number; priceMax: number }>()
    try {
      const { marketplaceValue } = await import('./marketplaceValue')
      const { plans: allPlans } = await loadPlansDashboard(200)
      const cells = new Set(allPlans.map((p) => `${String(p.country || 'US')}:${String(p.stage || '')}`))
      await Promise.all(
        Array.from(cells).map(async (cell) => {
          const [country, stage] = cell.split(':')
          try {
            const v = await marketplaceValue(stage, country)
            priceCache.set(cell, { priceMin: v.priceMin, priceMax: v.priceMax })
          } catch {
            /* best-effort — fall back to the $400 default */
          }
        }),
      )
    } catch {
      priceCache = new Map()
    }
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const supabase = createSupabaseAdminClient()
    for (const p of plans) {
      const term = String(p.primary_term || '')
      if (!term) continue
      const sig = byTerm.get(term.toLowerCase())
      const country = String(p.country || '')
      const stage = String(p.stage || '')
      const llm = llmByCluster[String(p.cluster_id || '')]
      const score = computeRankingScore({
        topic: term,
        scope: 'plan',
        subjectKey: String(p.cluster_id || ''),
        country: country || null,
        stage: stage || null,
        gsc: sig ? { impressions: sig.impressions, clicks: sig.clicks, ctr: sig.ctr, position: sig.position } : undefined,
        revenue: sig ? Number(sig.revenue) || 0 : 0,
        purchases: sig ? Number(sig.purchases) || 0 : 0,
        knowledgeBias: cellBias(stage, country),
        // Explicit 0/0 when the cluster has no measured evidence: undefined is
        // intentionally silent (radar rows that never carry visibility), but
        // every cluster plan DOES carry the field — so unmeasured clusters get
        // the actionable 'run the fan-out audit batch' nudge, not silence.
        llmVisibility: llm && llm.total > 0 ? llm : { cited: 0, total: 0 },
      })
      await persistRankingScore(score)
      await persistForecast(term, score.forecast, String(p.cluster_id || ''))
      // Close the planner-card gap: persist TitleLab candidates + the funnel
      // action + honest $/mo onto the plan row so the Discover/Planner cards
      // and ⚡ Brief handoff read real economics, not aspirational fields.
      try {
        const { buildPlanEconomics } = await import('./planEconomics')
        const price = priceCache.get(`${country}:${stage}`)
        const economics = buildPlanEconomics({
          primaryTerm: term,
          stage: stage || null,
          country: country || null,
          relatedTerms: Array.isArray(p.related_terms) ? (p.related_terms as string[]) : undefined,
          impressions: Number(p.est_monthly_impressions) || 0,
          position: Number(p.position) || 20,
          intent: String(p.intent || 'informational'),
          priceMin: price?.priceMin ?? null,
          priceMax: price?.priceMax ?? null,
          recommendedActions: score.recommendedActions,
        })
        await supabase
          .from('seo_cluster_plans')
          .update({
            title_candidates: economics.titleCandidates,
            action_type: economics.actionType,
            expected_revenue: economics.expectedRevenue,
          })
          .eq('cluster_id', String(p.cluster_id || ''))
      } catch {
        // plan economics are additive — a DB blip must not fail the pass
      }
      topScores.push({ topic: term, total: score.total })
    }
    topScores.sort((a, b) => b.total - a.total)
    return { computed: topScores.length, topScores: topScores.slice(0, 5) }
  } catch {
    return { computed: 0, topScores: [] }
  }
}

/**
 * Cron pass: attribute observed GSC gains of shipped jobs into reward events.
 *
 * Honesty model (2026-09-07): the previous pass matched jobs via a 24-char
 * query substring, credited the WHOLE GSC window as `deltaClicks`, and de-duped
 * by UTC run day — so overlapping observations were re-credited on later runs
 * and query clicks were never evidence of that page's incremental performance.
 *
 * Now every reward is tied to a CANONICAL PAGE + EXACT QUERY + an explicit,
 * COMPLETED, fixed-duration post-publication observation window, with the fixed
 * prior completed window as baseline.
 *
 *  - WINDOWS are COMPLETED 14-day buckets only — but "completed" is judged
 *    against an AVAILABILITY CUTOFF strictly before today (GSC reports lag by
 *    ~2 days). A bucket whose inclusive end falls on or after the cutoff is
 *    treated as still-partial/unreliable and is NOT credited; because we never
 *    persist it, it is re-examined on later runs once its data is available
 *    (nothing partial is ever permanently deduped). A window that ends TODAY
 *    is never eligible today.
 *  - PUBLICATION must be VERIFIED: only a real merged timestamp is accepted.
 *    created_at/closed_at are NOT publication; unknown provenance means the
 *    job is skipped (fail closed, no improvement).
 *  - Improvement is ONLY credited when the prior completed window's clicks
 *    exist as a baseline AND the current completed window measured more.
 *  - The job's ACTION uses the RECORDED `regeneration_mode` when present. An
 *    absent action is kept as 'unknown' — never guessed from row-order — and
 *    an unknown-action observation is never credited as an improvement (no
 *    training on an invented create/refresh attribution).
 *  - A persistence failure is NOT reported as a credited success.
 *  - pre-publication clicks are never part of any window here.
 */

export const CRON_ATTRIBUTION_BUCKET_DAYS = 14
export const CRON_ATTRIBUTION_AVAILABILITY_CUTOFF_DAYS = 2
export const CRON_ATTRIBUTION_ACTION = 'cron_gsc_observation'
export const CRON_ATTRIBUTION_IMPROVEMENT_ACTION = 'cron_gsc_improvement'

export interface CronMission {
  jobId: string
  /** Canonical page URL — the page-specific attribution anchor. Never a query. */
  pageUrl: string | null
  topic: string
  /** VERIFIED post-publication time (real merge). Null/unknown → attribution skipped. */
  publishDate: string | null
  /** ACTUAL recorded action (content_jobs.regeneration_mode). null = unknown,
   *  never guessed from row order; unknown-action observations get no
   *  improvement credit. */
  action: string | null
}

export interface CronAttributionWindow {
  start: string
  end: string
}

export interface GscPageQueryRow {
  page: string
  query: string
  clicks: number
  impressions: number
  position: number
}

/**
 * The last date GSC data is considered fully available — strictly BEFORE
 * `today` (default 2 days). Buckets whose inclusive end is <= this cutoff are
 * "completed+available"; anything ending on/after it stays uncredited.
 */
export function attributionAvailabilityCutoff(today: string, cutoffDays = CRON_ATTRIBUTION_AVAILABILITY_CUTOFF_DAYS): string {
  const end = new Date(`${String(today).slice(0, 10)}T00:00:00Z`).getTime()
  if (!Number.isFinite(end)) return ''
  return new Date(end - Math.max(1, cutoffDays) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Compose the COMPLETED + AVAILABLE fixed-duration post-publication windows for
 * a verified publish date. bucket i spans [publish + i*14d, publish + (i+1)*14d - 1].
 * Eligible ONLY when the inclusive end is strictly on/before the availability
 * cutoff (i.e. a bucket ending TODAY or YESTERDAY is still partial to GSC and
 * is never credited → never permanently deduped, re-examined once available).
 * `baselineWindow` is the immediately prior eligible bucket (measurable click
 * level), never a pre-publication window. Deterministic + pure for tests.
 */
export function attributionWindowsFor(
  publishDate: string,
  today: string,
  bucketDays = CRON_ATTRIBUTION_BUCKET_DAYS,
  cutoffDays = CRON_ATTRIBUTION_AVAILABILITY_CUTOFF_DAYS,
): { window: CronAttributionWindow; baselineWindow: CronAttributionWindow | null; completedBucket: number; daysSincePublish: number } | null {
  const MS_DAY = 86_400_000
  const pub = new Date(`${String(publishDate).slice(0, 10)}T00:00:00Z`).getTime()
  const end = new Date(`${String(today).slice(0, 10)}T00:00:00Z`).getTime()
  if (!Number.isFinite(pub) || !Number.isFinite(end) || pub > end) return null
  const cutoff = new Date(`${attributionAvailabilityCutoff(String(today).slice(0, 10), cutoffDays)}T00:00:00Z`).getTime()
  if (!Number.isFinite(cutoff) || cutoff >= end) return null
  const span = bucketDays - 1
  const daysSincePublish = Math.floor((end - pub) / MS_DAY)
  const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
  // Furthest bucket whose INCLUSIVE end has fully settled into available GSC
  // data (end <= cutoff). Buckets ending today/yesterday stay partial.
  const completedBucket = Math.floor((cutoff - pub - span * MS_DAY) / (bucketDays * MS_DAY))
  if (completedBucket < 0) return null
  const startMs = pub + completedBucket * bucketDays * MS_DAY
  const window: CronAttributionWindow = { start: ymd(startMs), end: ymd(startMs + span * MS_DAY) }
  let baselineWindow: CronAttributionWindow | null = null
  if (completedBucket > 0) {
    const prevStart = pub + (completedBucket - 1) * bucketDays * MS_DAY
    baselineWindow = { start: ymd(prevStart), end: ymd(prevStart + span * MS_DAY) }
  }
  return { window, baselineWindow, completedBucket, daysSincePublish }
}

export interface PreparedCronReward {
  pageUrl: string
  topic: string
  query: string | null
  action: string
  observationLabel: string
  deltaClicks: number
  baselineClicks: number | null
  improvementCredited: boolean
  windowStart: string
  windowEnd: string
  note: string
  dedupeKey: string
}

function normalizeRewardQuery(q: string): string {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
}

/**
 * Build the reward events for one (mission, COMPLETED window) observation set.
 * pageUrl / verified publish / window are required; a null pageUrl → [] (fail
 * closed — never attribute by query alone). Without a baseline the observation
 * is kept but improvement is not credited. Pure + exported for focused tests.
 */
export function prepareCronRewards(opts: {
  mission: CronMission
  currentWindow: CronAttributionWindow
  currentRows: GscPageQueryRow[]
  baselineRows: GscPageQueryRow[] | null
  bucket: number
}): PreparedCronReward[] {
  if (!opts.mission.pageUrl) return []
  const page = opts.mission.pageUrl.replace(/\/+$/, '')
  const dedupeBase = `cron-attr:${page}:`
  const baselineByQuery = new Map<string, number>()
  for (const r of opts.baselineRows || []) {
    const matches = r.page.replace(/\/+$/, '') === page
    if (!matches) continue
    const k = normalizeRewardQuery(r.query)
    if (k) baselineByQuery.set(k, (baselineByQuery.get(k) || 0) + Number(r.clicks) || 0)
  }
  const out: PreparedCronReward[] = []
  const seen = new Set<string>()
  for (const r of opts.currentRows) {
    if (r.page.replace(/\/+$/, '') !== page) continue
    const query = normalizeRewardQuery(r.query)
    if (!query || seen.has(query)) continue
    seen.add(query)
    const clicks = Math.max(0, Number(r.clicks) || 0)
    // A returned GSC page+query row is a real measurement even when clicks are
    // zero. Keep the observation so the ledger records measured non-performance
    // instead of silently converting it into "no data".
    const baselineClicks = baselineByQuery.has(query) ? baselineByQuery.get(query)! : null
    // Improvement credit is ONLY warranted when we actually know the action that
    // led to the observation. An absent/unknown action can never be credited as
    // an improvement — that would train a specific create/refresh attribution
    // against guessed provenance.
    const actionKnown = Boolean(opts.mission.action && opts.mission.action !== 'unknown')
    const improvementCredited = actionKnown && baselineClicks != null && clicks > baselineClicks
    const deltaClicks = improvementCredited ? clicks - baselineClicks : 0
    const label = improvementCredited ? CRON_ATTRIBUTION_IMPROVEMENT_ACTION : CRON_ATTRIBUTION_ACTION
    out.push({
      pageUrl: page,
      topic: opts.mission.topic,
      query,
      // The job's RECORDED action identity (regeneration_mode) lives in `action`;
      // the observation/improvement status is the label — never conflated.
      // 'unknown' means no recorded action — no invented create/refresh claim.
      action: opts.mission.action || 'unknown',
      observationLabel: label,
      deltaClicks,
      baselineClicks,
      improvementCredited,
      windowStart: opts.currentWindow.start,
      windowEnd: opts.currentWindow.end,
      note: improvementCredited
        ? `completed-window gain: baseline ${baselineClicks} → ${clicks} clicks (window ${opts.currentWindow.start}..${opts.currentWindow.end}, bucket ${opts.bucket}, action ${opts.mission.action})`
        : opts.mission.action
          ? `completed-window observation for action "${opts.mission.action}" (${clicks} clicks) in ${opts.currentWindow.start}..${opts.currentWindow.end}`
          : `completed-window observation — action not recorded, no improvement credited (${clicks} clicks) in ${opts.currentWindow.start}..${opts.currentWindow.end}`,
      dedupeKey: `${dedupeBase}${query}:${opts.currentWindow.start}:${opts.currentWindow.end}`,
    })
  }
  return out
}

/** Fetch GSC page+query rows for an explicit window (page-specific, not query gossip). */
const GSC_ATTRIBUTION_ACCESS_TIMEOUT_MS = 20_000
const GSC_ATTRIBUTION_FETCH_TIMEOUT_MS = 15_000
// Fixed 14-day buckets have at most 14 current-window alignments; adding each
// immediately-prior baseline yields at most 28 distinct windows. Keep a small
// hard ceiling above that theoretical maximum so evidence acquisition stays bounded.
const GSC_ATTRIBUTION_MAX_DISTINCT_WINDOWS = 32
const GSC_ATTRIBUTION_FETCH_CONCURRENCY = 4
const GSC_ATTRIBUTION_ROW_LIMIT = 25_000

type GscWindowAccess = { accessToken: string; siteUrl: string }

async function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function fetchGscPageQueryRowsStrict(
  window: CronAttributionWindow,
  access: GscWindowAccess,
): Promise<GscPageQueryRow[]> {
  const queryWindow = async (startRow: number, rowLimit: number) => {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: window.start,
          endDate: window.end,
          dimensions: ['page', 'query'],
          rowLimit,
          startRow,
          type: 'web',
        }),
        signal: AbortSignal.timeout(GSC_ATTRIBUTION_FETCH_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `GSC attribution window ${window.start}..${window.end} failed (${res.status}): ${text.slice(0, 160)}`,
      )
    }
    const data = (await res.json()) as {
      rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>
    }
    return data.rows || []
  }

  const rows = await queryWindow(0, GSC_ATTRIBUTION_ROW_LIMIT)
  if (rows.length >= GSC_ATTRIBUTION_ROW_LIMIT) {
    const overflow = await queryWindow(GSC_ATTRIBUTION_ROW_LIMIT, 1)
    if (overflow.length) {
      throw new Error(
        `GSC attribution window ${window.start}..${window.end} exceeds ${GSC_ATTRIBUTION_ROW_LIMIT} rows; holding incomplete evidence`,
      )
    }
  }

  return rows
    .filter((r) => Array.isArray(r.keys) && r.keys.length >= 2 && typeof r.keys[0] === 'string')
    .map((r) => ({
      page: String(r.keys[0]).trim(),
      query: String(r.keys[1]).trim(),
      clicks: Number(r.clicks) || 0,
      impressions: Number(r.impressions) || 0,
      position: Number(r.position) || 0,
    }))
}

export async function fetchGscPageQueryRows(window: CronAttributionWindow): Promise<GscPageQueryRow[]> {
  try {
    const { getGscAccess } = await import('@/lib/gscAuth')
    const access = await getGscAccess()
    if (!access?.accessToken || !access.siteUrl) return []
    return await fetchGscPageQueryRowsStrict(window, {
      accessToken: access.accessToken,
      siteUrl: access.siteUrl,
    })
  } catch {
    return []
  }
}

export async function attributizeOutcomes(
  today?: string,
): Promise<{
  events: number
  jobsConsidered: number
  jobsMatched: number
  duplicatesSkipped: number
  persistFailed: number
  unavailable?: string
  preparedEvents?: number
  historyRows?: number
  distinctWindows?: number
}> {
  const empty = { events: 0, jobsConsidered: 0, jobsMatched: 0, duplicatesSkipped: 0, persistFailed: 0 }
  const hold = (reason: string, jobsConsidered = 0) => ({ ...empty, jobsConsidered, unavailable: reason })
  let jobsObservedForFailure = 0
  try {
    const client = await db()
    if (!client) return hold('reward database unavailable')
    // Bounded pagination over ALL merged/closed jobs in ascending merge order.
    // No rolling created_at cutoff and no silent 50/500-row truncation: the
    // page anchor needs the globally-earliest merge (the front of the set),
    // while governing-job selection needs the LATEST merge PER PAGE — a single
    // capped ascending slice would silently lose the newest refreshes and any
    // page whose jobs rank past the cap.
    const PAGE_SIZE = 200
    const MAX_PAGES = 100 // 20k-job hard ceiling
    const jobs: Array<Record<string, unknown>> = []
    let paginationComplete = false
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await client
        .from('content_jobs')
        .select('id,title,topic,primary_keyword,status,content_path,canonical_url,created_at,merged_at,regeneration_mode')
        .in('status', ['merged', 'closed'])
        .order('merged_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
      if (error) {
        // History read failed → hold attribution, write no rewards (fail closed).
        const reason = 'content_jobs read failed: ' + error.message
        console.warn('[seoEngine] attributizeOutcomes content_jobs read failed — holding attribution', error.message)
        return hold(reason, jobs.length)
      }
      const rows = (data as Array<Record<string, unknown>>) || []
      jobs.push(...rows)
      jobsObservedForFailure = jobs.length
      if (rows.length < PAGE_SIZE) {
        paginationComplete = true
        break
      }
    }
    if (!paginationComplete) {
      // Ceiling reached without a short page — the fetched history may be
      // incomplete. FAIL CLOSED: explicitly probe for any row strictly beyond
      // the last fetched index; if one exists, hold EVERYTHING and return with
      // zero reward writes (never credit against partial history).
      const probeFrom = jobs.length
      const probe = await client
        .from('content_jobs')
        .select('id')
        .in('status', ['merged', 'closed'])
        .order('merged_at', { ascending: true })
        .order('id', { ascending: true })
        .range(probeFrom, probeFrom)
      if (probe.error) {
        const reason = 'content_jobs ceiling probe failed: ' + probe.error.message
        console.warn('[seoEngine] attributizeOutcomes ceiling probe failed — holding attribution', probe.error.message)
        return hold(reason, jobs.length)
      }
      if ((probe.data as Array<Record<string, unknown>> | null | undefined)?.length) {
        const reason = 'content_jobs history exceeds safe attribution ceiling'
        console.warn('[seoEngine] attributizeOutcomes hit the content_jobs page ceiling — holding attribution (incomplete history)')
        return hold(reason, 0)
      }
    }
    if (!jobs.length) return empty
    const runDate = (today || new Date().toISOString().slice(0, 10)).slice(0, 10)

    // VERIFIED publication ONLY: a real merge timestamp. created_at/closed_at
    // are draft/closure bookkeeping, not publication — unknown means skip, so
    // pre-publication clicks can never leak into an observation window.
    type AttrJob = { jobId: string; pageUrl: string; topic: string; mergedDay: string; action: string | null }
    const byPage = new Map<string, AttrJob[]>()
    for (const job of jobs) {
      const merged = String(job.merged_at || '').trim()
      if (!merged) continue
      const pageUrl = String(job.canonical_url || '').trim().replace(/\/+$/, '')
      if (!pageUrl) continue
      // RECORDED action only (regeneration_mode). A null/absent value stays
      // 'unknown' — never guessed from row order or job ordering.
      const recordedAction = String(job.regeneration_mode || '').trim()
      const entry: AttrJob = {
        jobId: String(job.id),
        pageUrl,
        topic: String(job.topic || job.primary_keyword || job.title || ''),
        mergedDay: merged.slice(0, 10),
        action: recordedAction || null,
      }
      const list = byPage.get(pageUrl)
      if (list) list.push(entry)
      else byPage.set(pageUrl, [entry])
    }

    // Build the complete page/window plan BEFORE any reward write. This makes
    // external evidence acquisition all-or-nothing: if a GSC window cannot be
    // read, no earlier page can already have been credited.
    type AttrPlan = {
      mission: CronMission
      win: { window: CronAttributionWindow; baselineWindow: CronAttributionWindow | null; completedBucket: number; daysSincePublish: number }
    }
    const plans: AttrPlan[] = []
    const distinctWindows = new Map<string, CronAttributionWindow>()
    const windowKey = (w: CronAttributionWindow): string => `${w.start}:${w.end}`

    for (const [, pageJobs] of byPage) {
      const basePublication = pageJobs.reduce((min, j) => (j.mergedDay < min ? j.mergedDay : min), pageJobs[0].mergedDay)
      const win = attributionWindowsFor(basePublication, runDate)
      if (!win) continue
      const governing =
        pageJobs
          .filter((j) => j.mergedDay <= win.window.start)
          .sort((a, b) =>
            a.mergedDay === b.mergedDay
              ? a.jobId < b.jobId
                ? -1
                : a.jobId > b.jobId
                  ? 1
                  : 0
              : a.mergedDay < b.mergedDay
                ? 1
                : -1,
          )[0] || pageJobs[0]
      plans.push({
        mission: {
          jobId: governing.jobId,
          pageUrl: governing.pageUrl,
          topic: governing.topic,
          publishDate: `${basePublication}T00:00:00Z`,
          action: governing.action,
        },
        win,
      })
      distinctWindows.set(windowKey(win.window), win.window)
      if (win.baselineWindow) distinctWindows.set(windowKey(win.baselineWindow), win.baselineWindow)
    }

    if (!plans.length) return { ...empty, jobsConsidered: jobs.length }
    if (distinctWindows.size > GSC_ATTRIBUTION_MAX_DISTINCT_WINDOWS) {
      console.warn(
        `[seoEngine] attributizeOutcomes needs ${distinctWindows.size} distinct GSC windows (ceiling ${GSC_ATTRIBUTION_MAX_DISTINCT_WINDOWS}) — holding attribution`,
      )
      return hold(
        `GSC attribution requires ${distinctWindows.size} distinct windows (ceiling ${GSC_ATTRIBUTION_MAX_DISTINCT_WINDOWS})`,
        jobs.length,
      )
    }

    // Resolve GSC auth exactly once per attribution pass. getGscAccess() may
    // mint/refresh an OAuth or service-account token, so repeating it per
    // window turns a bounded evidence pass into minutes of redundant network
    // work and can hang the cron route.
    const { getGscAccess } = await import('@/lib/gscAuth')
    const gscAccess = await withDeadline(
      getGscAccess(),
      GSC_ATTRIBUTION_ACCESS_TIMEOUT_MS,
      `GSC access resolution timed out after ${GSC_ATTRIBUTION_ACCESS_TIMEOUT_MS}ms`,
    )
    if (!gscAccess?.accessToken || !gscAccess.siteUrl) {
      const reason = 'GSC access unavailable for reward attribution'
      console.warn('[seoEngine] attributizeOutcomes GSC access unavailable — holding attribution')
      return hold(reason, jobs.length)
    }
    const access: GscWindowAccess = {
      accessToken: gscAccess.accessToken,
      siteUrl: gscAccess.siteUrl,
    }

    // Prefetch every distinct window with bounded concurrency. Any timeout,
    // HTTP error, or parse failure rejects the whole prefetch before reward
    // writes begin, preserving fail-closed evidence semantics.
    const windowCache = new Map<string, GscPageQueryRow[]>()
    const pendingWindows = [...distinctWindows.entries()]
    let nextWindow = 0
    const worker = async (): Promise<void> => {
      while (true) {
        const index = nextWindow
        nextWindow += 1
        if (index >= pendingWindows.length) return
        const [key, window] = pendingWindows[index]
        const rows = await fetchGscPageQueryRowsStrict(window, access)
        windowCache.set(key, rows)
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(GSC_ATTRIBUTION_FETCH_CONCURRENCY, pendingWindows.length) },
        () => worker(),
      ),
    )

    // Prepare every page/query observation in memory before touching the
    // reward ledger. The old path did 2-3 sequential Supabase round-trips PER
    // candidate (exact dedupe, overlap read, write), which made a truthful
    // production pass scale with query count and exceed the cron deadline.
    const preparedAll: PreparedCronReward[] = []
    for (const { mission, win } of plans) {
      const currentRows = windowCache.get(windowKey(win.window)) || []
      const baselineRows = win.baselineWindow
        ? windowCache.get(windowKey(win.baselineWindow)) || []
        : null
      preparedAll.push(
        ...prepareCronRewards({
          mission,
          currentWindow: win.window,
          currentRows,
          baselineRows,
          bucket: win.completedBucket,
        }),
      )
    }

    const MAX_PREPARED_EVENTS = 5_000
    if (preparedAll.length > MAX_PREPARED_EVENTS) {
      return {
        ...hold(
          `reward attribution prepared ${preparedAll.length} events (ceiling ${MAX_PREPARED_EVENTS}); holding oversized pass`,
          jobs.length,
        ),
        preparedEvents: preparedAll.length,
        historyRows: 0,
        distinctWindows: distinctWindows.size,
      }
    }
    if (!preparedAll.length) {
      return {
        ...empty,
        jobsConsidered: jobs.length,
        preparedEvents: 0,
        historyRows: 0,
        distinctWindows: distinctWindows.size,
      }
    }

    // Load ALL relevant overlap history in bounded pages, once. Every candidate
    // window is on/after earliestWindowStart, so older rows ending before that
    // cannot overlap and are intentionally excluded. If this history cannot be
    // proven complete, fail the whole pass BEFORE writes.
    const earliestWindowStart = preparedAll.reduce(
      (min, p) => (p.windowStart < min ? p.windowStart : min),
      preparedAll[0].windowStart,
    )
    const HISTORY_PAGE_SIZE = 1_000
    const HISTORY_MAX_PAGES = 50
    const history: Array<Record<string, unknown>> = []
    let historyComplete = false
    try {
      for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
        const from = page * HISTORY_PAGE_SIZE
        const to = from + HISTORY_PAGE_SIZE - 1
        const { data, error } = await client
          .from('seo_reward_events')
          .select('id,dedupe_key,page_url,query,window_start,window_end')
          .gte('window_end', earliestWindowStart)
          .order('window_end', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
        if (error) {
          return {
            ...hold('reward history read failed: ' + error.message, jobs.length),
            preparedEvents: preparedAll.length,
            historyRows: history.length,
            distinctWindows: distinctWindows.size,
          }
        }
        const rows = (data as Array<Record<string, unknown>>) || []
        history.push(...rows)
        if (rows.length < HISTORY_PAGE_SIZE) {
          historyComplete = true
          break
        }
      }
      if (!historyComplete) {
        const probeFrom = history.length
        const probe = await client
          .from('seo_reward_events')
          .select('id')
          .gte('window_end', earliestWindowStart)
          .order('window_end', { ascending: true })
          .order('id', { ascending: true })
          .range(probeFrom, probeFrom)
        if (probe.error) {
          return {
            ...hold('reward history ceiling probe failed: ' + probe.error.message, jobs.length),
            preparedEvents: preparedAll.length,
            historyRows: history.length,
            distinctWindows: distinctWindows.size,
          }
        }
        if ((probe.data as Array<Record<string, unknown>> | null | undefined)?.length) {
          return {
            ...hold('reward history exceeds safe reconciliation ceiling', jobs.length),
            preparedEvents: preparedAll.length,
            historyRows: history.length,
            distinctWindows: distinctWindows.size,
          }
        }
      }
    } catch (error) {
      return {
        ...hold(
          'reward history read failed: ' + (error instanceof Error ? error.message : 'unknown'),
          jobs.length,
        ),
        preparedEvents: preparedAll.length,
        historyRows: history.length,
        distinctWindows: distinctWindows.size,
      }
    }

    const exactKeys = new Set(
      history.map((row) => String(row.dedupe_key || '')).filter(Boolean),
    )
    const historyByPageQuery = new Map<string, Array<{ start: string; end: string }>>()
    for (const row of history) {
      const pageUrl = String(row.page_url || '').replace(/\/+$/, '')
      const query = normalizeRewardQuery(String(row.query || ''))
      const start = String(row.window_start || '')
      const end = String(row.window_end || '')
      if (!pageUrl || !query || !start || !end) continue
      const key = `${pageUrl}\u0001${query}`
      const list = historyByPageQuery.get(key)
      const interval = { start, end }
      if (list) list.push(interval)
      else historyByPageQuery.set(key, [interval])
    }

    let duplicatesSkipped = 0
    const fresh: PreparedCronReward[] = []
    for (const p of preparedAll) {
      if (exactKeys.has(p.dedupeKey)) {
        duplicatesSkipped += 1
        continue
      }
      const key = `${p.pageUrl.replace(/\/+$/, '')}\u0001${normalizeRewardQuery(String(p.query || ''))}`
      const prior = historyByPageQuery.get(key) || []
      if (prior.some((o) => o.start <= p.windowEnd && o.end >= p.windowStart)) {
        duplicatesSkipped += 1
        continue
      }
      fresh.push(p)
    }

    if (!fresh.length) {
      return {
        events: 0,
        jobsConsidered: jobs.length,
        jobsMatched: 0,
        duplicatesSkipped,
        persistFailed: 0,
        preparedEvents: preparedAll.length,
        historyRows: history.length,
        distinctWindows: distinctWindows.size,
      }
    }

    // One PostgREST upsert is one SQL statement: either the fresh set persists,
    // or a statement error leaves the set uncredited. DB uniqueness on
    // dedupe_key still protects exact concurrent retries.
    const eventsToWrite = fresh.map((p) =>
      creditOutcome({
        pageUrl: p.pageUrl,
        topic: p.topic,
        query: p.query || undefined,
        action: p.action,
        observationLabel: p.observationLabel,
        deltaClicks: p.deltaClicks,
        baselineClicks: p.baselineClicks,
        improvementCredited: p.improvementCredited,
        windowStart: p.windowStart,
        windowEnd: p.windowEnd,
        note: p.note,
        dedupeKey: p.dedupeKey,
      }),
    )
    let writeError: { message: string } | null = null
    try {
      const result = await client
        .from('seo_reward_events')
        .upsert(eventsToWrite.map(rewardEventRow), { onConflict: 'dedupe_key', ignoreDuplicates: true })
      writeError = result.error
    } catch (error) {
      writeError = { message: error instanceof Error ? error.message : 'bulk reward write failed' }
    }
    if (writeError) {
      console.warn('[seoEngine] bulk reward persistence failed', writeError.message)
      return {
        events: 0,
        jobsConsidered: jobs.length,
        jobsMatched: fresh.length,
        duplicatesSkipped,
        persistFailed: fresh.length,
        unavailable: 'bulk reward persistence failed: ' + writeError.message,
        preparedEvents: preparedAll.length,
        historyRows: history.length,
        distinctWindows: distinctWindows.size,
      }
    }

    return {
      events: fresh.length,
      jobsConsidered: jobs.length,
      jobsMatched: fresh.length,
      duplicatesSkipped,
      persistFailed: 0,
      preparedEvents: preparedAll.length,
      historyRows: history.length,
      distinctWindows: distinctWindows.size,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'reward attribution failed'
    console.warn('[seoEngine] attributizeOutcomes failed closed — holding attribution', reason)
    return hold(reason, jobsObservedForFailure)
  }
}
