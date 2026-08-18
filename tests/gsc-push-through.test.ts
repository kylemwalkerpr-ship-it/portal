/**
 * GSC push-through — Phase A: classify junk vs eligible vs deep-tail and stop
 * the PDF-quoted-query leak before it reaches the opportunity radar.
 *
 * Locks the 2026-08-18 snapshot facts: quoted Pacific meal-plan PDF queries are
 * junk; Bristol / lease-break rows are strike-distance plays, never content
 * gaps. No live GSC calls in CI — rows are injected.
 */
import { isJunkQuery, classifyGscQuery } from '@/lib/seoFactory/queryNoise'
import { scoreOpportunities, GSC_STRIKE_SEEDS_2026_08 } from '@/lib/seoFactory/opportunityEngine'
import { loadFactoryOpportunities } from '@/lib/seoFactory/opportunities'
import { getGscAccess } from '@/lib/gscAuth'

jest.mock('@/lib/gscAuth', () => ({
  getGscAccess: jest.fn(),
}))

const mockAccess = getGscAccess as jest.Mock
const realFetch = global.fetch

// The exact quoted Pacific PDF query from the locked diagnosis (§1 / §4).
const PDF_JUNK = '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983'

afterEach(() => {
  global.fetch = realFetch
  jest.clearAllMocks()
})

describe('classifyGscQuery — locked snapshot cases', () => {
  const junkCases: Array<[string, { impressions: number; position: number; clicks: number }]> = [
    [PDF_JUNK, { impressions: 40, clicks: 0, position: 9 }],
    ['"user2983" "stockton room and meal plan rates"', { impressions: 30, clicks: 0, position: 12 }],
    ['"2026-2027 stockton room and meal plan rates" "iamhome@pacific.edu"', { impressions: 25, clicks: 0, position: 8 }],
    ['sites/default/files/users/user2983', { impressions: 18, clicks: 0, position: 4 }],
    ['"stockton room and meal plan rates final" pacific', { impressions: 22, clicks: 0, position: 6 }],
    ['"issued by yale university" weekly new haven', { impressions: 15, clicks: 0, position: 5 }],
    ['pacific.edu/sites/default/files/rates.pdf', { impressions: 11, clicks: 0, position: 3 }],
  ]

  it.each(junkCases)('flags %s as junk even at top positions', (term, row) => {
    expect(isJunkQuery(term)).toBe(true)
    expect(classifyGscQuery(term, row)).toBe('junk')
  })

  const eligibleCases: Array<[string, { impressions: number; position: number; clicks: number }]> = [
    ['university of bristol international student guide', { impressions: 248, clicks: 1, position: 10.2 }],
    ['university of the pacific student housing', { impressions: 193, clicks: 1, position: 9.8 }],
    ['university of warwick international student guide', { impressions: 189, clicks: 1, position: 13.8 }],
    ['breaking a lease international student', { impressions: 76, clicks: 4, position: 10.4 }],
  ]

  it.each(eligibleCases)('keeps %s eligible', (term, row) => {
    expect(isJunkQuery(term)).toBe(false)
    expect(classifyGscQuery(term, row)).toBe('eligible')
  })

  it('classifies deep tail separately (negligible signal), eligible otherwise', () => {
    expect(classifyGscQuery('study permit biometrics appointment ottawa', { impressions: 5, clicks: 0, position: 30 })).toBe('deep_tail')
    // 12 impressions is enough to leave deep-tail even at the same position.
    expect(classifyGscQuery('study permit biometrics appointment ottawa', { impressions: 12, clicks: 0, position: 30 })).toBe('eligible')
    // Position 15 is not deep tail even with <10 impressions.
    expect(classifyGscQuery('study permit biometrics appointment ottawa', { impressions: 5, clicks: 0, position: 15 })).toBe('eligible')
  })
})

describe('opportunity play table — locked snapshot rows', () => {
  const bristol = { term: 'university of bristol international student guide', impressions: 248, clicks: 1, ctr: 0.004, position: 10.2 }

  it('Bristol-like row plays quick_win (strike-distance), never content_gap', () => {
    const result = scoreOpportunities({ queries: [bristol], limit: 10 })
    expect(result.opportunities).toHaveLength(1)
    expect(result.opportunities[0].play).toBe('quick_win')
    expect(result.opportunities[0].position).toBe(10)
  })

  it('lease-break row (clicks-proven) plays quick_win, not content_gap', () => {
    const result = scoreOpportunities({
      queries: [{ term: 'breaking a lease international student', impressions: 76, clicks: 4, ctr: 0.053, position: 10.4 }],
      limit: 10,
    })
    expect(result.opportunities[0].play).toBe('quick_win')
  })

  it('junk query never appears as an opportunity — engine drops it before scoring', () => {
    const result = scoreOpportunities({
      queries: [
        { term: PDF_JUNK, impressions: 40, clicks: 0, ctr: 0, position: 9 },
        bristol,
      ],
      limit: 10,
    })
    const topics = result.opportunities.map((o) => o.topic)
    expect(topics).not.toContain(PDF_JUNK.toLowerCase())
    expect(topics.some((t) => t.includes('bristol'))).toBe(true)
  })

  it('never content-gaps a query that already has an owner page', () => {
    const result = scoreOpportunities({
      queries: [{ term: 'uk dependent visa', impressions: 800, clicks: 40, ctr: 0.05, position: 8 }],
      coverage: [
        { title: 'UK dependent visa guide', primaryKeyword: 'uk dependent visa', url: 'https://legal.yousafeconsultancy.com/uk/dependent-visa/' },
      ],
      limit: 10,
    })
    expect(result.opportunities[0].play).not.toBe('content_gap')
    expect(result.opportunities[0].coverage.matched).toBe(true)
  })
})

describe('GSC_STRIKE_SEEDS_2026_08 — fixture classification', () => {
  it('classifies every non-apex seed as eligible and strike-distance (quick_win) at snapshot metrics', () => {
    const seeds = GSC_STRIKE_SEEDS_2026_08.filter((s) => s.path !== '/')
    expect(seeds.length).toBe(4)
    for (const seed of seeds) {
      expect(classifyGscQuery(seed.path, seed)).toBe('eligible')
      const result = scoreOpportunities({
        queries: [{ term: seed.path, impressions: seed.impressions, clicks: seed.clicks, ctr: seed.clicks / seed.impressions, position: seed.position }],
        limit: 10,
      })
      expect(result.opportunities[0].play).toBe('quick_win')
      expect(result.opportunities[0].coverage.matched).toBe(false)
    }
  })
})

describe('loadFactoryOpportunities — injected live GSC rows (no network)', () => {
  it('never surfaces the quoted Pacific PDF query; Bristol row maps to strike_distance', async () => {
    mockAccess.mockResolvedValue({ accessToken: 'tok', siteUrl: 'sc-domain:yousafeconsultancy.com' })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [
          { keys: [PDF_JUNK], impressions: 40, clicks: 0, ctr: 0, position: 9 },
          { keys: ['university of bristol international student guide'], impressions: 248, clicks: 1, ctr: 0.004, position: 10.2 },
        ],
      }),
    }) as unknown as typeof fetch

    const { source, opportunities } = await loadFactoryOpportunities(10)

    expect(source).toBe('live')
    const terms = opportunities.map((o) => o.term)
    expect(terms).not.toContain(PDF_JUNK.toLowerCase())
    const bristol = opportunities.find((o) => o.term.includes('bristol'))
    expect(bristol).toBeDefined()
    expect(bristol!.action).toBe('strike_distance')
    expect(bristol!.enginePlay).toBe('quick_win')
  })
})
