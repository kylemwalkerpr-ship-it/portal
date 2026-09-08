/**
 * Reviewer blocker: the master-engine feed evidence reached only the prompt
 * block, never pipeline `sources`. This test drives the ACTUAL /api/seo-factory/
 * generate route (mocking only auth + the feed + the pipeline) and locks that
 * the writer's `runSeoFactoryPipeline` args receive:
 *   - the user-supplied brief sources preserved verbatim;
 *   - the feed's verified official-origin evidence URLs appended;
 *   - the prompt block + lineage still threaded.
 * The dated/malicious allowlist filtering itself is covered at the feed
 * boundary (master-engine-feed-evidence.test.ts) — this proves the ROUTE
 * handoff, not a helper.
 */
import { NextRequest } from 'next/server'
import type { PipelineResult } from '@/lib/seoFactory/pipeline'

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(),
}))

jest.mock('@/lib/seoFactory/pipeline', () => ({
  runSeoFactoryPipeline: jest.fn(),
}))

jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({
  assembleMasterEngineFeed: jest.fn(),
}))

const mock = {
  requireAdminUser: (): jest.Mock => {
    const m = jest.requireMock('@/lib/portalAuth') as { requireAdminUser: jest.Mock }
    return m.requireAdminUser
  },
  runSeoFactoryPipeline: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/pipeline') as { runSeoFactoryPipeline: jest.Mock }
    return m.runSeoFactoryPipeline
  },
  assembleMasterEngineFeed: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/masterEngineFeed') as { assembleMasterEngineFeed: jest.Mock }
    return m.assembleMasterEngineFeed
  },
}

beforeEach(() => {
  mock.requireAdminUser().mockReset()
  mock.requireAdminUser().mockResolvedValue({ profileId: 'admin-user-1' })
  mock.runSeoFactoryPipeline().mockReset()
  mock.assembleMasterEngineFeed().mockReset()
})

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
  audit: {
    score: 80,
    grade: 'B',
    wordCount: 2450,
    blockers: [],
    warnings: [],
  } as unknown as PipelineResult['audit'],
  ship: null,
  shipError: null,
  shipMode: 'pr',
  provider: 'entrim-qwen-27b',
  model: 'entrim-qwen-27b',
  attempts: 1,
  gsc: { source: 'none', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'job-1',
}

describe('POST /api/seo-factory/generate → pipeline sources handoff', () => {
  it('forwards user sources + verified evidence URLs into runSeoFactoryPipeline args', async () => {
    const { POST } = await import('@/app/api/seo-factory/generate/route')
    mock.runSeoFactoryPipeline().mockResolvedValue(RESULT)
    mock.assembleMasterEngineFeed().mockResolvedValue({
      ok: true,
      intent: 'informational',
      composite: 61,
      grade: 'C',
      recommendationCount: 2,
      promptBlock: 'MASTER SEO ENGINE — uksd',
      gscMix: {
        windowDays: 28,
        totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        eligible: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        junk: { impressions: 0, share: 0 },
        deepTail: { impressions: 0, share: 0 },
        recommendedPlays: [],
        strikeDistance: [],
      },
      lineage: { modelVersion: 'seo-master-engine-feed-v1', ok: true },
      sources: [
        'https://www.gov.uk/government/news/visa-fee-increase',
        'https://www.gov.uk/government/news/dependant-fee-rise',
      ],
    })

    const req = new NextRequest('http://localhost/api/seo-factory/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        topic: 'uk visa fee increase 2026',
        region: 'GB',
        contentType: 'legal_guide',
        sources: ['https://user.example.com/custom-guide', 'https://user.example.com/fee-table'],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(mock.runSeoFactoryPipeline()).toHaveBeenCalledTimes(1)
    const args = mock.runSeoFactoryPipeline().mock.calls[0][0] as Record<string, unknown>
    // User brief sources preserved verbatim + verified evidence appended.
    expect(args.sources).toEqual([
      'https://user.example.com/custom-guide',
      'https://user.example.com/fee-table',
      'https://www.gov.uk/government/news/visa-fee-increase',
      'https://www.gov.uk/government/news/dependant-fee-rise',
    ])
    // Prompt block + lineage still threaded.
    expect(args.masterEngineBlock).toContain('MASTER SEO ENGINE')
    expect((args.intelligenceLineage as { masterEngine: { modelVersion: string } }).masterEngine.modelVersion).toBe('seo-master-engine-feed-v1')
  })

  it('degrades safely when the feed fails: user sources still forwarded, no evidence crash', async () => {
    const { POST } = await import('@/app/api/seo-factory/generate/route')
    mock.runSeoFactoryPipeline().mockResolvedValue(RESULT)
    mock.assembleMasterEngineFeed().mockRejectedValue(new Error('feed down'))

    const req = new NextRequest('http://localhost/api/seo-factory/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: 'uk visa fee increase 2026', region: 'GB', sources: ['https://user.example.com/a'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const args = mock.runSeoFactoryPipeline().mock.calls[0][0] as Record<string, unknown>
    expect(args.masterEngineBlock).toBeNull()
    expect(args.sources).toEqual(['https://user.example.com/a'])
  })
})