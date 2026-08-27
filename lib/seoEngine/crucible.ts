/**
 * Opportunity Crucible v2 — the powerhouse pick, not a content mill.
 *
 * Tried-and-tested formula (same family as the Moz/Aira keyword opportunity
 * sheet and the classic KOS spreadsheet):
 *
 *   extraClicks  = volume × max(0, CTR(target) − CTR(now))
 *   moneyEV      = extraClicks × CVR(intent) × value   OR observed GA4 revenue
 *   demand       = log-normalized keyword volume / GSC impressions
 *   intent       = transactional > commercial > local > informational > nav
 *   competitor   = 1 − SERP lock (KD / competitor composite / brand-SERP)
 *   links        = attainability (RD gap vs SERP + available outreach targets)
 *
 *   total = 100 × ( 0.26·money + 0.18·demand + 0.18·intent
 *                 + 0.16·competitor + 0.14·links + 0.08·geo )
 *           × trustReady
 *
 * Hard filters still kill before any of that math: junk, brand-nav, cannibal
 * siblings, no marketplace service, YMYL-critical without statute+disclaimer
 * +author. Money never skips a gate.
 *
 * Sources: Moz keyword opportunity estimation (Δtraffic × CVR × AOV);
 * Ahrefs KD as referring-domain strength of the SERP; industry CTR curves;
 * intent taxonomy used across every serious keyword-research workflow.
 *
 * Deterministic. No AI inside the score.
 */

import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { getStage, primaryServiceFor, type YmylLevel } from '@/lib/seoEngine/ontology'
import { classifyIntent } from '@/lib/seoEngine/rankingModel'

export const CRUCIBLE_VERSION = 'seo-crucible-v2-powerhouse'

/** Weights sum to 1.0. Trust is a multiplier, not a sixth mix-in. */
export const POWERHOUSE_WEIGHTS = {
  moneyEV: 0.26,
  keywordDemand: 0.18,
  searchIntent: 0.18,
  competitorOpen: 0.16,
  linkAttainability: 0.14,
  geoGap: 0.08,
} as const

/** Estate default until GA4 AOV exists. Consultative marketplace, not ecom SKU. */
export const DEFAULT_CONSULT_VALUE_USD = 400

export type CrucibleIntent = 'informational' | 'commercial' | 'transactional' | 'local' | 'navigational'
export type CruciblePlay = 'content_gap' | 'quick_win' | 'refresh' | 'defend' | 'cannibalization' | string

export interface CrucibleInput {
  term: string
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
  intent?: CrucibleIntent
  play?: CruciblePlay
  stage?: string | null
  country?: string | null
  service?: string | null
  ymyl?: YmylLevel | null
  revenue?: number
  purchases?: number
  llmCited?: number
  llmTotal?: number
  hasStatutoryAnchor?: boolean
  hasAuthorPath?: boolean
  hasDisclaimerPath?: boolean
  cannibal?: boolean
  /** Keyword-research monthly volume (Ubersuggest / Ads). Falls back to GSC impressions. */
  volume?: number
  /** 0–100 keyword difficulty (Ahrefs-style, typically RD of the SERP). */
  keywordDifficulty?: number
  /** 0–1 competitor lock. 1 = SERP is closed (brands/gov dominate). */
  competitorLock?: number
  /** Our referring domains (page or domain). */
  referringDomains?: number
  /** Median referring domains of current top-ranking pages. */
  competitorReferringDomains?: number
  /** Count of viable outreach targets already in the backlink ledger. */
  backlinkTargetsAvailable?: number
}

export interface CrucibleLayers {
  moneyEV: number
  keywordDemand: number
  searchIntent: number
  competitorOpen: number
  linkAttainability: number
  geoGap: number
  trustReady: number
}

export interface CrucibleScore {
  version: string
  term: string
  killed: boolean
  killReason: string | null
  layers: CrucibleLayers
  total: number
  extraClicks: number
  service: string | null
  stage: string | null
  intent: CrucibleIntent
  reasons: string[]
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}
function clamp100(v: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 0)))
}

