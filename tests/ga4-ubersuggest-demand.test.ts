import { ga4RowsToSignals, landingPathToTerm, normalizeGa4PropertyId } from '@/lib/seoEngine/ga4'
import { isCreditOrAuthFailure, parseUbersuggestKeywords, ubersuggestVolumeToImpressions } from '@/lib/seoEngine/ubersuggest'
import { mergeDemandSignals } from '@/lib/seoEngine/keywordDemand'
import { safePull } from '@/lib/seoEngine/demandFeeders'

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
  it('lets Ubersuggest volume lead while GSC keeps live rank', () => {
    const uber = [{ term: 'uk graduate visa', clicks: 0, impressions: 810, position: 55, ctr: 0, source: 'ubersuggest' as const }]
    const gsc = [{ term: 'uk graduate visa', clicks: 8, impressions: 90, position: 11, ctr: 0.09, source: 'gsc' as const }]
    const ga4 = [{ term: 'uk graduate visa', clicks: 210, impressions: 420, position: 32, ctr: 0.5, source: 'ga4' as const }]
    const ads = [{ term: 'skilled worker visa', clicks: 0, impressions: 70, position: 80, ctr: 0, source: 'ads' as const }]
    const merged = mergeDemandSignals(uber, gsc, ga4, ads)
    const grad = merged.find((s) => s.term === 'uk graduate visa')!
    expect(grad.impressions).toBe(810)
    expect(grad.position).toBe(11)
    expect(grad.clicks).toBe(8)
    expect(merged.some((s) => s.term === 'skilled worker visa')).toBe(true)
  })
})

describe('feeder isolation', () => {
  it('flags credit/auth failures so the MCP budget can stop', () => {
    expect(isCreditOrAuthFailure(new Error('HTTP 429 quota exceeded'))).toBe(true)
    expect(isCreditOrAuthFailure(new Error('401 unauthorized'))).toBe(true)
    expect(isCreditOrAuthFailure(new Error('insufficient credits'))).toBe(true)
    expect(isCreditOrAuthFailure(new Error('timeout'))).toBe(false)
  })

  it('weights Ubersuggest volume above typical GSC gaps', () => {
    expect(ubersuggestVolumeToImpressions(5400)).toBeGreaterThan(90)
    expect(ubersuggestVolumeToImpressions(5400)).toBeLessThanOrEqual(4000)
  })

  it('skips a thrown feeder and still returns the others', async () => {
    const dead = await safePull('ga4', async () => { throw new Error('GA4 403') })
    const live = await safePull('gsc', async () => [{ term: 'uk visa', clicks: 1, impressions: 40, position: 12 }])
    expect(dead.skipped).toBe(true)
    expect(dead.signals).toEqual([])
    expect(live.ok).toBe(true)
    expect(live.signals).toHaveLength(1)
  })
})
