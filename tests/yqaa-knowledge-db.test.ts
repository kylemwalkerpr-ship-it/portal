import {
  explicitYqaaJurisdiction,
  searchYqaaKnowledgeIndex,
  yqaaOriginSite,
} from '@/lib/yqaaKnowledgeDb'

describe('YQAA indexed knowledge retrieval', () => {
  test('maps YouSafe hosts to the canonical KB site', () => {
    expect(yqaaOriginSite('yousafeconsultancy.com')).toBe('main')
    expect(yqaaOriginSite('legal.yousafeconsultancy.com')).toBe('caseworks')
    expect(yqaaOriginSite('market.yousafeconsultancy.com')).toBe('market')
    expect(yqaaOriginSite('portal.yousafeconsultancy.com')).toBe('portal')
    expect(yqaaOriginSite('support.yousafeconsultancy.com')).toBe('support')
  })

  test('explicit destination jurisdiction outranks host affinity', () => {
    expect(explicitYqaaJurisdiction('I am on the US site but want to study in Australia')).toBe('Australia')
    expect(explicitYqaaJurisdiction('What does IRCC require for a study permit?')).toBe('Canada')
    expect(explicitYqaaJurisdiction('Explain UKVI Student Route basics')).toBe('United Kingdom')
    expect(explicitYqaaJurisdiction('What is an F-1 visa?')).toBe('United States')
  })

  test('queries the server-side index and preserves provenance', async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          chunk_key: 'chunk-1',
          source_key: 'source-1',
          site: 'caseworks',
          repository: 'kylemwalkerpr-ship-it/caseworks',
          source_url: 'https://legal.yousafeconsultancy.com/us/security-deposit-basics/',
          title: 'Security deposit basics',
          section_title: 'General overview',
          jurisdiction: 'United States',
          body: 'Security deposits are generally governed by state and local law.',
          topic_tags: ['housing', 'legal'],
          fetched_at: new Date().toISOString(),
          lastmod: null,
          authority_tier: 4,
          score: 8.5,
        },
      ],
      error: null,
    })
    const db = { rpc }

    const result = await searchYqaaKnowledgeIndex(db, {
      query: 'general security deposit rules',
      hostname: 'legal.yousafeconsultancy.com',
      limit: 12,
    })

    expect(rpc).toHaveBeenCalledWith('search_yqaa_knowledge', {
      p_query: 'general security deposit rules',
      p_origin_site: 'caseworks',
      p_jurisdiction: null,
      p_limit: 12,
    })
    expect(result.source).toBe('database')
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]).toMatchObject({
      site: 'caseworks',
      sourceUrl: 'https://legal.yousafeconsultancy.com/us/security-deposit-basics/',
      repository: 'kylemwalkerpr-ship-it/caseworks',
      authorityTier: 4,
    })
    expect(result.retrievalConfidence).toBeGreaterThan(0.5)
  })

  test('passes an explicit jurisdiction to the RPC even on another regional host', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null })
    await searchYqaaKnowledgeIndex({ rpc }, {
      query: 'I am reading the USA site but what are the Australia subclass 500 requirements?',
      hostname: 'usa.yousafeconsultancy.com',
      limit: 8,
    })
    expect(rpc).toHaveBeenCalledWith('search_yqaa_knowledge', {
      p_query: 'I am reading the USA site but what are the Australia subclass 500 requirements?',
      p_origin_site: 'usa',
      p_jurisdiction: 'Australia',
      p_limit: 8,
    })
  })
})
