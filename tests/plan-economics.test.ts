import { buildPlanEconomics, resolvePlanActionType, targetPositionFor } from '../lib/seoEngine/planEconomics'

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