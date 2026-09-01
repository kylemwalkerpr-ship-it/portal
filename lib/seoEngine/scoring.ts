/**
 * lib/seoEngine/scoring.ts
 *
 * Consolidated opportunity-scoring constants and helpers — the "conversion
 * economy" layer for Phase 2a.
 *
 * PURE module: synchronous, no Supabase / AI imports, so the planner, panels
 * and tests can all import it without side effects or a DB dependency. The
 * only external import is the local ontology (allowed) which is the single
 * source of truth for YMYL / funnel classification.
 *
 * This module owns the ONE opportunity formula every ranking surface uses:
 *
 *   score = ( log10(imp+10)*12 + min(30, clicks/6) )   demand + click bonus
 *         × min(2, 50/max(5,pos))                       ranking-gap headroom
 *         × (stagePriority / 5)                         lifecycle priority
 *         × (1 + knowledgeBias)                         intel bias (raw count/8)
 *         × monetizeFactor(stage, supply)              live marketplace supply (≤1.35)
 *         × revenueLift                                GA4 purchase evidence (≤1.8)
 *         × predictiveAdjustment                       bounded predictive confidence (0.9–1.0)
 *         × shippedPenalty                             0.15 for partially shipped topics
 *         × (corroboratedGsc ? uberBoost : 1.0)        ubersuggest edge only with GSC proof
 *         × conversionScore(stage, intent, supply)     funnel × supply conversion economy
 *
 * Every weight is a named const in SCORING_CONSTANTS so the admin panel can
 * surface them and audits can trace any number back to its factor.
 */

import { getStage } from './ontology'

/** Stage keys that are always funnel stages, independent of ontology state. */
export const FUNNEL_STAGES = ['visa', 'citizenship', 'family'] as const

/**
 * Stages with NO purchasable marketplace service in the ontology — they exist
 * to inform, not to convert (mirrors STAGE_VALUE_DEFAULTS priceMax === 0 in
 * marketplaceValue.ts; keep the two in sync when the ontology grows a stage).
 */
const NON_PURCHASABLE_STAGES = new Set<string>(['intent'])

/** All scoring weights (documented; exported for the admin panel). */
export const SCORING_CONSTANTS = {
  /** demand = log10(impressions + DEMAND_LOG_OFFSET) * DEMAND_MULTIPLIER */
  DEMAND_LOG_OFFSET: 10,
  DEMAND_MULTIPLIER: 12,
  /** clickBonus = min(CLICK_BONUS_MAX, clicks / CLICK_BONUS_DIVISOR) */
  CLICK_BONUS_MAX: 30,
  CLICK_BONUS_DIVISOR: 6,
  /** gap = min(GAP_CAP, GAP_TARGET_POSITION / max(GAP_POSITION_FLOOR, position)) */
  GAP_CAP: 2,
  GAP_TARGET_POSITION: 50,
  GAP_POSITION_FLOOR: 5,
  /** priority factor = stagePriority / STAGE_PRIORITY_NORMALIZER (ontology priority is 1–10) */
  STAGE_PRIORITY_NORMALIZER: 5,
  /** knowledgeBias input is the COUNT of fresh intel items for the cell, divided by this before use. */
  KNOWLEDGE_BIAS_DIVISOR: 8,
  /** GA4 purchase-revenue lift cap: revenueLift = min(REVENUE_LIFT_CAP, 1 + log10(revenue+10)/6). */
  REVENUE_LIFT_CAP: 1.8,
  /** Partial shipped-overlap suppression multiplier (0.15 when the topic is partially covered). */
  SHIPPED_PENALTY: 0.15,
  /** Ubersuggest market-volume edge — applied ONLY when the cell has GSC corroboration. */
  UBER_BOOST: 1.25,
  /** monetizeFactor = hasLiveSupply ? MONETIZE_LIFT : 1 (cap 1.35). */
  MONETIZE_LIFT: 1.35,
  /** conversionScore table (funnel × supply conversion economy, floor 1.0). */
  CONVERSION_TABLE: {
    /** Funnel stage (visa/citizenship/family/critical YMYL) WITH purchasable live supply. */
    funnelSupply: 1.6,
    /** Funnel stage but no live marketplace supply yet. */
    funnelNoSupply: 1.25,
    /** Non-funnel stage with live supply (conversion path exists). */
    midSupply: 1.12,
    /** Non-funnel stage, no supply, but transactional/commercial intent. */
    midMoneyIntent: 1.06,
    /** Informational dead-end: no supply, no money intent, no funnel. */
    deadEnd: 1.0,
  } as const,
} as const

