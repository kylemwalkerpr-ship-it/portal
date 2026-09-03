import { scoreOpportunities } from '@/lib/seoFactory/opportunityEngine'

describe('opportunity engine — cannibal classification', () => {
  it('does not list junk GSC leftovers as cannibal clusters', () => {
    const result = scoreOpportunities({
      queries: [
        { term: '"user2983" "stockton room and meal plan rates"', impressions: 40, clicks: 0, ctr: 0, position: 12 },
        { term: '0300 number eligibility', impressions: 200, clicks: 8, ctr: 0.04, position: 9 },
      ],
      coverage: [
        { title: 'UK visa phone numbers', topic: 'home office 0300', primaryKeyword: '0300 number' },
        { title: 'Stockton campus housing', topic: 'room rates', primaryKeyword: 'meal plan' },
        { title: 'Pacific housing guide', topic: 'room and board', primaryKeyword: 'housing rates' },
      ],
      limit: 10,
    })
    expect(result.cannibalization.map((c) => c.term)).not.toContain(
      '"user2983" "stockton room and meal plan rates"',
    )
  })

  it('does not flag two-token overlap as cannibalization', () => {
    const result = scoreOpportunities({
      queries: [
        { term: 'stockton room rates', impressions: 30, clicks: 1, ctr: 0.03, position: 15 },
      ],
      coverage: [
        { title: 'Campus room guide', primaryKeyword: 'room' },
        { title: 'Fee rates 2026', primaryKeyword: 'rates' },
      ],
      limit: 10,
    })
    expect(result.cannibalization).toEqual([])
  })

  it('still flags a real cluster when two pages share the query', () => {
    const result = scoreOpportunities({
      queries: [
        { term: 'uk dependent visa', impressions: 800, clicks: 40, ctr: 0.05, position: 8 },
      ],
      coverage: [
        { title: 'UK dependent visa guide', primaryKeyword: 'uk dependent visa', url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa/' },
        { title: 'UK dependent visa 2026', topic: 'uk dependent visa documents', url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa-2026/' },
      ],
      limit: 10,
    })
    expect(result.cannibalization.some((c) => c.term === 'uk dependent visa')).toBe(true)
    expect(result.cannibalization[0].pages).toEqual([
      'https://legal.yousafeconsultancy.com/uk/dependent-visa/',
      'https://legal.yousafeconsultancy.com/uk/dependent-visa-2026/',
    ])
  })
})

describe('opportunity engine — monetary ranking', () => {
  it('ranks transactional hire queries above high-traffic informational guides', () => {
    const result = scoreOpportunities({
      queries: [
        { term: 'what is an f-1 visa', impressions: 9000, clicks: 200, ctr: 0.022, position: 8 },
        { term: 'hire immigration lawyer', impressions: 400, clicks: 30, ctr: 0.075, position: 11 },
      ],
      limit: 10,
    })
    expect(result.opportunities[0].topic).toBe('hire immigration lawyer')
    expect(result.opportunities[0].profitability).toBe('high')
    expect(result.opportunities[0].contentType).toBe('marketplace_gig')
    expect(result.opportunities[0].signals.join(' ')).toMatch(/purchase funnel/i)
  })

  it('GA4 revenue outranks a high-traffic zero-revenue guide', () => {
    const result = scoreOpportunities({
      queries: [
        { term: 'what is an f-1 visa', impressions: 9000, clicks: 200, ctr: 0.022, position: 8, revenue: 0 },
        { term: 'uk graduate visa', impressions: 300, clicks: 12, ctr: 0.04, position: 16, revenue: 2400, purchases: 4 },
      ],
      limit: 10,
    })
    expect(result.opportunities[0].topic).toBe('uk graduate visa')
    expect(result.opportunities[0].profitability).toBe('high')
    expect(result.opportunities[0].revenue).toBe(2400)
    expect(result.opportunities[0].signals.join(' ')).toMatch(/GA4 revenue/i)
  })
})

describe('opportunity engine — crucible feeder fields', () => {
  it('preserves volume, KD, and backlink counts onto scored opportunities', () => {
    const result = scoreOpportunities({
      queries: [
        {
          term: 'uk graduate visa',
          impressions: 800,
          clicks: 20,
          ctr: 0.025,
          position: 14,
          volume: 5400,
          keywordDifficulty: 22,
          backlinkTargetsAvailable: 9,
          referringDomains: 4,
          competitorReferringDomains: 18,
        },
      ],
      limit: 5,
    })
    expect(result.opportunities[0].topic).toBe('uk graduate visa')
    expect(result.opportunities[0].volume).toBe(5400)
    expect(result.opportunities[0].keywordDifficulty).toBe(22)
    expect(result.opportunities[0].backlinkTargetsAvailable).toBe(9)
    expect(result.opportunities[0].referringDomains).toBe(4)
    expect(result.opportunities[0].competitorReferringDomains).toBe(18)
  })
})

describe('opportunity engine — editorial value discipline', () => {
  it('harmonizes question queries into a grammatical reader-facing title', () => {
    const result = scoreOpportunities({
      queries: [{ term: 'how to apply for uk spouse visa', impressions: 500, clicks: 10, ctr: 0.02, position: 18 }],
      limit: 5,
    })
    expect(result.opportunities[0].title.toLowerCase()).toMatch(/uk spouse visa/)
    expect(result.opportunities[0].title).not.toMatch(/updated requirements and guidance/i)
    expect(result.opportunities[0].title).not.toMatch(/How to Apply for How to Apply/i)
  })

  it('demotes thin greenfield ideas instead of feeding a content mill', () => {
    const result = scoreOpportunities({
      queries: [
        { term: 'obscure visa phrase', impressions: 2, clicks: 0, ctr: 0, position: 80 },
        { term: 'uk graduate visa requirements', impressions: 700, clicks: 15, ctr: 0.021, position: 14 },
      ],
      limit: 5,
    })
    const thin = result.opportunities.find((item) => item.topic === 'obscure visa phrase')!
    expect(thin.priorityTier).toBe('low')
    expect(result.opportunities[0].topic).toBe('uk graduate visa requirements')
  })
})
