/**
 * LLM quality lane in the Master Engine feed — fail-closed by default.
 *
 * `assembleMasterEngineFeed` feeds the writer prompt. The three paid LLM
 * judgment lanes (scoreContentQuality / scoreEeatTrust / scoreSemanticNlp)
 * are wired in but gated behind CONTENT_AI_LLM_QUALITY=1 so production never
 * spends extra Entrim tokens by default. These tests prove the default stays
 * unused: no call, `llmQuality: null`, prompt untouched — and that flipping
 * the flag + passing content does run all three and folds their scores in.
 */
import {
  assembleMasterEngineFeed,
  renderLlmQualityBlock,
} from '@/lib/seoFactory/masterEngineFeed'

jest.mock('@/lib/supabase', () => {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [] }),
    eq: () => chain,
    in: () => chain,
    single: () => Promise.resolve({ data: null }),
  }
  return { createSupabaseAdminClient: () => ({ from: () => chain }) }
})
jest.mock('@/lib/seoFactory/siteHealthSnapshot', () => ({
  attachSiteHealthFacts: (input: unknown) => Promise.resolve(input),
}))
jest.mock('@/lib/seoEngine/llmVisibility', () => ({
  loadLlmVisibilityEvidence: () => Promise.resolve(null),
}))
jest.mock('@/lib/seoEngine/ahrefsAudit', () => ({
  loadLatestAhrefsSnapshot: () => Promise.resolve(null),
}))
jest.mock('@/lib/gscAnalytics', () => ({
  fetchSiteSearchAnalytics: () =>
    Promise.resolve({ configured: false, topQueries: [], topPages: [], warnings: [] }),
}))
jest.mock('@/lib/seoDataLoaders', () => ({
  loadGscSnapshot: () => Promise.resolve({ topQueries: [], topPages: [], opportunities: {} }),
}))
jest.mock('@/lib/seoFactory/outcomeHistory', () => ({
  buildOutcomeHistoryFromLiveGsc: () => Promise.resolve({ history: [] }),
}))

jest.mock('@/lib/seoFactory/contentQuality', () => ({
  contentQualityComposite: () => 0.72,
  buildContentLane1: () => ({
    targetWordCount: null,
    medianCompetitorWordCount: null,
    detectedIntent: null,
    competingInternalUrls: [],
  }),
  scoreContentQuality: jest.fn(async () => ({
    page_url: 'https://legal.yousafeconsultancy.com/us/f1/',
    subsystem: 'content_quality',
    model_used: 'mock:content_quality',
    scored_at: '2026-09-03T00:00:00.000Z',
    variables: [],
    content_gap_summary: { missing_subtopics: [], top_competitor_url: null, top_competitor_depth_score: null },
    flags: ['mock_flag'],
  })),
}))

jest.mock('@/lib/seoFactory/eeatTrust', () => ({
  eeatTrustComposite: () => 0.81,
  buildEeatLane1: () => ({ ymyl: true }),
  scoreEeatTrust: jest.fn(async () => ({
    page_url: 'https://legal.yousafeconsultancy.com/us/f1/',
    subsystem: 'eeat_trust',
    model_used: 'mock:eeat_trust',
    scored_at: '2026-09-03T00:00:00.000Z',
    variables: [],
    trust_gap_summary: { missing_signals: [], top_competitor_url: null, top_competitor_trust_score: null },
    flags: [],
  })),
}))

jest.mock('@/lib/seoFactory/semanticNlp', () => ({
  semanticNlpComposite: () => 0.64,
  buildSemanticLane1: () => ({ embeddings: {}, questionIntent: true }),
  scoreSemanticNlp: jest.fn(async () => ({
    page_url: 'https://legal.yousafeconsultancy.com/us/f1/',
    subsystem: 'semantic_nlp',
    model_used: 'mock:semantic_nlp',
    scored_at: '2026-09-03T00:00:00.000Z',
    variables: [],
    entity_gap_summary: { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null },
    flags: [],
  })),
}))

const contentQualityMock = jest.requireMock('@/lib/seoFactory/contentQuality')
const eeatTrustMock = jest.requireMock('@/lib/seoFactory/eeatTrust')
const semanticNlpMock = jest.requireMock('@/lib/seoFactory/semanticNlp')

const BASE_REQ = {
  topic: 'f1 visa requirements',
  primaryKeyword: 'f1 visa',
  region: 'US',
  contentType: 'legal_guide',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/f1/',
}
const DRAFT = `# F-1 visa requirements

## In 60 seconds
- Confirm the category that matches your study level
- Gather the I-20 and DS-160 receipt before you file

## Eligibility

${Array.from({ length: 200 }, (_, i) => `Eligibility detail ${i} explains the current rule.`).join(' ')}

This guide is educational only, not legal advice.
`

beforeEach(() => {
  delete process.env.CONTENT_AI_LLM_QUALITY
  ;(contentQualityMock.scoreContentQuality as jest.Mock).mockClear()
  ;(eeatTrustMock.scoreEeatTrust as jest.Mock).mockClear()
  ;(semanticNlpMock.scoreSemanticNlp as jest.Mock).mockClear()
})

