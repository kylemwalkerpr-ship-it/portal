import { NextRequest } from 'next/server'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const mockRequireAdminUser = jest.fn()
const mockLoadFactoryOpportunities = jest.fn()
const mockPickAutoRunCandidates = jest.fn()
const mockLoadRecentPrimaryKeywords = jest.fn()
const mockRunSeoFactoryPipeline = jest.fn()
const mockResolveOwner = jest.fn()
const mockAssembleMasterEngineFeed = jest.fn()

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdminUser(...args),
}))
jest.mock('@/lib/seoFactory/opportunities', () => ({
  loadFactoryOpportunities: (...args: unknown[]) => mockLoadFactoryOpportunities(...args),
  pickAutoRunCandidates: (...args: unknown[]) => mockPickAutoRunCandidates(...args),
}))
jest.mock('@/lib/seoFactory/keywordPlanner', () => ({
  buildKeywordPlan: jest.fn(),
  planTermsForAutoRun: jest.fn(),
}))
jest.mock('@/lib/seoFactory/seoWarRoom', () => ({
  buildSeoWarRoom: jest.fn(),
  playToOpportunityAction: jest.fn((p: unknown) => String(p || 'expand_or_build')),
  inferContentType: jest.fn(() => 'legal_guide'),
}))
jest.mock('@/lib/seoFactory/pipeline', () => ({
  loadRecentPrimaryKeywords: (...args: unknown[]) => mockLoadRecentPrimaryKeywords(...args),
  runSeoFactoryPipeline: (...args: unknown[]) => mockRunSeoFactoryPipeline(...args),
}))
jest.mock('@/lib/seoFactory/masterEngineFeed', () => ({
  assembleMasterEngineFeed: (...args: unknown[]) => mockAssembleMasterEngineFeed(...args),
}))
jest.mock('@/lib/seoFactory/ownership', () => {
  const actual = jest.requireActual('@/lib/seoFactory/ownership')
  return {
    ...actual,
    resolveOwner: (...args: unknown[]) => mockResolveOwner(...args),
  }
})

const OWNER_URL = 'https://legal.yousafeconsultancy.com/guide/authority-route-test/'

function ownerPlan(status: 'confirmed' | 'proposed'): OwnerPlan {
  return {
    matched: {
      id: status === 'confirmed' ? 7001 : 7002,
      primary_keyword: 'authority route test',
      intent_class: 'procedural',
      owner_host: 'legal',
      owner_url: OWNER_URL,
      supporting_urls: [],
      action: 'expand',
      market_destination: null,
      status,
      notes: 'hermetic P3 route fixture',
    },
    matchScore: 100,
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/guide/authority-route-test/page.tsx',
    canonicalUrl: OWNER_URL,
    indexable: true,
    action: 'expand',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: false,
    routingSource: 'registry_owner_url',
  }
}

const PIPELINE_RESULT = {
  ok: true,
  content: 'draft body',
  plan: ownerPlan('confirmed'),
  audit: { score: 90, grade: 'A', wordCount: 1200, blockers: [], warnings: [] },
  ship: null,
  shipError: null,
  shipMode: 'none',
  provider: 'test-provider',
  model: 'test-model',
  attempts: 1,
  gsc: { source: 'snapshot', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'authority-route-job',
}

function request(path: 'auto-run' | 'auto-run-stream'): NextRequest {
  return new NextRequest(`http://localhost/api/seo-factory/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: 1,
      terms: ['authority route test'],
      useWarRoom: false,
      useKeywordPlan: false,
      skipRecent: false,
      shipMode: 'none',
      dryRun: true,
      masterEngineBlock: 'CALLER BLOCK',
    }),
  })
}

beforeEach(() => {
  mockRequireAdminUser.mockReset().mockResolvedValue({ profileId: 'admin-user-1' })
  mockLoadFactoryOpportunities.mockReset().mockResolvedValue({
    source: 'snapshot',
    siteUrl: 'sc-domain:yousafeconsultancy.com',
    opportunities: [],
  })
  mockPickAutoRunCandidates.mockReset().mockReturnValue([])
  mockLoadRecentPrimaryKeywords.mockReset().mockResolvedValue(new Set())
  mockRunSeoFactoryPipeline.mockReset().mockResolvedValue(PIPELINE_RESULT)
  mockResolveOwner.mockReset()
  mockAssembleMasterEngineFeed.mockReset().mockResolvedValue({ ok: true, promptBlock: '', sources: [] })
})

describe('P3 auto-run authority filter', () => {
  it('non-stream removes a proposed registry owner before pipeline execution', async () => {
    mockResolveOwner.mockResolvedValue(ownerPlan('proposed'))
    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    const res = await POST(request('auto-run'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockRunSeoFactoryPipeline).not.toHaveBeenCalled()
    expect(body.results).toEqual([])
    expect(String(body.message || '')).toMatch(/no eligible opportunities/i)
  })

  it('non-stream preserves a confirmed registry owner', async () => {
    mockResolveOwner.mockResolvedValue(ownerPlan('confirmed'))
    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    const res = await POST(request('auto-run'))

    expect(res.status).toBe(200)
    expect(mockRunSeoFactoryPipeline).toHaveBeenCalledTimes(1)
  })

  it('stream removes a proposed registry owner before pipeline execution', async () => {
    mockResolveOwner.mockResolvedValue(ownerPlan('proposed'))
    const { POST } = await import('@/app/api/seo-factory/auto-run-stream/route')
    const res = await POST(request('auto-run-stream'))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(mockRunSeoFactoryPipeline).not.toHaveBeenCalled()
    expect(text).toContain('"candidateCount":0')
    expect(text).toContain('"shipped":0')
    expect(text).toContain('data: [DONE]')
  })

  it('stream preserves a confirmed registry owner', async () => {
    mockResolveOwner.mockResolvedValue(ownerPlan('confirmed'))
    const { POST } = await import('@/app/api/seo-factory/auto-run-stream/route')
    const res = await POST(request('auto-run-stream'))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(mockRunSeoFactoryPipeline).toHaveBeenCalledTimes(1)
    expect(text).toContain('"candidateCount":1')
    expect(text).toContain('data: [DONE]')
  })
})