/** Industry organic CTR curve (AWR / Sistrix blend used by opportunity sheets). */
export function organicCtr(position: number): number {
  const p = Math.max(1, Number(position) || 100)
  if (p <= 1) return 0.28
  if (p <= 2) return 0.15
  if (p <= 3) return 0.11
  if (p <= 4) return 0.08
  if (p <= 5) return 0.07
  if (p <= 10) return 0.04
  if (p <= 20) return 0.015
  if (p <= 40) return 0.006
  return 0.001
}

export function intentCvr(intent: CrucibleIntent): number {
  if (intent === 'transactional') return 0.08
  if (intent === 'commercial') return 0.045
  if (intent === 'local') return 0.03
  if (intent === 'navigational') return 0.004
  return 0.008
}

export function intentFit(intent: CrucibleIntent): number {
  if (intent === 'transactional') return 1
  if (intent === 'commercial') return 0.82
  if (intent === 'local') return 0.7
  if (intent === 'navigational') return 0.12
  return 0.38
}

/** Realistic next rank we will actually fight for (not fantasy #1 on YMYL). */
export function targetPosition(current: number): number {
  const p = Math.max(1, Number(current) || 80)
  if (p <= 3) return 1
  if (p <= 10) return 3
  if (p <= 20) return 8
  return 12
}

export function extraClicks(volume: number, position: number): number {
  const v = Math.max(0, Number(volume) || 0)
  const now = organicCtr(position)
  const next = organicCtr(targetPosition(position))
  return Math.max(0, v * (next - now))
}

function resolveMeta(input: CrucibleInput): {
  stage: string | null
  service: string | null
  ymyl: YmylLevel | null
  funnel: 'top' | 'middle' | 'bottom' | null
  hasStatute: boolean
  hasAuthor: boolean
  hasDisclaimer: boolean
} {
  const stageDef = input.stage ? getStage(input.stage) : undefined
  const service = input.service || (stageDef ? primaryServiceFor(stageDef) : null)
  const ymyl = input.ymyl || stageDef?.ymyl || null
  const anchors = stageDef ? Object.values(stageDef.countries).some((c) => (c.statutoryAnchors || []).length > 0) : false
  return {
    stage: input.stage || null,
    service: service || null,
    ymyl,
    funnel: stageDef?.funnel || null,
    hasStatute: input.hasStatutoryAnchor ?? anchors,
    hasAuthor: input.hasAuthorPath ?? true,
    hasDisclaimer: input.hasDisclaimerPath ?? true,
  }
}

export function killReason(input: CrucibleInput): string | null {
  const term = String(input.term || '').trim()
  if (!term || term.length < 3) return 'empty-term'
  if (isJunkQuery(term)) return 'junk-query'
  if (/\byousafe\b/i.test(term) && /\b(login|portal|sign in|official site)\b/i.test(term)) return 'brand-navigational'
  if (input.play === 'cannibalization' || input.cannibal) return 'cannibal-sibling'
  const meta = resolveMeta(input)
  if (!meta.service) return 'no-marketplace-service'
  if (meta.ymyl === 'critical' && !(meta.hasStatute && meta.hasDisclaimer && meta.hasAuthor)) {
    return 'ymyl-critical-no-trust-path'
  }
  return null
}

function keywordDemand(input: CrucibleInput, service: string | null): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const volume = Math.max(Number(input.volume) || 0, Number(input.impressions) || 0)
  const demand = clamp01(Math.log10(volume + 10) / 4.6)
  if (volume > 0) reasons.push(`keyword demand ${volume.toLocaleString()}/mo`)
  else reasons.push('no keyword-research volume yet')
  let s = demand
  if (service && String(input.term || '').toLowerCase().includes(service.replace(/-/g, ' '))) {
    s = clamp01(s + 0.12)
    reasons.push(`query overlaps marketplace service "${service}"`)
  }
  return { score: s, reasons }
}

