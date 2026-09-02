import { buildPlanEconomics, planEconomicsSummary, resolvePlanActionType, targetPositionFor } from '../lib/seoEngine/planEconomics'

describe('planEconomics — persisted mission card enrichment', () => {
  it('uses the ranking model recommendation when present', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'canada spouse visa',
      impressions: 1200,
      position: 14,
      intent: 'transactional',
      priceMin: 150,
      priceMax: 350,
      recommendedActions: ['Funnel climb · win CTR/answer'],
    })
    expect(econ.actionType).toBe('funnel_climb')
  })

  it('falls back deterministically from position + supply', () => {
    expect(resolvePlanActionType({ position: 14, priceMax: 200 })).toBe('funnel_climb')
    expect(resolvePlanActionType({ position: 3, priceMax: 200 })).toBe('funnel_new')
    expect(resolvePlanActionType({ position: 20, priceMax: null })).toBe('funnel_climb') // pos ≥8 wins
    expect(resolvePlanActionType({ position: 3, priceMax: null })).toBe('funnel_revenue')
  })

  it('generates TitleLab candidates carrying the primary term', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'canada spouse visa',
      impressions: 1200,
      position: 14,
      intent: 'transactional',
      priceMin: 150,
      priceMax: 350,
    })
    expect(econ.titleCandidates.length).toBeGreaterThanOrEqual(1)
    expect(econ.titleCandidates.length).toBeLessThanOrEqual(3)
    for (const t of econ.titleCandidates) {
      expect(t.toLowerCase()).toContain('spouse visa')
    }
  })

  it('computes honest expected revenue only with real impressions', () => {
    const withImpressions = buildPlanEconomics({
      primaryTerm: 'canada spouse visa',
      impressions: 1200,
      position: 14,
      intent: 'transactional',
      priceMin: 150,
      priceMax: 350,
    })
    expect(withImpressions.expectedRevenue).not.toBeNull()
    expect(withImpressions.expectedRevenue!.usdPerMonth).toBeGreaterThan(0)
    expect(withImpressions.expectedRevenue!.note).toMatch(/impressions/)

    const noImpressions = buildPlanEconomics({
      primaryTerm: 'canada spouse visa',
      impressions: 0,
      position: 14,
      intent: 'transactional',
    })
    expect(noImpressions.expectedRevenue).toBeNull()
  })

  it('never estimates revenue for kill_or_merge', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'canada spouse visa',
      impressions: 5000,
      position: 4,
      intent: 'commercial',
      recommendedActions: ['Kill / merge · cannibal overlap ≥0.5'],
    })
    expect(econ.actionType).toBe('kill_or_merge')
    expect(econ.expectedRevenue).toBeNull()
  })

  it('target positions stay monotone and inside [1, pos]', () => {
    for (const pos of [4, 10, 22]) {
      expect(targetPositionFor('funnel_climb', pos)).toBeLessThanOrEqual(pos)
      expect(targetPositionFor('funnel_new', pos)).toBeGreaterThanOrEqual(1)
    }
  })
})
describe('supply-aware revenue estimates (honesty refinements)', () => {
  it('funnel_new without live supply produces NO revenue figure', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'australia study visa',
      impressions: 900,
      position: 12,
      intent: 'transactional',
      priceMin: 150,
      priceMax: 350,
      hasLiveSupply: false,
      recommendedActions: ['Funnel new · launch'],
    })
    expect(econ.actionType).toBe('funnel_new')
    expect(econ.expectedRevenue).toBeNull()
  })

  it('funnel_new WITH live supply estimates revenue', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'uk spouse visa',
      impressions: 900,
      position: 5,
      intent: 'transactional',
      priceMin: 150,
      priceMax: 350,
      hasLiveSupply: true,
    })
    expect(econ.actionType).toBe('funnel_new')
    expect(econ.expectedRevenue).not.toBeNull()
    expect(econ.expectedRevenue!.usdPerMonth).toBeGreaterThan(0)
  })

  it('funnel_climb still estimates on service-less stages (rank value, not launch)', () => {
    const econ = buildPlanEconomics({
      primaryTerm: 'canada study permit',
      impressions: 1400,
      position: 19,
      intent: 'commercial',
      recommendedActions: ['Funnel climb · win CTR/answer'],
      hasLiveSupply: false,
    })
    expect(econ.expectedRevenue).not.toBeNull()
  })
})

describe('planEconomicsSummary — desk rollup', () => {
  it('sums expected revenue and counts the action mix', () => {
    const summary = planEconomicsSummary([
      { action_type: 'funnel_climb', expected_revenue: { usdPerMonth: 340.4 } },
      { action_type: 'funnel_new', expected_revenue: { usdPerMonth: 120 } },
      { action_type: 'funnel_new' },
      { action_type: 'authority_anchor' },
    ])
    expect(summary.revenueUsdMonthly).toBe(460) // 340.4 + 120 rounded
    expect(summary.estimatedPlans).toBe(2)
    expect(summary.byAction).toEqual({ funnel_climb: 1, funnel_new: 2, authority_anchor: 1 })
  })

  it('ignores malformed or missing estimates', () => {
    const summary = planEconomicsSummary([
      { action_type: 'funnel_climb', expected_revenue: null },
      { action_type: '', expected_revenue: { usdPerMonth: 'oops' } },
    ])
    expect(summary.revenueUsdMonthly).toBe(0)
    expect(summary.estimatedPlans).toBe(0)
  })
})
