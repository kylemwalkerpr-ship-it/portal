/**
 * P5 — auto-run / auto-run-stream GSC-derived admission boundary.
 *
 * Drives the REAL route handlers. Neither route may turn an off-mission
 * campus-lifestyle term into an auto-run mission:
 *   · the non-stream Master Planner top-up (cluster plans carry no GSC row
 *     metrics, so the metric-free actionable-demand guard applies), and
 *   · the stream route's keyword-plan fill (its top-up path).
 * Qualified immigration/demand terms in the same batch still run.
 */
import { NextRequest } from 'next/server'
import { isActionableDemandQuery, isOffMissionDemandQuery } from '@/lib/seoFactory/queryNoise'

const mockRequireAdminUser = jest.fn()
const mockLoadFactoryOpportunities = jest.fn()
const mockPickAutoRunCandidates = jest.fn()
const mockLoadRecentPrimaryKeywords = jest.fn()
const mockRunSeoFactoryPipeline = jest.fn()
const mockResolveOwner = jest.fn()
const mockAssembleMasterEngineFeed = jest.fn()
const mockBuildKeywordPlan = jest.fn()
const mockPlanTermsForAutoRun = jest.fn()
const mockLoadPlansDashboard = jest.fn()
const mockBuildSeoWarRoom = jest.fn()

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: (...args: unknown[]) => mockRequireAdminUser(...args),
}))
jest.mock('@/lib/seoFactory/opportunities', () => ({
  loadFactoryOpportunities: (...args: unknown[]) => mockLoadFactoryOpportunities(...args),
  pickAutoRunCandidates: (...args: unknown[]) => mockPickAutoRunCandidates(...args),
}))
jest.mock('@/lib/seoFactory/keywordPlanner', () => ({
  buildKeywordPlan: (...args: unknown[]) => mockBuildKeywordPlan(...args),
  planTermsForAutoRun: (...args: unknown[]) => mockPlanTermsForAutoRun(...args),
}))
jest.mock('@/lib/seoFactory/seoWarRoom', () => ({
  buildSeoWarRoom: (...args: unknown[]) => mockBuildSeoWarRoom(...args),
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
  return { ...actual, resolveOwner: (...args: unknown[]) => mockResolveOwner(...args) }
})
jest.mock('@/lib/seoEngine/planner', () => ({
  loadPlansDashboard: (...args: unknown[]) => mockLoadPlansDashboard(...args),
}))

/** Real off-mission campus-lifestyle demand (NOT junk). */
const OFF_MISSION_TERM = 'arizona state university student housing'
/** Qualified on-mission demand. */
const QUALIFIED_TERM = 'uk graduate visa dependant rules'

const PIPELINE_RESULT = {
  ok: true,
  content: 'draft body',
  plan: { blockers: [], canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/x/', host: 'legal', repo: 'caseworks' },
  audit: { score: 90, grade: 'A', wordCount: 1500, blockers: [], warnings: [] },
  ship: null,
  shipError: null,
  shipMode: 'none',
  provider: 'test-provider',
  model: 'test-model',
  attempts: 1,
  gsc: { source: 'snapshot', mode: 'none', primaryKeywords: [], opportunityKeywords: [], warnings: [] },
  jobId: 'p5-job',
}

const OWNER_PLAN = {
  host: 'legal',
  repo: 'caseworks',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/p5-fixture/',
  filePath: 'app/guide/p5-fixture/page.tsx',
  action: 'expand',
  contentType: 'legal_guide',
  matchScore: 50,
  blockers: [],
  warnings: [],
  ymy: false,
  routingSource: 'standing_rules',
}

function planItem(term: string) {
  return {
    term,
    lane: 'build_new',
    priority: 1,
    region: term.includes('uk') ? 'UK' : 'US',
    contentType: 'legal_guide',
    shipHint: 'pr',
    ownerUrl: null,
    host: null,
    repo: null,
    filePath: null,
    demandScore: 100,
    authorityScore: 70,
    contentAngle: 'guide',
    writeHint: 'write it',
    rationale: 'p5 fixture',
    impressions: 100,
    position: 12,
    ctr: 0.01,
  }
}

function request(path: 'auto-run' | 'auto-run-stream', over: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/seo-factory/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      limit: 2,
      useWarRoom: false,
      useKeywordPlan: false,
      skipRecent: false,
      shipMode: 'none',
      dryRun: true,
      ...over,
    }),
  })
}

const pipelineTerms = (): string[] =>
  mockRunSeoFactoryPipeline.mock.calls.map((call) => String((call[0] as { topic?: string })?.topic || ''))

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
  mockResolveOwner.mockReset().mockResolvedValue({ ...OWNER_PLAN })
  mockAssembleMasterEngineFeed.mockReset().mockResolvedValue({ ok: true, promptBlock: 'BLOCK', sources: [] })
  mockBuildKeywordPlan.mockReset()
  mockPlanTermsForAutoRun.mockReset()
  mockLoadPlansDashboard.mockReset().mockResolvedValue({ plans: [] })
  // War room is too thin by default: its keyword-plan fill is the path under
  // test in the war-room scenario below.
  mockBuildSeoWarRoom.mockReset().mockResolvedValue({
    source: 'snapshot',
    summary: 'p5 fixture war room too thin',
    kpis: {},
    buckets: {},
    queue: [],
  })
})