/**
 * True when a stage cell sits at the money end of the funnel: visa /
 * citizenship / family, plus any stage the ontology marks YMYL-critical.
 * Mirrored (re-exported) by marketplaceValue.ts — this is the single
 * implementation.
 */
export function isFunnelStage(stage: string): boolean {
  const def = getStage(stage)
  if (def) return def.ymyl === 'critical'
  return (FUNNEL_STAGES as readonly string[]).includes(String(stage || ''))
}

/** True when the stage hangs a purchasable service off the ontology. */
export function hasPurchasableService(stage: string): boolean {
  const s = String(stage || '')
  if (!s || NON_PURCHASABLE_STAGES.has(s)) return false
  // Conservatively treat ontology-unknown stages as non-purchasable — mirrors
  // the STAGE_VALUE_DEFAULTS lookup failure in marketplaceValue.ts (no range
  // ⇒ no service ⇒ hasLiveSupply never true in practice).
  return getStage(s) !== undefined
}

export type DeadFunnelInput = {
  stage: string
  hasLiveSupply: boolean
  impressions: number
  clicks: number
  knowledgeBias: number
  corroborated: boolean
}

/**
 * Dead-mission kill-switch (v4 hardening): a plan only pays for itself when
 * it can funnel demand toward a purchasable service or build authority. A
 * demand blip in a service-less cell with no corroborating proof is exactly
 * the "refresh — medium value" housekeeping junk. Conservative — never kills
 * funnel stages, never kills anything with meaningful demand of its own.
 */
export function isDeadFunnelMission(input: DeadFunnelInput): boolean {
  const s = String(input.stage || '')
  if (isFunnelStage(s)) return false // visa/citizenship/family always pass
  if (hasPurchasableService(s) && input.hasLiveSupply) return false
  const knownDemand = (Number(input.impressions) || 0) >= 200
  const realClicks = (Number(input.clicks) || 0) > 0
  const intelBacking = (Number(input.knowledgeBias) || 0) > 0
  if (knownDemand || realClicks || intelBacking || input.corroborated) return false
  return !hasPurchasableService(s)
}

const MONEY_INTENT_RE = /transactional|commercial/i

function isMoneyIntent(intent: string): boolean {
  return MONEY_INTENT_RE.test(String(intent || ''))
}

/**
 * Live-supply monetization lift. 1.0 when the stage has no purchasable
 * service OR no live supply; 1.35 when live marketplace supply exists
 * (cap). The old keyword-REGEX money factor (hire/lawyer/consult… 1.4×)
 * is replaced by this — it rewards real purchasable supply per cell, not
 * whether a query happens to contain the word "lawyer".
 */
export function monetizeFactor(stage: string, hasLiveSupply: boolean): number {
  if (!hasPurchasableService(stage)) return 1
  return hasLiveSupply ? SCORING_CONSTANTS.MONETIZE_LIFT : 1
}

/**
 * Conversion economy factor (deterministic, table-driven, floor 1.0):
 *
 *   funnel stage + live supply    → 1.6   (highest-value mission shape)
 *   funnel stage, no supply       → 1.25  (still a funnel bet worth making)
 *   non-funnel + live supply      → 1.12  (conversion path exists mid-funnel)
 *   non-funnel + money intent     → 1.06  (transactional/commercial queries)
 *   informational dead-end        → 1.0   (no service, no intent, no funnel)
 */
export function conversionScore(stage: string, intent: string, hasLiveSupply: boolean): number {
  const t = SCORING_CONSTANTS.CONVERSION_TABLE
  if (isFunnelStage(stage)) return hasLiveSupply ? t.funnelSupply : t.funnelNoSupply
  if (!hasPurchasableService(stage)) return t.deadEnd
  if (hasLiveSupply) return t.midSupply
  if (isMoneyIntent(intent)) return t.midMoneyIntent
  return t.deadEnd
}

/**
 * GA4 purchase-revenue lift: $0 → 1×, ~$1k → ~1.4×, capped at
 * SCORING_CONSTANTS.REVENUE_LIFT_CAP. Real revenue outranks heuristics.
 */
