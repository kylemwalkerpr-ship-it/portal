import {
  DEFAULT_OPPORTUNITY_WEIGHTS,
  ctrOpportunity,
  impressionStrength,
  rankingOpportunity,
  scoreOpportunityList,
} from '@/lib/seoFactory/opportunityScore'

describe('Phase 6 opportunity score (first-party only)', () => {
  it('peaks ranking opportunity around page-one / page-two, not the worst rank', () => {
    expect(rankingOpportunity(12)).toBeGreaterThan(rankingOpportunity(2))
    expect(rankingOpportunity(12)).toBeGreaterThan(rankingOpportunity(80))
    expect(rankingOpportunity(9)).toBeGreaterThan(rankingOpportunity(4))
  })

  it('normalizes impressions against this site’s distribution, not fake volume', () => {
    expect(impressionStrength(100, 100)).toBe(100)
    expect(impressionStrength(0, 100)).toBe(0)
    expect(impressionStrength(10, 1000)).toBeLessThan(impressionStrength(500, 1000))
  })

  it('CTR opportunity is higher when observed CTR is below the position baseline', () => {
    const weak = ctrOpportunity(0.005, 8)
    const strong = ctrOpportunity(0.2, 8)
    expect(weak).toBeGreaterThan(strong)
  })

  it('weights are explicit config and zero-impression rows are not scored', () => {
    const sum = Object.values(DEFAULT_OPPORTUNITY_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 5)
    const scored = scoreOpportunityList([
      { query: 'ghost', impressions: 0, clicks: 0, ctr: 0, position: 12 },
      { query: 'study permit', page: 'https://x/a', impressions: 800, clicks: 12, ctr: 0.015, position: 14, inSuggestions: true, relatedVariantCount: 4 },
      { query: 'already #1', impressions: 2000, clicks: 400, ctr: 0.2, position: 1 },
    ])
    expect(scored.every((o) => o.impressions > 0)).toBe(true)
    expect(scored[0].query).toBe('study permit')
    expect(scored[0].confidence).toBeGreaterThan(scored.find((o) => o.query === 'already #1')!.confidence - 5)
    expect(scored[0].reasons.length).toBeGreaterThan(1)
    expect(JSON.stringify(scored)).not.toMatch(/keywordDifficulty|cpc|volume/)
  })
})
