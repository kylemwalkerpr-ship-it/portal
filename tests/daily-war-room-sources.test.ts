/**
 * Reviewer blocker: runOneDailyWin populated evidence sources ONLY while
 * assembling the feed, so a pre-supplied masterEngineBlock bypassed evidence
 * entirely. This test drives the REAL writer function with a preexisting
 * caller block + caller sources + engine evidence and locks the merge:
 *   - caller block preserved verbatim for the writer (never trusted as evidence);
 *   - engine verified official-origin URLs merged even when a block exists;
 *   - caller sources preserved.
 */
import { runOneDailyWin } from '@/lib/seoFactory/dailyWarRoom'
import type { WarOpportunity } from '@/lib/seoFactory/seoWarRoom'
import type { PipelineResult } from '@/lib/seoFactory/pipeline'

jest.mock('@/lib/seoFactory/pipeline', () => ({
  loadRecentPrimaryKeywords: jest.fn(),
  runSeoFactoryPipeline: jest.fn(),
}))
jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({
  assembleMasterEngineFeed: jest.fn(),
}))
jest.mock('@/lib/seoFactory/seoWarRoom', () => ({
  buildSeoWarRoom: jest.fn(),
  playToOpportunityAction: jest.fn((p: unknown) => String(p || 'expand_or_build')),
}))
jest.mock('@/lib/seoFactory/estateSweep', () => ({
  selectThinPagesForExpansion: jest.fn(),
  expandThinPage: jest.fn(),
}))
jest.mock('@/lib/seoFactory/crossDomainEnrich', () => ({
  computeCrossDomainStats: jest.fn(),
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}))

const mock = {
  runPipeline: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/pipeline') as { runSeoFactoryPipeline: jest.Mock }
    return m.runSeoFactoryPipeline
  },
  recent: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/pipeline') as { loadRecentPrimaryKeywords: jest.Mock }
    return m.loadRecentPrimaryKeywords
  },
  feed: (): jest.Mock => {
    const m = jest.requireMock('@/lib/seoFactory/masterEngineFeed') as { assembleMasterEngineFeed: jest.Mock }
    return m.assembleMasterEngineFeed
  },
}

beforeEach(() => {
  mock.recent().mockReset()
  mock.recent().mockResolvedValue(new Set())
  mock.feed().mockReset()
  mock.runPipeline().mockReset()
})

const win = {
  term: 'uk visa fee increase 2026',
  play: 'build_new',
  priorityScore: 80,
  estimatedGainClicks: 12,
  region: 'UK',
  contentType: 'legal_guide',
  ownerUrl: 'https://legal.yousafeconsultancy.com/uk/visa-fee-increase-2026/',
  liveUrl: 'https://legal.yousafeconsultancy.com/uk/visa-fee-increase-2026/',
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/uk/visa-fee-increase-2026/page.tsx',
  rationale: 'Deep eligible rank, weak CTR.',
} as unknown as WarOpportunity

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
  audit: { score: 82, grade: 'B', wordCount: 2400, blockers: [], warnings: [] } as unknown as PipelineResult['audit'],
  ship: null,
  shipError: null,
  shipMode: 'merge',
  provider: 'entrim-qwen-27b',
  model: 'entrim-qwen-27b',
  attempts: 1,
  gsc: { source: 'snapshot', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'war-1',
}

describe('runOneDailyWin — evidence source handoff', () => {
  it('merges caller+engine sources and preserves the caller block even when one is pre-supplied', async () => {
    mock.feed().mockResolvedValue({
      ok: true,
      promptBlock: 'ENGINE-ASSEMBLED BLOCK',
      sources: ['https://www.gov.uk/government/news/visa-fee-increase'],
    })
    mock.runPipeline().mockResolvedValue(RESULT)
    await runOneDailyWin({
      win,
      rank: 1,
      shipMode: 'merge',
      masterEngineBlock: 'CALLER-SUPPLIED BLOCK',
      sources: ['https://user.example.com/custom-guide'],
    } as Parameters<typeof runOneDailyWin>[0])
    expect(mock.runPipeline()).toHaveBeenCalledTimes(1)
    const args = mock.runPipeline().mock.calls[0][0] as Record<string, unknown>
    // Caller block preserved verbatim — not overwritten by the engine's own.
    expect(args.masterEngineBlock).toBe('CALLER-SUPPLIED BLOCK')
    // Caller sources preserved + engine verified evidence merged.
    expect(args.sources).toEqual([
      'https://user.example.com/custom-guide',
      'https://www.gov.uk/government/news/visa-fee-increase',
    ])
  })

  it('uses the engine block + engine sources when no caller block is supplied', async () => {
    mock.feed().mockResolvedValue({
      ok: true,
      promptBlock: 'ENGINE-ASSEMBLED BLOCK',
      sources: ['https://www.gov.uk/government/news/dependant-fee-rise'],
    })
    mock.runPipeline().mockResolvedValue(RESULT)
    await runOneDailyWin({ win, rank: 1, shipMode: 'merge' } as Parameters<typeof runOneDailyWin>[0])
    const args = mock.runPipeline().mock.calls[0][0] as Record<string, unknown>
    expect(args.masterEngineBlock).toBe('ENGINE-ASSEMBLED BLOCK')
    expect(args.sources).toEqual(['https://www.gov.uk/government/news/dependant-fee-rise'])
  })
})