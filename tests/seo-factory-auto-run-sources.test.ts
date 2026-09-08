/**
 * Reviewer blocker: auto-run populated evidence sources only while assembling
 * the feed (skipped when a caller block exists) and DROPPED caller sources.
 * This drives the REAL /api/seo-factory/auto-run route with a preexisting
 * caller block + caller sources + engine evidence and locks that every
 * candidate's runSeoFactoryPipeline args receive:
 *   - caller block preserved verbatim (never trusted as evidence);
 *   - caller sources preserved AND engine verified evidence merged.
 */
import { NextRequest } from 'next/server'
import type { PipelineResult } from '@/lib/seoFactory/pipeline'

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))
jest.mock('@/lib/seoFactory/opportunities', () => ({
  loadFactoryOpportunities: jest.fn(),
  pickAutoRunCandidates: jest.fn(),
}))
jest.mock('@/lib/seoFactory/keywordPlanner', () => ({
  buildKeywordPlan: jest.fn(),
  planTermsForAutoRun: jest.fn(),
}))
jest.mock('@/lib/seoFactory/seoWarRoom', () => ({
  buildSeoWarRoom: jest.fn(),
  playToOpportunityAction: jest.fn((p: unknown) => String(p || 'expand_or_build')),
}))
jest.mock('@/lib/seoFactory/pipeline', () => ({
  loadRecentPrimaryKeywords: jest.fn(),
  runSeoFactoryPipeline: jest.fn(),
}))
jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({
  assembleMasterEngineFeed: jest.fn(),
}))
jest.mock('@/lib/seoFactory/ownership', () => ({
  resolveOwner: jest.fn(),
}))

const mock = {
  requireAdminUser: (): jest.Mock => {
    const m = jest.requireMock('@/lib/portalAuth') as { requireAdminUser: jest.Mock }
    return m.requireAdminUser
  },
  runPipeline: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/pipeline') as { runSeoFactoryPipeline: jest.Mock }
    return m.runSeoFactoryPipeline
  },
  recent: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/pipeline') as { loadRecentPrimaryKeywords: jest.Mock }
    return m.loadRecentPrimaryKeywords
  },
  opportunities: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/opportunities') as { loadFactoryOpportunities: jest.Mock }
    return m.loadFactoryOpportunities
  },
  pick: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/opportunities') as { pickAutoRunCandidates: jest.Mock }
    return m.pickAutoRunCandidates
  },
  feed: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/masterEngineFeed') as { assembleMasterEngineFeed: jest.Mock }
    return m.assembleMasterEngineFeed
  },
}

beforeEach(() => {
  mock.requireAdminUser().mockReset()
  mock.requireAdminUser().mockResolvedValue({ profileId: 'admin-user-1' })
  mock.recent().mockReset()
  mock.recent().mockResolvedValue(new Set())
  mock.opportunities().mockReset()
  mock.pick().mockReset()
  mock.feed().mockReset()
  mock.runPipeline().mockReset()
})

const OPP = {
  term: 'uk visa fee increase 2026',
  impressions: 1000,
  clicks: 5,
  ctr: 0.005,
  position: 33,
  score: 60,
  action: 'expand_or_build',
  suggestedContentType: 'legal_guide',
  region: 'UK',
  ownerHint: { host: 'legal', repo: 'caseworks', filePath: 'app/uk/page.tsx', blockers: [] },
}

const RESULT: PipelineResult = {
  ok: true,
  content: 'draft body',
  plan: {
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/uk/visa-fee-increase-2026/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/uk/visa-fee-increase-2026/',
    blockers: [],
    ymy: false,
    contentType: 'legal_guide',
  } as unknown as PipelineResult['plan'],
  audit: { score: 80, grade: 'B', wordCount: 2450, blockers: [], warnings: [] } as unknown as PipelineResult['audit'],
  ship: null,
  shipError: null,
  shipMode: 'none',
  provider: 'entrim-qwen-27b',
  model: 'entrim-qwen-27b',
  attempts: 1,
  gsc: { source: 'snapshot', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'auto-1',
}

function baseBody(over: Record<string, unknown>): Record<string, unknown> {
  return { limit: 1, useWarRoom: false, useKeywordPlan: false, shipMode: 'none', dryRun: true, ...over }
}

describe('POST /api/seo-factory/auto-run → pipeline sources handoff', () => {
  it('preserves caller block + caller sources and merges engine evidence per candidate', async () => {
    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    mock.opportunities().mockResolvedValue({
      source: 'snapshot',
      siteUrl: 'sc-domain:yousafeconsultancy.com',
      opportunities: [OPP],
    })
    mock.pick().mockImplementation((opps: unknown[]) => opps)
    mock.feed().mockResolvedValue({
      ok: true,
      promptBlock: 'ENGINE-ASSEMBLED BLOCK',
      sources: ['https://www.gov.uk/government/news/visa-fee-increase'],
    })
    mock.runPipeline().mockResolvedValue(RESULT)

    const req = new NextRequest('http://localhost/api/seo-factory/auto-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody({
        masterEngineBlock: 'CALLER-SUPPLIED BLOCK',
        sources: ['https://user.example.com/custom-guide'],
      })),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mock.runPipeline()).toHaveBeenCalledTimes(1)
    const args = mock.runPipeline().mock.calls[0][0] as Record<string, unknown>
    // Caller block preserved verbatim — the engine is not trusted to overwrite it.
    expect(args.masterEngineBlock).toBe('CALLER-SUPPLIED BLOCK')
    // Caller sources preserved + engine verified evidence merged, independently
    // of the supplied prompt block.
    expect(args.sources).toEqual([
      'https://user.example.com/custom-guide',
      'https://www.gov.uk/government/news/visa-fee-increase',
    ])
  })

  it('falls back to the engine block and still forwards caller sources when no block is supplied', async () => {
    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    mock.opportunities().mockResolvedValue({
      source: 'snapshot',
      siteUrl: 'sc-domain:yousafeconsultancy.com',
      opportunities: [OPP],
    })
    mock.pick().mockImplementation((opps: unknown[]) => opps)
    mock.feed().mockResolvedValue({
      ok: true,
      promptBlock: 'ENGINE-ASSEMBLED BLOCK',
      sources: ['https://www.gov.uk/government/news/dependant-fee-rise'],
    })
    mock.runPipeline().mockResolvedValue(RESULT)

    const req = new NextRequest('http://localhost/api/seo-factory/auto-run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(baseBody({ sources: ['https://user.example.com/fee-table'] })),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const args = mock.runPipeline().mock.calls[0][0] as Record<string, unknown>
    expect(args.masterEngineBlock).toBe('ENGINE-ASSEMBLED BLOCK')
    expect(args.sources).toEqual([
      'https://user.example.com/fee-table',
      'https://www.gov.uk/government/news/dependant-fee-rise',
    ])
  })
})