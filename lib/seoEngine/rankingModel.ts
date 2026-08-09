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

/** Demand: log-scaled volume + CTR gap + position headroom. */
function scoreDemand(gsc?: RankingModelInput['gsc']): FamilyScore {
  const reasons: string[] = []
  const impressions = Math.max(0, Number(gsc?.impressions) || 0)
  const position = Number(gsc?.position) || 100
  const ctr = Number(gsc?.ctr) || 0
  const clicks = Math.max(0, Number(gsc?.clicks) || 0)
  if (!impressions && !clicks) {
    reasons.push('No GSC demand observed — treat as exploratory.')
    return { score: 18, weight: FAMILY_WEIGHTS.demand, reasons }
  }
  const imp = Math.log10(Math.max(1, impressions) + 9) // ~1–3+
  const posW = position <= 20 ? 1.25 : position <= 40 ? 1.05 : 0.85
  const ctrGap = Math.max(0, expectedCtr(position) - ctr)
  const score = clamp100(imp * 30 * posW + ctrGap * 300 + Math.min(clicks, 60) * 0.5)
  if (impressions >= 500) reasons.push(`Real demand: ${impressions.toLocaleString()} impressions/mo`)
  else if (impressions > 0) reasons.push(`${impressions.toLocaleString()} impressions/mo (long-tail)`)
  if (ctrGap > 0.02) reasons.push(`CTR gap vs expected at #${Math.round(position)} — headline/intro rewrite upside`)
  if (position > 20) reasons.push(`Deep rank #${Math.round(position)} — headroom to climb`)
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
  const base = intent.primary === 'commercial' ? 58 : intent.primary === 'transactional' ? 62 : 55
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
    else if (last > first) { score -= 12; reasons.push(`Position decaying #${Math.round(first)} → #${Math.round(last)} — refresh`) }
    else reasons.push(`Stable at #${Math.round(last)}`)
  } else if (position < 100) {
    reasons.push(`Current rank #${Math.round(position)} (no history yet)`)
  }
  const ctrVs = ctr - expectedCtr(position)
  if (ctrVs > 0.01) { score += 14; reasons.push('CTR above expected — title matches intent') }
  else if (ctrVs < -0.02 && position < 100) { score -= 10; reasons.push('CTR below expected — rewrite title/intro') }
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
export interface PlannedAction {
  action:
    | 'refresh' | 'depth' | 'schema' | 'interlink' | 'new_page'
    | 'backlink' | 'geo_fix' | 'ctr_rewrite'
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

/** Bounded action-uplift table (each action contributes toward an asymptotic floor). */
const ACTION_UPLIFT: Record<PlannedAction['action'], { pos: number; imp: number; click: number }> = {
  refresh: { pos: 0.18, imp: 0.22, click: 0.3 },
  depth: { pos: 0.1, imp: 0.12, click: 0.14 },
  schema: { pos: 0.08, imp: 0.16, click: 0.12 },
  interlink: { pos: 0.1, imp: 0.1, click: 0.1 },
  new_page: { pos: 0.05, imp: 0.4, click: 0.2 },
  backlink: { pos: 0.14, imp: 0.16, click: 0.16 },
  geo_fix: { pos: 0.07, imp: 0.09, click: 0.08 },
  ctr_rewrite: { pos: 0.05, imp: 0.08, click: 0.28 },
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
  const posLift = actions.reduce((s, a) => s + (ACTION_UPLIFT[a.action]?.pos || 0) * (a.strength || 1), 0)
  const impLift = actions.reduce((s, a) => s + (ACTION_UPLIFT[a.action]?.imp || 0) * (a.strength || 1), 0)
  const clickLift = actions.reduce((s, a) => s + (ACTION_UPLIFT[a.action]?.click || 0) * (a.strength || 1), 0)
  const difficulty = clamp01((100 - total) / 100) // stronger model → faster gains
  const assumptions = [
    `Model total ${Math.round(total)}/100 (${difficulty > 0.5 ? 'high difficulty — gains slower' : 'moderate authority — gains realistic'})`,
    ...(actions.length ? [`Planned actions: ${actions.map((a) => `${a.action}×${a.strength || 1}`).join(', ')}`] : ['No planned actions — forecast reflects organic baseline']),
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
}
export interface RewardEvent extends RewardEventInput {
  id: string
  modelVersion: string
  reward: number
  attribution: Partial<Record<SignalFamily, number>>
  observedAt: string
}

/** Which family an action most directly improves. */
export function actionFamily(action: string): SignalFamily {
  const a = String(action || '').toLowerCase()
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
  const posGain = dp < 0 ? clamp01(-dp / 12) : dp > 0 ? -0.3 * clamp01(dp / 12) : 0
  return Math.round(clamp01(0.5 * clickGain + 0.2 * impGain + 0.3 * Math.max(0, posGain)) * 100) / 100
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
  const total = clamp100(rawTotal * (0.7 + confidence * 0.3))

  // Recommended actions from weak families
  const recommendedActions: string[] = []
  if (families.aeoGeo.score < 55) recommendedActions.push('Add answer capsule + FAQ block + stats panel (AEO/GEO)')
  if (families.indexability.score < 60) recommendedActions.push('Fix canonical/schema/crawlability; add llms.txt coverage')
  if (families.eeat.score < 55) recommendedActions.push('Add named author credentials, gov citations, YMYL disclaimer')
  if (families.linkEquity.score < 45) recommendedActions.push('Run interlink plan + backlink outreach lane')
  if (families.behavioral.score < 50 && (Number(g.position) || 100) <= 20) recommendedActions.push('Refresh title/H1/intro for CTR + decay')
  if (families.demand.score >= 60 && (Number(g.position) || 100) > 20) recommendedActions.push('Own this demand: build/expand the canonical now')
  if (input.audit?.wordCount && input.audit.wordCount < 1400) recommendedActions.push('Depth pass — target 1,800–3,500 words with fan-out sub-sections')

  const forecast = buildForecast({
    position: Number(g.position) || undefined,
    impressions: Number(g.impressions) || undefined,
    clicks: Number(g.clicks) || undefined,
    ctr: Number(g.ctr) || undefined,
    modelTotal: total,
    plannedActions: recommendedActions.slice(0, 4).map((a) => ({
      action: (a.includes('answer capsule') ? 'geo_fix' : a.includes('Refresh') ? 'refresh' : a.includes('interlink') || a.includes('backlink') ? 'backlink' : a.includes('canonical') ? 'schema' : 'depth') as PlannedAction['action'],
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
}

/** Compute the full ranking score for an opportunity/radar row (deterministic). */
export function rankingForOpportunity(o: OpportunityRankingSource): RankingScore {
  return computeRankingScore({
    topic: String(o.term || ''),
    scope: 'topic',
    country: o.region || null,
    stage: o.stage || o.lifecycleStage || null,
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
        ? { term: r.term, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position, region: r.region }
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

export async function persistRankingScore(score: RankingScore): Promise<void> {
  try {
    const client = await db()
    if (!client) return
    const key = score.subjectKey || `${score.scope}:${score.topic}`
    // computed_at is set explicitly so re-scoring an existing subject refreshes
    // its ordering (upsert otherwise leaves the original default untouched).
    await client.from('seo_ranking_scores').upsert({
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
  } catch {
    // additive table; persistence is best-effort
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

export async function persistForecast(topic: string, forecast: ForecastResult, subjectKey?: string | null): Promise<void> {
  try {
    const client = await db()
    if (!client) return
    const runDate = new Date().toISOString().slice(0, 10)
    for (const p of forecast.points) {
      // One row per (topic, subject, horizon, day) — the daily cron does not pile up duplicates.
      await client.from('seo_forecast_runs').upsert({
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
    }
  } catch {
    // best-effort
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

export async function persistRewardEvent(event: RewardEvent): Promise<void> {
  try {
    const client = await db()
    if (!client) return
    await client.from('seo_reward_events').insert({
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
    })
  } catch {
    // best-effort
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

export async function recordCalibration(weights: Record<SignalFamily, number>, eventsCount: number, note: string): Promise<void> {
  try {
    const client = await db()
    if (!client) return
    await client.from('seo_model_calibration').insert({
      model_version: RANKING_MODEL_VERSION,
      weights,
      events_count: eventsCount,
      note: note.slice(0, 500),
    })
  } catch {
    // best-effort
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

/** Cron pass: compute + persist ranking scores for the top planner missions. */
export async function runRankingPassForPlans(limit = 15): Promise<{ computed: number; topScores: Array<{ topic: string; total: number }> }> {
  try {
    const { loadPlansDashboard, pullGscSignals } = await import('./planner')
    const { loadKnowledgeFeed } = await import('./knowledge')
    const { plans } = await loadPlansDashboard(limit)
    const signals = await pullGscSignals()
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
        knowledgeBias: cellBias(stage, country),
        // Explicit 0/0 when the cluster has no measured evidence: undefined is
        // intentionally silent (radar rows that never carry visibility), but
        // every cluster plan DOES carry the field — so unmeasured clusters get
        // the actionable 'run the fan-out audit batch' nudge, not silence.
        llmVisibility: llm && llm.total > 0 ? llm : { cited: 0, total: 0 },
      })
      await persistRankingScore(score)
      await persistForecast(term, score.forecast, String(p.cluster_id || ''))
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
 * Honesty rule: only REAL observed quantities are credited. Without a position/
 * impressions history baseline we cannot compute deltas, so this pass credits
 * observed clicks only (clicks in the GSC window) and explicitly zeroes the
 * position/impression deltas — never fabricating gains. Richer deltas come
 * from operator-recorded outcomes via /api/seo-engine/rewards.
 */
export async function attributizeOutcomes(): Promise<{ events: number }> {
  try {
    const client = await db()
    if (!client) return { events: 0 }
    const { data } = await client
      .from('content_jobs')
      .select('id,title,topic,primary_keyword,status,content_path')
      .in('status', ['merged', 'closed'])
      .gte('created_at', new Date(Date.now() - 90 * 86400_000).toISOString())
      .limit(50)
    const jobs = (data as Array<Record<string, unknown>>) || []
    if (!jobs.length) return { events: 0 }
    const { pullGscSignals } = await import('./planner')
    const signals = await pullGscSignals()
    let events = 0
    for (const job of jobs) {
      const hay = `${String(job.title || '')} ${String(job.topic || '')} ${String(job.primary_keyword || '')}`.toLowerCase()
      const matched = signals.find((s) => hay.includes(s.term.toLowerCase().slice(0, 24)))
      if (!matched || matched.clicks <= 0) continue
      const event = creditOutcome({
        pageUrl: String(job.content_path || `job:${String(job.id)}`),
        topic: String(job.topic || job.primary_keyword || ''),
        action: 'refresh',
        // Only real clicks are credited; no baseline → no fabricated position/impression deltas.
        deltaClicks: matched.clicks,
        note: 'cron attribution from GSC (clicks-only — no history baseline)',
      })
      await persistRewardEvent(event)
      events += 1
    }
    return { events }
  } catch {
    return { events: 0 }
  }
}