describe('P5 fixtures are the real boundary case', () => {
  it('off-mission term is real demand that fails the metric-free boundary', () => {
    expect(isOffMissionDemandQuery(OFF_MISSION_TERM)).toBe(true)
    expect(isActionableDemandQuery(OFF_MISSION_TERM)).toBe(false)
    expect(isActionableDemandQuery(QUALIFIED_TERM)).toBe(true)
  })
})

describe('P5 auto-run kernel-plan admission', () => {
  it('cannot admit an off-mission cluster plan through the Master Planner top-up', async () => {
    mockLoadPlansDashboard.mockResolvedValue({
      plans: [
        {
          id: 'plan-off-mission',
          primary_term: OFF_MISSION_TERM,
          status: 'planned',
          country: 'US',
          opportunity_score: 90,
          est_monthly_impressions: 400,
          est_monthly_clicks: 0,
          ctr: 0,
          position: 8,
          rationale: 'off-mission fixture',
        },
        {
          id: 'plan-qualified',
          primary_term: QUALIFIED_TERM,
          status: 'planned',
          country: 'UK',
          opportunity_score: 80,
          est_monthly_impressions: 300,
          est_monthly_clicks: 3,
          ctr: 0.01,
          position: 14,
          rationale: 'qualified fixture',
        },
      ],
    })
    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    const res = await POST(request('auto-run', {}))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(pipelineTerms()).toEqual([QUALIFIED_TERM])
    expect(JSON.stringify(body)).not.toContain(OFF_MISSION_TERM)
  })

  it('cannot admit an off-mission plan term through the keyword-plan branch', async () => {
    mockBuildKeywordPlan.mockResolvedValue({
      source: 'snapshot',
      generatedAt: '2026-09-20T00:00:00.000Z',
      mix: { refresh: 0, expand: 0, build_new: 0, monitor: 0, defer: 0 },
      targetMix: { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      board: [],
      plan: [planItem(OFF_MISSION_TERM), planItem(QUALIFIED_TERM)],
      summary: 'p5 fixture',
      warnings: [],
    })
    mockPlanTermsForAutoRun.mockReturnValue([OFF_MISSION_TERM, QUALIFIED_TERM])

    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    const res = await POST(request('auto-run', { useKeywordPlan: true }))

    expect(res.status).toBe(200)
    expect(pipelineTerms()).toEqual([QUALIFIED_TERM])
  })

  it('cannot admit an off-mission term through the war-room keyword-plan fill', async () => {
    mockBuildKeywordPlan.mockResolvedValue({
      source: 'snapshot',
      generatedAt: '2026-09-20T00:00:00.000Z',
      mix: { refresh: 0, expand: 0, build_new: 0, monitor: 0, defer: 0 },
      targetMix: { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      board: [],
      plan: [planItem(OFF_MISSION_TERM), planItem(QUALIFIED_TERM)],
      summary: 'p5 fixture',
      warnings: [],
    })
    mockPlanTermsForAutoRun.mockReturnValue([OFF_MISSION_TERM, QUALIFIED_TERM])

    const { POST } = await import('@/app/api/seo-factory/auto-run/route')
    const res = await POST(request('auto-run', { useWarRoom: true, useKeywordPlan: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockBuildSeoWarRoom).toHaveBeenCalledTimes(1)
    expect(pipelineTerms()).toEqual([QUALIFIED_TERM])
    expect(JSON.stringify(body)).not.toContain(OFF_MISSION_TERM)
  })
})

describe('P5 auto-run-stream admission', () => {
  it('cannot admit an off-mission plan term through its keyword-plan fill', async () => {
    mockBuildKeywordPlan.mockResolvedValue({
      source: 'snapshot',
      generatedAt: '2026-09-20T00:00:00.000Z',
      mix: { refresh: 0, expand: 0, build_new: 0, monitor: 0, defer: 0 },
      targetMix: { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      board: [],
      plan: [planItem(OFF_MISSION_TERM), planItem(QUALIFIED_TERM)],
      summary: 'p5 fixture',
      warnings: [],
    })
    mockPlanTermsForAutoRun.mockReturnValue([OFF_MISSION_TERM, QUALIFIED_TERM])

    const { POST } = await import('@/app/api/seo-factory/auto-run-stream/route')
    const res = await POST(request('auto-run-stream', { useKeywordPlan: true }))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(pipelineTerms()).toEqual([QUALIFIED_TERM])
    expect(text).toContain('"candidateCount":1')
    expect(text).not.toContain(OFF_MISSION_TERM)
  })
})
