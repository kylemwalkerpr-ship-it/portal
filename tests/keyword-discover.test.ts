import {
  alphabetSeeds,
  candidatesFromGscQueries,
  discoverKeywords,
  expandSeedTemplates,
  fetchGoogleSuggestions,
  mergeKeywordCandidates,
  normalizeKeyword,
  resetSuggestCache,
} from '@/lib/seoFactory/keywordDiscover'

describe('keyword discovery ($0)', () => {
  beforeEach(() => resetSuggestCache())

  it('normalizes unicode, punctuation, and duplicate whitespace', () => {
    expect(normalizeKeyword('  Canada   Study—Permit  ')).toBe('canada study permit')
    expect(normalizeKeyword('“F-1” visa')).toBe('f-1 visa')
  })

  it('expands a manual seed with templates and extra modifiers', () => {
    const out = expandSeedTemplates('canada study permit', undefined, ['for international students'])
    const norms = out.map((c) => c.normalized)
    expect(norms).toContain('canada study permit')
    expect(norms).toContain('how canada study permit')
    expect(norms).toContain('canada study permit cost')
    expect(norms).toContain('canada study permit for international students')
    expect(out.every((c) => c.source === 'manual')).toBe(true)
  })

  it('collapses duplicates across GSC, suggest, and manual with source attribution', () => {
    const gsc = candidatesFromGscQueries(['Canada study permit', 'study permit fees'], 'canada study permit')
    const merged = mergeKeywordCandidates([
      gsc,
      expandSeedTemplates('canada study permit'),
    ])
    const permit = merged.find((c) => c.normalized === 'canada study permit')
    expect(permit?.sources.sort()).toEqual(['gsc', 'manual'])
    expect(permit?.source).toBe('gsc')
    expect(merged.filter((c) => c.normalized === 'canada study permit')).toHaveLength(1)
  })

  it('merges suggestions even when the suggest endpoint fails', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const r = await discoverKeywords({
      seed: 'f-1 visa',
      gscQueries: ['f-1 visa interview'],
      fetchImpl,
      maxSuggestCalls: 1,
    })
    expect(r.candidates.some((c) => c.normalized === 'f-1 visa')).toBe(true)
    expect(r.candidates.some((c) => c.source === 'gsc' && c.normalized.includes('interview'))).toBe(true)
    expect(r.candidates.every((c) => !('volume' in c) && !('cpc' in c) && !('kd' in c))).toBe(true)
  })

  it('caches suggestion results and parses firefox-complete JSON', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response(JSON.stringify(['f-1', ['f-1 visa', 'f-1 opt']]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch
    const a = await fetchGoogleSuggestions('f-1', { fetchImpl })
    const b = await fetchGoogleSuggestions('f-1', { fetchImpl })
    expect(a).toEqual(['f-1 visa', 'f-1 opt'])
    expect(b).toEqual(a)
    expect(calls).toBe(1)
  })

  it('builds alphabet prefix seeds without baking immigration terms into the engine', () => {
    expect(alphabetSeeds('visa').slice(0, 3)).toEqual(['visa a', 'visa b', 'visa c'])
  })
})
