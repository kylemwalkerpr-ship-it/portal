import { parseUbersuggestKeywords } from '@/lib/seoEngine/ubersuggest'
import { pickResearchKeywords, type ResearchDemandContext } from '@/lib/seoEngine/researchDemand'

describe('Ubersuggest live payload shapes', () => {
  it('parses keyword_suggestions searched_keywords + results', () => {
    const rows = parseUbersuggestKeywords({
      searched_keywords: [{ keyword: 'uk graduate visa', volume: 2400 }],
      results: [{ keyword: 'uk student visa cost', volume: 1900 }],
    })
    expect(rows.map((r) => r.term).sort()).toEqual(['uk graduate visa', 'uk student visa cost'].sort())
    expect(rows.find((r) => r.term === 'uk graduate visa')?.volume).toBe(2400)
  })

  it('parses keyword_overview search_volume on a single object', () => {
    const rows = parseUbersuggestKeywords({
      keyword: 'uk graduate visa',
      search_volume: 2400,
      monthly_searches: [{ period: '202608', search_volume: 2900 }],
    })
    expect(rows[0].term).toBe('uk graduate visa')
    expect(rows[0].volume).toBe(2400)
  })
})

describe('Research keyword pick vs shipped canonicals', () => {
  it('rejects unrelated snapshot terms and brand/domain noise for a non-immigration topic', () => {
    const ctx: ResearchDemandContext = {
      engineTerms: ['f-1 visa', 'yousafeconsultancy.com', 'ministerial direction 111', 'bookkeeping service for llc'],
      uberTerms: ['yousafe', 'uk student visa process for warwick university', 'bookkeeping service for llc'],
      shipped: [],
      competing: { competing: [], suggestions: [] },
      blockedStems: new Set(),
    }
    const picked = pickResearchKeywords(ctx, 'How to Apply for Bookkeeping Service For Llc')
    expect(picked.longTail).toEqual(['bookkeeping service for llc'])
    expect(picked.shortTail.concat(picked.longTail)).not.toEqual(expect.arrayContaining([
      'f-1 visa',
      'yousafeconsultancy.com',
      'yousafe',
      'ministerial direction 111',
      'uk student visa process for warwick university',
    ]))
  })

  it('prefers engine and Ubersuggest terms and drops shipped primaries', () => {
    const ctx: ResearchDemandContext = {
      engineTerms: ['uk graduate visa', 'graduate route uk'],
      uberTerms: ['uk student visa cost', 'f-1 visa', 'student visa requirements'],
      shipped: [
        { url: 'https://uk.yousafeconsultancy.com/graduate-visa/', title: 'UK Graduate Visa', primaryKeyword: 'uk graduate visa', status: 'merged' },
      ],
      competing: { competing: [], suggestions: [] },
      blockedStems: new Set(['uk graduate visa']),
    }
    const picked = pickResearchKeywords(ctx, 'uk student visa')
    expect(picked.shortTail.join(' ')).not.toMatch(/uk graduate visa/)
    expect(picked.skippedCanonicals.some((t) => /graduate visa/i.test(t))).toBe(true)
    expect(picked.shortTail.concat(picked.longTail).length).toBeGreaterThan(0)
  })
})
