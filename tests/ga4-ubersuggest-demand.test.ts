import { ga4RowsToSignals, landingPathToTerm, normalizeGa4PropertyId } from '@/lib/seoEngine/ga4'
import {
  isCreditOrAuthFailure,
  isTransientMcpFailure,
  parseUbersuggestKeywords,
  sanitizeMcpError,
  ubersuggestRpc,
  ubersuggestVolumeToImpressions,
} from '@/lib/seoEngine/ubersuggest'
import { UBERSUGGEST_TOOL_CATALOG, ubersuggestSpendPlan } from '@/lib/seoEngine/ubersuggestCatalog'
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
    const c = parseUbersuggestKeywords(['uk graduate visa questions'], { allowZeroVolume: true })
    expect(c[0].term).toBe('uk graduate visa questions')
    const d = parseUbersuggestKeywords({ keywords: [{ keyword: 'opt stem', volume: 1200, position: 11 }] })
    expect(d[0].position).toBe(11)
  })
})

describe('Ubersuggest MCP catalog → engine spend', () => {
  it('maps all 42 live tools and spends the hot path on named MCP tools', () => {
    expect(UBERSUGGEST_TOOL_CATALOG).toHaveLength(42)
    expect(UBERSUGGEST_TOOL_CATALOG.map((t) => t.name)).toEqual(expect.arrayContaining([
      'keyword_suggestions', 'match_keywords', 'google_suggestions', 'keyword_overview',
      'content_ideas', 'domain_overview', 'domain_keywords', 'domain_top_pages',
      'serp_analysis', 'backlinks_overview', 'list_projects',
    ]))
    const plan = ubersuggestSpendPlan()
    expect(plan).toHaveLength(16)
    expect(plan.every((step) => UBERSUGGEST_TOOL_CATALOG.some((t) => t.name === step.name))).toBe(true)
    expect(plan.filter((s) => s.layer === 'keyword').length).toBeGreaterThanOrEqual(6)
    expect(plan.some((s) => s.layer === 'domain')).toBe(true)
    expect(plan.some((s) => s.layer === 'backlink')).toBe(true)
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

  it('sanitizes HTML 503 bodies so the planner tape stays one line', () => {
    const html = `<html><head><title>503 Service Temporarily Unavailable</title></head><body><center><h1>503 Service Temporarily Unavailable</h1></center></body></html>`
    expect(sanitizeMcpError(503, html)).toBe('Ubersuggest MCP 503 (temporarily unavailable)')
    expect(sanitizeMcpError(502, '<html>bad gateway</html>')).toBe('Ubersuggest MCP 502 (upstream error)')
    expect(isTransientMcpFailure(new Error(sanitizeMcpError(503, html)))).toBe(true)
    expect(isTransientMcpFailure(new Error('timeout'))).toBe(false)
  })

  it('retries a 503 once then throws a clean error (no HTML dump)', async () => {
    const html = '<html><head><title>503 Service Temporarily Unavailable</title></head></html>'
    const prev = global.fetch
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => html })
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null }, text: async () => html }) as unknown as typeof fetch
    try {
      await expect(ubersuggestRpc({ accessToken: 'tok', mcpUrl: 'https://ubersuggest-mcp.neilpatelapi.com/mcp' }, 'initialize'))
        .rejects.toThrow('Ubersuggest MCP 503 (temporarily unavailable)')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    } finally {
      global.fetch = prev
    }
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
