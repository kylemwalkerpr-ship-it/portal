import { buildOpportunityIdentity } from '@/lib/seoFactory/opportunityIdentity'
import { discoverKeywords, resetSuggestCache } from '@/lib/seoFactory/keywordDiscover'
import { pickResearchKeywords, type ResearchDemandContext } from '@/lib/seoEngine/researchDemand'
import { sealBriefFromAssembly } from '@/lib/seoFactory/sealedBrief'
import {
  defaultLoadMarketplaceIntelligence,
  marketplaceRowToSignal,
} from '@/lib/seoEngine/marketplaceDemandFeeder'
import { acceptRewriteCandidate } from '@/lib/seoFactory/rewriteAcceptance'
import { canClaimLiveSuccess, evaluateLiveArtifact } from '@/lib/seoFactory/publicationStates'

describe('Content Studio evidence contract takeover regressions', () => {
  afterEach(() => {
    resetSuggestCache()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  it('keeps reader decisions and jurisdictions distinct in opportunity identity', () => {
    const renewal = buildOpportunityIdentity({ topic: 'F-1 visa renewal' })
    const optTiming = buildOpportunityIdentity({ topic: 'F-1 OPT application timing' })
    const us485 = buildOpportunityIdentity({ topic: 'US Form I-485 adjustment of status packet' })
    const au485 = buildOpportunityIdentity({ topic: 'Australia subclass 485 Temporary Graduate visa work rights' })

    expect(renewal.id).not.toBe(optTiming.id)
    expect(renewal.readerIntent).not.toBe(optTiming.readerIntent)
    expect(us485.jurisdiction).toBe('US')
    expect(au485.jurisdiction).toBe('AU')
    expect(us485.id).not.toBe(au485.id)
  })

  it('distinguishes an empty suggestion provider from an unavailable provider', async () => {
    const emptyFetch = jest.fn(async () => ({
      ok: true,
      json: async () => ['f-1 opt', []],
    })) as unknown as typeof fetch
    const unavailableFetch = jest.fn(async () => {
      throw new Error('provider offline')
    }) as unknown as typeof fetch

    const empty = await discoverKeywords({ seed: 'f-1 opt', fetchImpl: emptyFetch, maxSuggestCalls: 1 })
    resetSuggestCache()
    const unavailable = await discoverKeywords({ seed: 'f-1 opt', fetchImpl: unavailableFetch, maxSuggestCalls: 1 })

    expect((empty as unknown as { suggestState?: string }).suggestState).toBe('empty')
    expect((unavailable as unknown as { suggestState?: string }).suggestState).toBe('unavailable')
  })

  it('keeps valid F-1, I-485, AU 485 and student-visa research demand', () => {
    const base: ResearchDemandContext = {
      engineTerms: [
        'F-1 OPT application timing',
        'Form I-485 adjustment of status documents',
        'Australia subclass 485 work rights',
        'Canada student visa proof of funds',
      ],
      uberTerms: [],
      shipped: [],
      competing: [],
      blockedStems: new Set<string>(),
    }
    const picked = pickResearchKeywords(base, 'student visa immigration application')
    const terms = [...picked.shortTail, ...picked.longTail].join(' | ').toLowerCase()

    expect(terms).toMatch(/f-?1|opt/)
    expect(terms).toMatch(/i-?485|adjustment of status/)
    expect(terms).toMatch(/485|temporary graduate|work rights/)
    expect(terms).toMatch(/canada.*student|student.*visa/)
  })

  it('does not manufacture thesis, takeaways, lede or FAQ when assembly is incomplete', () => {
    const brief = sealBriefFromAssembly({
      primaryKeyword: 'f-1 opt timing',
      contentType: 'legal_guide',
      h2Outline: ['Eligibility', 'Timing', 'Documents', 'Process'],
    })

    expect(brief.thesis).toBe('')
    expect(brief.takeaways).toEqual([])
    expect(brief.lede).toBe('')
    expect(brief.faqQuestions).toEqual([])
  })

  it('keeps Marketplace submitted-search counts separate from provider monthly volume', () => {
    const signal = marketplaceRowToSignal({
      normalized_query: 'f-1 opt help',
      search_count: 91,
      unique_sessions: 44,
      click_count: 13,
      conversion_count: 0,
      conversion_instrumented: false,
    })

    expect(signal.volume).toBeUndefined()
    expect(signal.impressions).toBe(0)
    expect(signal.marketplaceSearchCount).toBe(91)
    expect(signal.marketplaceUniqueSessions).toBe(44)
    expect(signal.marketplaceConversionCount).toBeNull()
    expect(signal.conversionCoverage).toBe('unknown')
  })

  it('does not infer current conversion instrumentation from historical conversion events', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test'

    const db = {
      from(table: string) {
        if (table === 'marketplace_search_intelligence') {
          return {
            select: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ normalized_query: 'f-1 opt help', search_count: 5, conversion_count: 0 }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'marketplace_search_events') {
          return {
            select: () => ({
              eq: async () => ({ count: 7, error: null }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    }

    const result = await defaultLoadMarketplaceIntelligence(db as never)
    expect(result.conversionInstrumented).toBe(false)
  })

  it('fails closed when rewrite audit context is absent', () => {
    const result = acceptRewriteCandidate({
      previous: '## Eligibility\nYou may qualify only if the filing remains valid.',
      next: '## Eligibility\nYou qualify.',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/audit context omitted/i)
  })

  it('does not allow a caller-supplied live phase and HTTP 200 to prove publication', () => {
    expect(canClaimLiveSuccess({ phase: 'live_verified', httpStatus: 200 })).toBe(false)
  })

  it('rejects a blank or unmarked live artifact even when HTTP and canonical checks look good', () => {
    const blank = evaluateLiveArtifact({
      httpStatus: 200,
      html: '',
      canonicalMatches: true,
      hasNoIndex: false,
    })
    expect(blank.ok).toBe(false)

    const unmarked = evaluateLiveArtifact({
      httpStatus: 200,
      html: '<article><h1>F-1 OPT timing</h1><p>Substantive article body.</p></article>',
      canonicalMatches: true,
      hasNoIndex: false,
      expectedMarker: 'revision:abc123',
      title: 'F-1 OPT timing',
    })
    expect(unmarked.ok).toBe(false)
  })
})