function competitorOpen(input: CrucibleInput): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const kd = Number(input.keywordDifficulty)
  const lockIn = Number(input.competitorLock)
  const position = Math.max(1, Number(input.position) || 80)
  let lock = 0.45
  if (Number.isFinite(lockIn) && lockIn >= 0) {
    lock = clamp01(lockIn)
    reasons.push(`competitor lock ${Math.round(lock * 100)}/100`)
  } else if (Number.isFinite(kd) && kd > 0) {
    lock = clamp01(kd / 100)
    reasons.push(`keyword difficulty ${Math.round(kd)}`)
  } else {
    // SERP proxy: page-1 with huge impressions is a locked fight; deep rank is open.
    lock = position <= 3 ? 0.72 : position <= 10 ? 0.48 : position <= 20 ? 0.32 : 0.22
    reasons.push(`SERP openness from rank #${Math.round(position)}`)
  }
  return { score: clamp01(1 - lock), reasons }
}

function linkAttainability(input: CrucibleInput): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const ours = Math.max(0, Number(input.referringDomains) || 0)
  const theirs = Math.max(0, Number(input.competitorReferringDomains) || 0)
  const targets = Math.max(0, Number(input.backlinkTargetsAvailable) || 0)
  let s = 0.5
  if (theirs > 0) {
    const gap = Math.max(0, theirs - ours)
    // Attainable when the gap is real but not absurd (Ahrefs KD philosophy).
    s = gap <= 5 ? 0.82 : gap <= 20 ? 0.64 : gap <= 50 ? 0.42 : 0.22
    reasons.push(`RD gap ${gap} (us ${ours} vs SERP ${theirs})`)
  } else {
    reasons.push('no competitor RD yet — assume mid attainability')
  }
  if (targets > 0) {
    s = clamp01(s + Math.min(0.2, targets * 0.03))
    reasons.push(`${targets} outreach targets in ledger`)
  }
  return { score: clamp01(s), reasons }
}

function moneyLayer(input: CrucibleInput, intent: CrucibleIntent, volume: number, position: number): { score: number; extraClicks: number; reasons: string[] } {
  const reasons: string[] = []
  const revenue = Math.max(0, Number(input.revenue) || 0)
  const purchases = Math.max(0, Number(input.purchases) || 0)
  const clicks = extraClicks(volume, position)
  const aov = purchases > 0 && revenue > 0 ? revenue / purchases : DEFAULT_CONSULT_VALUE_USD
  const projected = clicks * intentCvr(intent) * aov
  const observed = revenue
  const dollars = Math.max(projected, observed)
  const score = clamp01(Math.log10(dollars + 10) / 5)
  reasons.push(`+${Math.round(clicks)} extra clicks → ~$${Math.round(projected).toLocaleString()} EV`)
  if (observed > 0) reasons.push(`GA4 already $${Math.round(observed).toLocaleString()}`)
  return { score, extraClicks: clicks, reasons }
}

function geoGap(input: CrucibleInput): { score: number; reasons: string[] } {
  const reasons: string[] = []
  const cited = Math.max(0, Number(input.llmCited) || 0)
  const total = Math.max(0, Number(input.llmTotal) || 0)
  let s = 0.55
  if (total > 0) {
    const rate = cited / total
    s = clamp01(0.25 + (1 - rate) * 0.7)
    reasons.push(`LLM citations ${cited}/${total}`)
  } else {
    reasons.push('no LLM audit yet — open AI-visibility gap')
  }
  const t = String(input.term || '')
  if (/\b(how|what|requirements?|checklist|cost|fee|steps?)\b/i.test(t)) {
    s = clamp01(s + 0.08)
    reasons.push('quotable / AEO-shaped query')
  }
  return { score: s, reasons }
}