export function revenueLiftFactor(revenue: number): number {
  const r = Math.max(0, Number(revenue) || 0)
  if (r <= 0) return 1
  return Math.min(SCORING_CONSTANTS.REVENUE_LIFT_CAP, 1 + Math.log10(r + 10) / 6)
}

export interface OpportunityScoreInput {
  impressions: number
  position: number
  clicks: number
  stage: string
  country: string
  /** Ontology lifecycle priority (1–10). */
  stagePriority: number
  /**
   * Ranking-gap factor. When omitted it is derived from position:
   * min(GAP_CAP, GAP_TARGET_POSITION / max(GAP_POSITION_FLOOR, position)).
   */
  gap?: number
  /** Fresh-intel bias COUNT for the cell (raw items; divided by KNOWLEDGE_BIAS_DIVISOR inside). */
  knowledgeBias: number
  /** GA4 revenue lift (see revenueLiftFactor); defaults 1. */
  revenueLift?: number
  /** Bounded predictive confidence adjustment (0.9–1.0); defaults 0.9. */
  predictiveAdjustment?: number
  /** 0.15 when the topic partially overlaps shipped content; defaults 1. */
  shippedPenalty?: number
  /** Ubersuggest volume edge (1.25); applied only when isCorroboratedByGsc. */
  uberBoost?: number
  /** Live purchasable marketplace supply exists for this (stage, country) cell. */
  hasLiveSupply: boolean
  /** 'informational' | 'transactional' | 'commercial' — drives conversionScore. */
  intent: string
  /** True when the cell has real GSC impressions that month (proves demand). */
  isCorroboratedByGsc: boolean
}

/**
 * THE consolidated opportunity score — single source of truth for every
 * ranking surface (planner, crucible-derived flows, panel). See the module
 * comment for the full formula.
 */
export function opportunityScore(input: OpportunityScoreInput): number {
  const impressions = Math.max(0, Number(input.impressions) || 0)
  const position = Math.max(1, Number(input.position) || 100)
  const clicks = Math.max(0, Number(input.clicks) || 0)
  const c = SCORING_CONSTANTS

  const demand = Math.log10(impressions + c.DEMAND_LOG_OFFSET) * c.DEMAND_MULTIPLIER
  const clickBonus = Math.min(c.CLICK_BONUS_MAX, clicks / c.CLICK_BONUS_DIVISOR)

  const gap =
    input.gap !== undefined && Number.isFinite(Number(input.gap))
      ? Math.max(0, Math.min(c.GAP_CAP, Number(input.gap)))
      : Math.min(c.GAP_CAP, c.GAP_TARGET_POSITION / Math.max(c.GAP_POSITION_FLOOR, position))

  const priority = Math.max(0, Number(input.stagePriority) || 0) / c.STAGE_PRIORITY_NORMALIZER
  // knowledgeBias arrives as the RAW intel-item count for the cell; the /8
  // normalization is part of the documented formula `(1 + bias/8)`.
  const bias = Math.max(0, Number(input.knowledgeBias) || 0) / c.KNOWLEDGE_BIAS_DIVISOR

  const revenueLift = Math.max(1, Math.min(c.REVENUE_LIFT_CAP, Number(input.revenueLift ?? 1) || 1))
  const predictiveAdjustment = Math.min(1, Math.max(0.9, Number(input.predictiveAdjustment ?? 0.9) || 0.9))
  const shippedPenalty = input.shippedPenalty !== undefined ? Math.max(0.05, Math.min(1, Number(input.shippedPenalty) || 1)) : 1
  // Ubersuggest's volume edge applies ONLY when the cell is corroborated by
  // GSC impressions that month; unproven volume ranks at 1.0.
  const boost = input.isCorroboratedByGsc && Number(input.uberBoost) > 1 ? Math.min(1.5, Math.max(1, Number(input.uberBoost) || 1)) : 1

  const score =
    (demand + clickBonus) *
    gap *
    priority *
    (1 + bias) *
    monetizeFactor(input.stage, input.hasLiveSupply) *
    revenueLift *
    predictiveAdjustment *
    shippedPenalty *
    boost *
    conversionScore(input.stage, input.intent, input.hasLiveSupply)

  return Math.round(score)
}