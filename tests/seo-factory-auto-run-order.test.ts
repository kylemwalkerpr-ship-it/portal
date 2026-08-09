/**
 * AUTO-RUN ORDERING REGRESSION — the pipeline's candidate pick order must match
 * the ranking model's total ordering.
 *
 * `orderTermsByModel` is what /api/seo-factory/auto-run uses to sequence its
 * explicit plan terms. If anyone changes the comparator, the row lookup, or the
 * model input mapping, the auto-run would start shipping candidates in a
 * different order than the model recommends — this suite locks that contract.
 *
 * The fixture is FIXED: same terms, same GSC signals, same regions — the model
 * is fully deterministic, so the expected ordering is exact, not sampled.
 */
import {
  enrichQueueWithRanking,
  modelTotalForOpportunity,
  orderTermsByModel,
  sortByModelTotal,
  type PlanTermRow,
} from '@/lib/seoEngine/rankingModel'

// Deliberately different demand profiles so model totals are distinct and the
// model's recommended order is NOT the same as the input order below.
const FIXTURE_PLAN: PlanTermRow[] = [
  { term: 'skilled worker visa application steps uk', impressions: 9800, clicks: 210, position: 7, region: 'UK' },
  { term: 'express entry crs points calculator', impressions: 2400, clicks: 64, position: 14, region: 'CA' },
  { term: 'us green card lottery fee', impressions: 420, clicks: 9, position: 33, region: 'US' },
  { term: 'subclass 189 visa requirements', impressions: 35, clicks: 1, position: 62, region: 'AU' },
]

// Input order deliberately scrambled vs the model's recommendation.
const FIXTURE_TERMS = [
  'subclass 189 visa requirements',
  'us green card lottery fee',
  'express entry crs points calculator',
  'skilled worker visa application steps uk',
]

const rowOf = (t: string): PlanTermRow | undefined => FIXTURE_PLAN.find((p) => p.term === t)
const totalOf = (t: string): number => {
  const r = rowOf(t)
  return modelTotalForOpportunity(
    r ? { term: r.term, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position, region: r.region } : { term: t },
  )
}

describe('auto-run · orderTermsByModel regression', () => {
  it('reorders the fixed fixture to the ranking model\'s total ordering (desc)', () => {
    const result = orderTermsByModel(FIXTURE_TERMS, FIXTURE_PLAN)

    // Permutation of the input — nothing lost, nothing invented.
    expect([...result].sort()).toEqual([...FIXTURE_TERMS].sort())

    // The EXACT expected sequence for this fixed fixture — hard-coded so an
    // accidental change to the model's own totals (not just the ordering
    // mechanism) also fails this regression. Verified against the live model.
    const EXPECTED_FIXTURE_ORDER = [
      'skilled worker visa application steps uk',
      'express entry crs points calculator',
      'us green card lottery fee',
      'subclass 189 visa requirements',
    ]
    expect(result).toEqual(EXPECTED_FIXTURE_ORDER)

    // The proof this test matters: the model's order is genuinely different
    // from the scrambled input order.
    expect(result).not.toEqual(FIXTURE_TERMS)

    // Totals along the output are non-increasing.
    const outTotals = result.map((t) => totalOf(t))
    for (let i = 1; i < outTotals.length; i++) expect(outTotals[i]).toBeLessThanOrEqual(outTotals[i - 1])
  })

  it('agrees with the autopilot/war-room ordering path (enrich + sortByModelTotal)', () => {
    const queue = FIXTURE_PLAN.map((p) => ({
      term: p.term,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      position: p.position,
      region: p.region,
      priorityScore: 50, // same lane priority — order must come from the model alone
    }))
    const { queue: enriched } = enrichQueueWithRanking(queue)
    const warRoomOrder = sortByModelTotal(enriched, (o) => o.priorityScore || 0).map((o) => o.term)
    expect(orderTermsByModel(FIXTURE_TERMS, FIXTURE_PLAN)).toEqual(warRoomOrder)
  })

  it('is stable on ties — equal model totals preserve input order', () => {
    const tiePlan: PlanTermRow[] = [
      { term: 'alpha', impressions: 500, clicks: 10, position: 20 },
      { term: 'beta', impressions: 500, clicks: 10, position: 20 },
      { term: 'gamma', impressions: 500, clicks: 10, position: 20 },
    ]
    // Identical signals → identical (deterministic) totals → stable sort keeps
    // the input order; the function must not jitter equal-score candidates.
    expect(orderTermsByModel(['alpha', 'beta', 'gamma'], tiePlan)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('handles terms missing from the plan deterministically', () => {
    const withUnknown = orderTermsByModel(['unknown term xyz', ...FIXTURE_TERMS], FIXTURE_PLAN)
    // Still a permutation — unknown term included, scored with {term} only.
    expect([...withUnknown].sort()).toEqual(['unknown term xyz', ...FIXTURE_TERMS].sort())
    // Hard-coded exact sequence: the four fixture terms in model order, with
    // the no-signal term last (no demand / no entities → lowest total here).
    expect(withUnknown).toEqual([
      'skilled worker visa application steps uk',
      'express entry crs points calculator',
      'us green card lottery fee',
      'subclass 189 visa requirements',
      'unknown term xyz',
    ])
    // Totals stay non-increasing along the whole output (the robust property).
    const totals = withUnknown.map((t) => (rowOf(t) ? totalOf(t) : modelTotalForOpportunity({ term: t })))
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeLessThanOrEqual(totals[i - 1])
  })
})
