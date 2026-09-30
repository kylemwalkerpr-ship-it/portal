import fs from 'fs'
import path from 'path'

describe('YQAA public web research', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('@/lib/superGrokAssistant') })

  test('Australia on a USA host restricts xAI search and accepts only Australia official citations', async () => {
    const callSystemSuperGrokWebSearch = jest.fn(async (_question: string, _domains?: string[]) => ({
      text: 'Australia student visa requirements are published by Home Affairs.[[1]](https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500) Other-country claim.[[2]](https://www.uscis.gov/working-in-the-united-states)',
      citations: ['https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', 'https://www.uscis.gov/working-in-the-united-states'],
      webSearchCalls: 1,
    }))
    jest.doMock('@/lib/superGrokAssistant', () => ({ callSystemSuperGrokWebSearch }))
    const { researchYqaaPublicWeb } = await import('@/lib/yqaaWebResearch')
    const evidence = await researchYqaaPublicWeb('What are Australia subclass 500 requirements? jane@example.com', 'usa.yousafeconsultancy.com')
    expect(callSystemSuperGrokWebSearch.mock.calls[0][1]).toContain('gov.au')
    expect(callSystemSuperGrokWebSearch.mock.calls[0][1]).not.toContain('uscis.gov')
    expect(callSystemSuperGrokWebSearch.mock.calls[0][0]).not.toContain('jane@example.com')
    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ jurisdiction: 'Australia', sourceKey: 'xai:web_search' })
    expect(evidence[0].sourceUrl).toContain('immi.homeaffairs.gov.au')
  })

  test('uncited summaries do not become evidence', async () => {
    jest.doMock('@/lib/superGrokAssistant', () => ({ callSystemSuperGrokWebSearch: async () => ({
      text: 'A plausible uncited answer.', citations: [], webSearchCalls: 1,
    }) }))
    const { researchYqaaPublicWeb } = await import('@/lib/yqaaWebResearch')
    expect(await researchYqaaPublicWeb('What are current visa rules in Canada?')).toEqual([])
  })
})

describe('source-controlled YQAA ranking', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260930180000_yqaa_intent_ranking.sql'), 'utf8')
  test('support/help intent boosts Support while support letter does not', () => {
    expect(sql).toContain('support_intent')
    expect(sql).toContain("c.site = 'support' then 5.0")
    expect(sql).toMatch(/support\[\[:space:\]\]\+\(letter\|document\|evidence\)/)
  })
  test('service discovery boosts Market and legal overviews retain Caseworks authority', () => {
    expect(sql).toContain("c.site = 'market' then 3.5")
    expect(sql).toContain("c.site = 'caseworks' then 2.5")
  })
  test('explicit jurisdiction outranks site affinity and penalizes wrong-country chunks', () => {
    expect(sql).toContain('then 5.0')
    expect(sql).toContain('then 7.0 else 0')
    expect(sql).toContain('c.site = q0.origin_site then 0.55')
  })
})