describe('assembleMasterEngineFeed — LLM quality lane, default OFF', () => {
  it('does not run any LLM scorer and reports llmQuality: null by default, even with content supplied', async () => {
    const feed = await assembleMasterEngineFeed({ ...BASE_REQ, content: DRAFT })
    expect(feed.ok).toBe(true)
    expect(feed.llmQuality).toBeNull()
    expect(contentQualityMock.scoreContentQuality).not.toHaveBeenCalled()
    expect(eeatTrustMock.scoreEeatTrust).not.toHaveBeenCalled()
    expect(semanticNlpMock.scoreSemanticNlp).not.toHaveBeenCalled()
    // The default prompt block carries no LLM-quality lane line.
    expect(feed.promptBlock).not.toContain('LLM quality lane')
  })

  it('stays fail-closed for any non-"1" value (0, empty, garbage)', async () => {
    for (const v of ['0', '', 'false', 'yes']) {
      process.env.CONTENT_AI_LLM_QUALITY = v
      const feed = await assembleMasterEngineFeed({ ...BASE_REQ, content: DRAFT })
      expect(feed.llmQuality).toBeNull()
      expect(contentQualityMock.scoreContentQuality).not.toHaveBeenCalled()
      expect(eeatTrustMock.scoreEeatTrust).not.toHaveBeenCalled()
      expect(semanticNlpMock.scoreSemanticNlp).not.toHaveBeenCalled()
    }
  })

  it('does not run without content even when the flag is on (nothing to judge)', async () => {
    process.env.CONTENT_AI_LLM_QUALITY = '1'
    const feed = await assembleMasterEngineFeed({ ...BASE_REQ })
    expect(feed.llmQuality).toBeNull()
    expect(contentQualityMock.scoreContentQuality).not.toHaveBeenCalled()
    expect(eeatTrustMock.scoreEeatTrust).not.toHaveBeenCalled()
    expect(semanticNlpMock.scoreSemanticNlp).not.toHaveBeenCalled()
  })
})

describe('assembleMasterEngineFeed — LLM quality lane, CONTENT_AI_LLM_QUALITY=1', () => {
  it('runs all three scorers, reports their results, and folds a block into the prompt', async () => {
    process.env.CONTENT_AI_LLM_QUALITY = '1'
    const feed = await assembleMasterEngineFeed({ ...BASE_REQ, content: DRAFT })
    expect(feed.ok).toBe(true)
    expect(feed.llmQuality).not.toBeNull()
    expect(feed.llmQuality!.enabled).toBe(true)
    expect(feed.llmQuality!.contentQuality!.model_used).toBe('mock:content_quality')
    expect(feed.llmQuality!.eeatTrust!.model_used).toBe('mock:eeat_trust')
    expect(feed.llmQuality!.semanticNlp!.model_used).toBe('mock:semantic_nlp')
    expect(contentQualityMock.scoreContentQuality).toHaveBeenCalledTimes(1)
    expect(eeatTrustMock.scoreEeatTrust).toHaveBeenCalledTimes(1)
    expect(semanticNlpMock.scoreSemanticNlp).toHaveBeenCalledTimes(1)
    // The writer prompt now names the lane and its composites.
    expect(feed.promptBlock).toContain('LLM quality lane (CONTENT_AI_LLM_QUALITY=1)')
    expect(feed.promptBlock).toContain('content-quality 72/100')
    expect(feed.promptBlock).toContain('E-E-A-T trust 81/100')
    // Lineage stays truthful — the actual provider:model per lane.
    expect(feed.lineage.llmQuality).toEqual({
      enabled: true,
      contentQuality: 'mock:content_quality',
      eeatTrust: 'mock:eeat_trust',
      semanticNlp: 'mock:semantic_nlp',
    })
  })
})

describe('renderLlmQualityBlock — pure renderer', () => {
  it('renders scores and flags from any lane result', () => {
    const block = renderLlmQualityBlock({
      enabled: true,
      contentQuality: {
        page_url: 'x',
        subsystem: 'content_quality',
        model_used: 'm:1',
        scored_at: '',
        variables: [],
        content_gap_summary: { missing_subtopics: [], top_competitor_url: null, top_competitor_depth_score: null },
        flags: ['thin_content_risk'],
      },
      eeatTrust: {
        page_url: 'x',
        subsystem: 'eeat_trust',
        model_used: 'm:2',
        scored_at: '',
        variables: [],
        trust_gap_summary: { missing_signals: [], top_competitor_url: null, top_competitor_trust_score: null },
        flags: [],
      },
      semanticNlp: null,
    })
    expect(block).toContain('content-quality 72/100')
    expect(block).toContain('E-E-A-T trust 81/100')
    expect(block).toContain('semantic/NLP —')
    expect(block).toContain('thin_content_risk')
  })
})