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
