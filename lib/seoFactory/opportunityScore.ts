/**
 * Phase 6 — first-party opportunity score. Weights are config.
 * Never invent volume, CPC, or KD. Missing signals stay 0 and lower confidence.
 */

export const DEFAULT_OPPORTUNITY_WEIGHTS = {
  rankingOpportunity: 0.3,
  impressionStrength: 0.25,
  ctrOpportunity: 0.15,
  demandValidation: 0.1,
  topicalGap: 0.1,
  internalAuthorityGap: 0.1,
} as const

export type OpportunityWeights = typeof DEFAULT_OPPORTUNITY_WEIGHTS

export type OpportunitySignals = {
  rankingOpportunity: number
  impressionStrength: number
  ctrOpportunity: number
  demandValidation: number
  topicalGap: number
  internalAuthorityGap: number
}

export type SeoOpportunity = {
  id: string
  query: string
  page?: string
  score: number
  confidence: number
  signals: OpportunitySignals
  reasons: string[]
  impressions: number
  clicks: number
  ctr: number
  position: number
}

export type OpportunityEvidence = {
  query: string
  page?: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  inSuggestions?: boolean
  relatedVariantCount?: number
  coverageScore?: number
  internalLinkCount?: number
}

function clamp100(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** Peak value around positions 8–20 (page-one / page-two). Not “worst rank wins”. */
export function rankingOpportunity(position: number): number {
  const p = Number(position) || 0
  if (p <= 0) return 0
  if (p <= 3) return 15
  if (p <= 7) return 45
  if (p <= 10) return 85
  if (p <= 20) return 95
  if (p <= 30) return 70
  if (p <= 40) return 50
  if (p <= 60) return 30
  return 15
}

/** Log percentile vs this site’s own impression distribution. */
export function impressionStrength(impressions: number, siteMax: number): number {
  const imp = Math.max(0, Number(impressions) || 0)
  const max = Math.max(1, Number(siteMax) || 1)
  if (imp <= 0) return 0
  const ratio = Math.log1p(imp) / Math.log1p(max)
  return clamp100(ratio * 100)
}

/** Simple expected CTR by position — first-party baseline, not a paid CTR model. */
export function expectedCtrForPosition(position: number): number {
  const p = Math.round(Number(position) || 0)
  if (p <= 0) return 0
  if (p === 1) return 0.28
  if (p === 2) return 0.16
  if (p === 3) return 0.11
  if (p <= 10) return Math.max(0.025, 0.09 - (p - 3) * 0.009)
  if (p <= 20) return 0.012
  if (p <= 30) return 0.006
  return 0.002
}

export function ctrOpportunity(observedCtr: number, position: number): number {
  const expected = expectedCtrForPosition(position)
  const obs = Number(observedCtr)
  const ctr = obs > 1 ? obs / 100 : obs
  if (expected <= 0) return 0
  const gap = expected - ctr
  if (gap <= 0) return 10
  return clamp100((gap / expected) * 100)
}

export function demandValidation(ev: OpportunityEvidence): number {
  let n = 0
  if ((ev.impressions || 0) > 0) n += 40
  if (ev.inSuggestions) n += 25
  if ((ev.relatedVariantCount || 0) >= 3) n += 25
  else if ((ev.relatedVariantCount || 0) >= 1) n += 10
  if ((ev.clicks || 0) > 0) n += 10
  return clamp100(n)
}

export function topicalGap(coverageScore?: number): number {
  if (coverageScore == null || !Number.isFinite(coverageScore)) return 0
  return clamp100(100 - coverageScore)
}

export function internalAuthorityGap(internalLinkCount?: number): number {
  if (internalLinkCount == null || !Number.isFinite(internalLinkCount)) return 0
  if (internalLinkCount <= 0) return 90
  if (internalLinkCount === 1) return 60
  if (internalLinkCount === 2) return 35
  return 15
}

export function confidenceFromEvidence(ev: OpportunityEvidence): number {
  let c = 0
  if ((ev.impressions || 0) > 0) c += 40
  if ((ev.position || 0) > 0) c += 20
  if (ev.inSuggestions) c += 15
  if ((ev.relatedVariantCount || 0) > 0) c += 10
  if (ev.coverageScore != null) c += 10
  if (ev.internalLinkCount != null) c += 5
  return clamp100(c)
}

export function scoreOpportunity(
  ev: OpportunityEvidence,
  siteMaxImpressions: number,
  weights: OpportunityWeights = DEFAULT_OPPORTUNITY_WEIGHTS,
): SeoOpportunity {
  const signals: OpportunitySignals = {
    rankingOpportunity: rankingOpportunity(ev.position),
    impressionStrength: impressionStrength(ev.impressions, siteMaxImpressions),
    ctrOpportunity: ctrOpportunity(ev.ctr, ev.position),
    demandValidation: demandValidation(ev),
    topicalGap: topicalGap(ev.coverageScore),
    internalAuthorityGap: internalAuthorityGap(ev.internalLinkCount),
  }
  const score = clamp100(
    signals.rankingOpportunity * weights.rankingOpportunity +
      signals.impressionStrength * weights.impressionStrength +
      signals.ctrOpportunity * weights.ctrOpportunity +
      signals.demandValidation * weights.demandValidation +
      signals.topicalGap * weights.topicalGap +
      signals.internalAuthorityGap * weights.internalAuthorityGap,
  )
  const reasons = [
    `Rank ${ev.position || '?'} → ranking opportunity ${signals.rankingOpportunity}`,
    `Impressions ${ev.impressions} (site max ${siteMaxImpressions}) → strength ${signals.impressionStrength}`,
    `CTR ${ev.ctr} vs expected ${expectedCtrForPosition(ev.position).toFixed(3)} → CTR gap ${signals.ctrOpportunity}`,
  ]
  if (ev.coverageScore != null) reasons.push(`Coverage ${ev.coverageScore} → topical gap ${signals.topicalGap}`)
  return {
    id: `opp_${normalizeId(ev.query)}_${normalizeId(ev.page || 'site')}`,
    query: ev.query,
    page: ev.page,
    score,
    confidence: confidenceFromEvidence(ev),
    signals,
    reasons,
    impressions: ev.impressions,
    clicks: ev.clicks,
    ctr: ev.ctr,
    position: ev.position,
  }
}

function normalizeId(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
}

export function scoreOpportunityList(
  rows: OpportunityEvidence[],
  weights: OpportunityWeights = DEFAULT_OPPORTUNITY_WEIGHTS,
): SeoOpportunity[] {
  const withDemand = rows.filter((r) => (r.impressions || 0) > 0 && String(r.query || '').trim())
  const siteMax = Math.max(1, ...withDemand.map((r) => r.impressions || 0))
  return withDemand
    .map((r) => scoreOpportunity(r, siteMax, weights))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
}
