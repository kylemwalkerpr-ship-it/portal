/**
 * planEconomics — the enrichment that turns a ranked cluster plan into an
 * actionable, monetizable mission card.
 *
 * For every plan, `runRankingPassForPlans` persists:
 *   - titleCandidates — TitleLab-generated reader-facing H1 candidates
 *     (the estate contract: never template filler);
 *   - actionType       — the v4 funnel verb (funnel_new / funnel_revenue /
 *     funnel_climb / authority_anchor / kill_or_merge);
 *   - expectedRevenue  — honest USD/month estimate = impressions × ΔCTR ×
 *     intentCVR × price, only when real impressions exist.
 *
 * Pure + deterministic; the DB write happens in the caller (rankingModel).
 */

import {
  expectedMonthlyRevenue,
  FUNNEL_FALLBACK_PRICE_USD,
  type FunnelActionKind,
} from './rankingModel'
import { generateTitleCandidates } from './titleLab'

export type PlanEconomics = {
  titleCandidates: string[]
  actionType: FunnelActionKind
  expectedRevenue: { usdPerMonth: number; note: string } | null
}

export type EconomicsInput = {
  primaryTerm: string
  stage?: string | null
  country?: string | null
  relatedTerms?: string[]
  impressions: number
  position: number
  intent?: string | null
  priceMin?: number | null
  priceMax?: number | null
  /** Live marketplace supply for the cell — funnel_new/funnel_revenue
   *  estimates are only honest when a purchasable gig actually exists. */
  hasLiveSupply?: boolean
  /** Ranking-model recommended actions (already funnel-phrased). */
  recommendedActions?: string[]
  /** Measured visibility evidence — plans without any stay conservative. */
  llmEvidence?: boolean
}

const ACTION_BY_STRING: Array<[RegExp, FunnelActionKind]> = [
  [/^funnel new/i, 'funnel_new'],
  [/^funnel revenue/i, 'funnel_revenue'],
  [/^funnel climb/i, 'funnel_climb'],
  [/^authority anchor/i, 'authority_anchor'],
  [/^kill \/ merge/i, 'kill_or_merge'],
]

/** Resolve the funnel action for a plan: ranking-model recommendation first,
 *  then a deterministic fallback from position/supply (climbing a rank-10+
 *  page beats launching a new sibling; a supply-backed funnel stage launches
 *  a service-enabled guide). */
export function resolvePlanActionType(
  input: Pick<EconomicsInput, 'recommendedActions' | 'position' | 'stage' | 'priceMax'>,
): FunnelActionKind {
  for (const action of input.recommendedActions || []) {
    for (const [re, kind] of ACTION_BY_STRING) {
      if (re.test(String(action))) return kind
    }
  }
  const hasSupply = Number(input.priceMax) > 0 || (input.priceMax ?? 0) > 0
  if (hasSupply && input.position >= 8) return 'funnel_climb'
  if (hasSupply) return 'funnel_new'
  if (input.position >= 8) return 'funnel_climb'
  return 'funnel_revenue'
}

/** Optimistic-ish but honest target position for the revenue estimate: the
 *  plan's own 30-day forecast target when present, else a modest climb. */
export function targetPositionFor(action: FunnelActionKind, position: number): number {
  if (action === 'kill_or_merge') return position
  if (action === 'funnel_new') return Math.max(1, Math.min(5, Math.round(position * 0.5)))
  return Math.max(1, position - 5)
}

/** Build the persisted enrichment for one cluster plan (pure; the caller
 *  provides marketplace prices and the ranking model's recommendation). */
export function buildPlanEconomics(input: EconomicsInput): PlanEconomics {
  const actionType = resolvePlanActionType(input)
  const titles = generateTitleCandidates({
    primaryKeyword: input.primaryTerm,
    stageLabel: input.stage || undefined,
    country: input.country || undefined,
    siblingTitles: (input.relatedTerms || []).slice(0, 6),
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((c) => c.title)
  const priceMin = input.priceMin && input.priceMin > 0 ? input.priceMin : FUNNEL_FALLBACK_PRICE_USD
  const priceMax = input.priceMax && input.priceMax > 0 ? input.priceMax : FUNNEL_FALLBACK_PRICE_USD
  const impressions = Number(input.impressions) || 0
  const position = Number(input.position) || 20
  // Supply honesty: launching or revenue-driving a page is only worth
  // estimating against a purchasable service. authority_anchor / funnel_climb
  // on service-less stages still carry a climb value; new/revenue launches
  // without supply get NO revenue figure (never a fabricated one).
  const requiresSupply = actionType === 'funnel_new' || actionType === 'funnel_revenue'
  const expectedRevenue =
    impressions > 0 && actionType !== 'kill_or_merge' && (!requiresSupply || input.hasLiveSupply === true)
      ? expectedMonthlyRevenue({
          impressions,
          currentPosition: position,
          targetPosition: targetPositionFor(actionType, position),
          intent: String(input.intent || 'informational'),
          action: actionType,
          priceMin,
          priceMax,
        })
      : null
  return { titleCandidates: titles, actionType, expectedRevenue }
}
/**
 * Desk rollup: the engine's monthly funnel-value posture from the ranked
 * plan rows — total expected USD/month across plans with a persisted
 * estimate, and the action-mix counts. Used by the daily cron to record
 * economics KPIs in seo_engine_runs ("est. monthly funnel value").
 */
export function planEconomicsSummary(
  rows: Array<Record<string, unknown>>,
): {
  revenueUsdMonthly: number
  estimatedPlans: number
  byAction: Record<string, number>
} {
  let revenueUsdMonthly = 0
  let estimatedPlans = 0
  const byAction: Record<string, number> = {}
  for (const row of rows) {
    const rev = row.expected_revenue as { usdPerMonth?: number } | null | undefined
    if (rev && typeof rev.usdPerMonth === 'number' && Number.isFinite(rev.usdPerMonth)) {
      revenueUsdMonthly += Math.max(0, rev.usdPerMonth)
      estimatedPlans++
    }
    const action = String(row.action_type || '')
    if (action) byAction[action] = (byAction[action] || 0) + 1
  }
  return { revenueUsdMonthly: Math.round(revenueUsdMonthly), estimatedPlans, byAction }
}