function trustReady(meta: ReturnType<typeof resolveMeta>): { score: number; reasons: string[] } {
  const reasons: string[] = []
  if (meta.ymyl === 'critical') {
    reasons.push('YMYL-critical — statute + disclaimer + author required')
    return { score: 1, reasons }
  }
  let s = 0.7
  if (meta.hasStatute) { s += 0.12; reasons.push('statutory anchors in ontology') }
  if (meta.hasAuthor) s += 0.1
  if (meta.hasDisclaimer) s += 0.08
  if (meta.ymyl === 'high') reasons.push('YMYL-high — trust floor applied')
  return { score: clamp01(s), reasons }
}

export function scoreCrucible(input: CrucibleInput): CrucibleScore {
  const term = String(input.term || '').trim()
  const classified = classifyIntent(term)
  const intent = (input.intent || classified.primary) as CrucibleIntent
  const meta = resolveMeta(input)
  const killed = killReason(input)
  const empty: CrucibleLayers = {
    moneyEV: 0, keywordDemand: 0, searchIntent: 0,
    competitorOpen: 0, linkAttainability: 0, geoGap: 0, trustReady: 0,
  }
  if (killed) {
    return {
      version: CRUCIBLE_VERSION,
      term,
      killed: true,
      killReason: killed,
      layers: empty,
      total: 0,
      extraClicks: 0,
      service: meta.service,
      stage: meta.stage,
      intent,
      reasons: [`killed: ${killed}`],
    }
  }
  const volume = Math.max(Number(input.volume) || 0, Number(input.impressions) || 0)
  const position = Math.max(1, Number(input.position) || 80)
  const demand = keywordDemand(input, meta.service)
  const intentLayer = { score: intentFit(intent), reasons: [`search intent: ${intent}`] }
  const compete = competitorOpen(input)
  const links = linkAttainability(input)
  const money = moneyLayer(input, intent, volume, position)
  const geo = geoGap(input)
  const trust = trustReady(meta)
  const layers: CrucibleLayers = {
    moneyEV: money.score,
    keywordDemand: demand.score,
    searchIntent: intentLayer.score,
    competitorOpen: compete.score,
    linkAttainability: links.score,
    geoGap: geo.score,
    trustReady: trust.score,
  }
  const mixed =
    POWERHOUSE_WEIGHTS.moneyEV * layers.moneyEV +
    POWERHOUSE_WEIGHTS.keywordDemand * layers.keywordDemand +
    POWERHOUSE_WEIGHTS.searchIntent * layers.searchIntent +
    POWERHOUSE_WEIGHTS.competitorOpen * layers.competitorOpen +
    POWERHOUSE_WEIGHTS.linkAttainability * layers.linkAttainability +
    POWERHOUSE_WEIGHTS.geoGap * layers.geoGap
  const total = clamp100(mixed * layers.trustReady * 100)
  return {
    version: CRUCIBLE_VERSION,
    term,
    killed: false,
    killReason: null,
    layers,
    total,
    extraClicks: money.extraClicks,
    service: meta.service,
    stage: meta.stage,
    intent,
    reasons: [
      ...money.reasons,
      ...demand.reasons,
      ...intentLayer.reasons,
      ...compete.reasons,
      ...links.reasons,
      ...geo.reasons,
      ...trust.reasons,
    ],
  }
}

export function rankCrucible<T extends CrucibleInput>(rows: T[]): Array<T & { crucible: CrucibleScore }> {
  const scored = rows.map((r) => ({ ...r, crucible: scoreCrucible(r) }))
  scored.sort((a, b) => {
    if (a.crucible.killed !== b.crucible.killed) return a.crucible.killed ? 1 : -1
    return b.crucible.total - a.crucible.total
  })
  return scored
}

export function pickNext<T extends CrucibleInput>(rows: T[]): (T & { crucible: CrucibleScore }) | null {
  const ranked = rankCrucible(rows)
  return ranked.find((r) => !r.crucible.killed) || null
}
