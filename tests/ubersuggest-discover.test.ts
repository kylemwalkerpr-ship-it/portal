import {
  titleizeKeyword,
  ubersuggestOpportunityScore,
  ubersuggestSignalsToDiscover,
} from '@/lib/seoEngine/ubersuggestDiscover'

describe('Ubersuggest → Discover briefs', () => {
  const signals = [
    { term: 'uk graduate visa', impressions: 810 },
    { term: 'f-1 visa requirements', impressions: 420 },
    { term: 'rates final.pdf', impressions: 9000 },
    { term: 'uk graduate visa', impressions: 10 },
  ]

  it('titleizes keywords and scores volume without going through the planner', () => {
    expect(titleizeKeyword('uk graduate visa')).toBe('UK Graduate Visa')
    expect(ubersuggestOpportunityScore(810)).toBeGreaterThan(ubersuggestOpportunityScore(40))
    expect(ubersuggestOpportunityScore(0)).toBeGreaterThanOrEqual(28)
  })

  it('drops junk, dedupes, and marks shipped stems as refresh not a sibling gap', () => {
    const briefs = ubersuggestSignalsToDiscover(signals, {
      shippedKeywords: ['UK Graduate Visa Guide'],
      limit: 12,
    })
    expect(briefs.map((b) => b.topic)).toEqual(['uk graduate visa', 'f-1 visa requirements'])
    expect(briefs[0].source).toBe('ubersuggest')
    expect(briefs[0].play).toBe('refresh')
    expect(briefs[1].play).toBe('content_gap')
    expect(briefs[0].signals.some((s) => /Ubersuggest/i.test(s))).toBe(true)
    expect(briefs[0].reason).toMatch(/refresh the canonical/i)
    expect(briefs[1].reason).toMatch(/independent of Master Engine/i)
  })

  it('honors excludeTopics and the Discover cap', () => {
    const briefs = ubersuggestSignalsToDiscover(signals, {
      excludeTopics: ['f-1 visa requirements'],
      limit: 1,
    })
    expect(briefs).toHaveLength(1)
    expect(briefs[0].topic).toBe('uk graduate visa')
  })
})
