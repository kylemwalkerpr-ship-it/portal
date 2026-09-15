const initialPlan = {
  matched: null, matchScore: 0, host: 'yousafeconsultancy.com', repo: 'yousafe-consultancy',
  filePath: 'content/blog/f-1-basics.md', canonicalUrl: 'https://yousafeconsultancy.com/blog/f-1-basics/',
  indexable: true, action: 'publish', intentClass: 'informational', contentType: 'blog',
  warnings: [], blockers: [], ymy: false, routingSource: 'standing_rules',
}
const finalPlan = {
  ...initialPlan,
  filePath: 'content/blog/custom-model-slug.md',
  canonicalUrl: 'https://yousafeconsultancy.com/blog/custom-model-slug/',
}
const mockResolveOwner = jest.fn(async (input: any) => input?.slug ? finalPlan : initialPlan)
const mockAttach = jest.fn(async (..._args: any[]) => undefined)
const mockPersist = jest.fn(async (...args: any[]) => args[1])
const mockTargetUpdates: any[] = []

jest.mock('@/lib/seoFactory/ownership', () => ({
  resolveOwner: (input: any) => mockResolveOwner(input),
  assertPlanRepoConsistency: jest.fn(),
}))

jest.mock('@/lib/seoFactory/tinyfishAdapter', () => ({
  collectTinyfishResearch: jest.fn(async (input: any) => ({
    state: 'empty', reason: 'no observations', observations: [], gaps: ['No TinyFish observations'],
    query: input.query, queriedAt: '2026-09-15T00:00:00.000Z', runId: 'tf-run', checkpointId: 'tf-checkpoint',
  })),
}))

jest.mock('@/lib/seoFactory/researchEvidenceStore', () => ({
  persistResearchEvidence: jest.fn(async () => []),
  verifyContractEvidenceRows: jest.fn(async () => undefined),
}))

jest.mock('@/lib/seoFactory/writingContractStore', () => ({
  reserveOpportunityJob: jest.fn(async () => ({
    jobId: 'job-slug', reused: false, ownsReservation: true,
    identity: { id: 'opp-slug', normalizedTopic: 'f 1 options', jurisdiction: 'us', readerIntent: 'general', action: 'new' },
  })),
  loadJobWritingContract: jest.fn(async () => null),
  nextWritingContractVersion: jest.fn(async () => 1),
  persistWritingContract: (...args: any[]) => mockPersist(...args),
  attachWritingContractToJob: (...args: any[]) => mockAttach(...args),
  releaseOpportunityReservation: jest.fn(async () => true),
}))

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(() => ({
    from: (_table: string) => {
      const chain: any = {
        update: (patch: any) => { mockTargetUpdates.push(patch); return chain },
        eq: () => chain,
        select: () => chain,
        maybeSingle: async () => ({ data: { id: 'job-slug' }, error: null }),
      }
      return chain
    },
  })),
}))

import { startSuggestBriefContract, finalizeSuggestBriefContract } from '@/lib/seoFactory/suggestBriefContract'
import { verifyWritingContract } from '@/lib/seoFactory/writingContract'

const sealedBrief = {
  thesis: 'F-1 students need a decision framework that separates status rules, timing, and evidence before choosing the next step.',
  takeaways: [
    'Students should identify the exact immigration objective before comparing any available filing path.',
    'Timing rules and documentary evidence should be checked against authoritative sources before action.',
    'A practical decision should distinguish eligibility facts from strategy choices that need individual advice.',
  ],
  lede: 'This guide gives F-1 students a structured way to compare the relevant options, timing constraints, and evidence without assuming an outcome.',
  outline: [
    { heading: 'Define the objective', purpose: 'Separate the reader goals.', bridgeFrom: '', coverTopics: ['objective'], format: 'prose' as const },
    { heading: 'Check timing', purpose: 'Explain timing checkpoints.', bridgeFrom: 'The objective determines which timing rules matter next.', coverTopics: ['timing'], format: 'prose' as const },
    { heading: 'Check evidence', purpose: 'Explain evidence checkpoints.', bridgeFrom: 'The timing analysis determines which evidence must be current.', coverTopics: ['evidence'], format: 'prose' as const },
  ],
  faqQuestions: [], unresolved: [],
}

describe('suggest-brief final slug ownership', () => {
  beforeEach(() => { mockResolveOwner.mockClear(); mockAttach.mockClear(); mockPersist.mockClear(); mockTargetUpdates.length = 0 })

  it('re-resolves a legitimate model slug before sealing and attaching the immutable contract', async () => {
    const session = await startSuggestBriefContract({
      topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US', audienceStage: 'researching',
    })
    const contract = await finalizeSuggestBriefContract({
      session, topic: 'F-1 options', primaryKeyword: 'f-1 options', contentType: 'blog', region: 'US',
      audience: 'F-1 students', audienceStage: 'researching', sealedBrief,
      requiredShortKeywords: [], requiredLongTailKeywords: [], shortKeywordTerms: [], longTailKeywordTerms: [],
      minWords: 800, targetWords: 1000, maxWords: 1300, sources: [], interlinks: [],
      title: 'F-1 Options', targetSlug: 'custom-model-slug', engineOk: true, ubersuggestTerms: [],
    })

    expect(mockResolveOwner).toHaveBeenLastCalledWith(expect.objectContaining({ slug: 'custom-model-slug' }))
    expect(contract.metadata.targetSlug).toBe('custom-model-slug')
    expect(contract.ownership.filePath).toBe(finalPlan.filePath)
    expect(contract.ownership.canonicalUrl).toBe(finalPlan.canonicalUrl)
    expect(mockTargetUpdates).toContainEqual(expect.objectContaining({
      slug: 'custom-model-slug', content_path: finalPlan.filePath, canonical_url: finalPlan.canonicalUrl,
    }))
    expect(verifyWritingContract(contract).ok).toBe(true)

    // Mirrors the production pre-authoring ownership resolution: the persisted
    // slug must resolve to the same path/canonical the contract owns.
    const draftingPlan = await mockResolveOwner({
      primaryKeyword: contract.primaryKeyword, contentType: contract.contentType,
      region: 'US', indexable: true, slug: contract.metadata.targetSlug,
    })
    expect(draftingPlan.filePath).toBe(contract.ownership.filePath)
    expect(draftingPlan.canonicalUrl).toBe(contract.ownership.canonicalUrl)
  })
})
