import { ga4RowsToSignals, landingPathToTerm, normalizeGa4PropertyId } from '@/lib/seoEngine/ga4'
import { parseUbersuggestKeywords } from '@/lib/seoEngine/ubersuggest'
import { mergeDemandSignals } from '@/lib/seoEngine/keywordDemand'

describe('GA4 landing pages → planner signals', () => {
  it('normalizes property IDs and path slugs', () => {
    expect(normalizeGa4PropertyId('properties/123456789')).toBe('123456789')
    expect(landingPathToTerm('/uk/graduate-visa/')).toBe('uk graduate visa')
    expect(landingPathToTerm('/us/f-1-visa.html')).toBe('us f 1 visa')
  })

  it('turns session rows into owned-site demand and drops junk paths', () => {
    const signals = ga4RowsToSignals([
      { path: '/uk/graduate-visa/', sessions: 420, engaged: 210, bounceRate: 0.4 },
      { path: '/', sessions: 9000, engaged: 100, bounceRate: 0.8 },
      { path: '/uk/graduate-visa/', sessions: 10, engaged: 2, bounceRate: 0.2 },
    ])
    expect(signals.some((s) => s.term === 'uk graduate visa')).toBe(true)
    const grad = signals.find((s) => s.term === 'uk graduate visa')!
    expect(grad.impressions).toBe(420)
    expect(grad.clicks).toBe(210)
    expect(grad.position).toBeLessThan(70)
  })
})

describe('Ubersuggest MCP keyword payload', () => {
  it('accepts several response shapes', () => {
    const a = parseUbersuggestKeywords({
      keywords: [
        { keyword: 'uk graduate visa', search_volume: 5400 },
        { term: 'yousafeconsultancy.com', volume: 900 },
      ],
    })
    expect(a.map((r) => r.term)).toEqual(['uk graduate visa'])
    expect(a[0].volume).toBe(5400)
    const b = parseUbersuggestKeywords([{ query: 'f-1 visa', monthly_searches: 8100 }])
    expect(b[0].term).toBe('f-1 visa')
  })
})

describe('demand merge across GSC + GA4 + Ubersuggest', () => {
  it('keeps GSC rank when GA4 adds sessions to the same term', () => {
    const gsc = [{ term: 'uk graduate visa', clicks: 8, impressions: 90, position: 11, ctr: 0.09 }]
    const ga4 = [{ term: 'uk graduate visa', clicks: 210, impressions: 420, position: 32, ctr: 0.5 }]
    const uber = [{ term: 'skilled worker visa', clicks: 0, impressions: 70, position: 80, ctr: 0 }]
    const merged = mergeDemandSignals(gsc, ga4, uber)
    const grad = merged.find((s) => s.term === 'uk graduate visa')!
    expect(grad.impressions).toBe(420)
    expect(grad.position).toBe(11)
    expect(merged.some((s) => s.term === 'skilled worker visa')).toBe(true)
  })
})
