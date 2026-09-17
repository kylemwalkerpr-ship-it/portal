/**
 * P1 qualified visibility — the writer-brief route may observe the persisted
 * GSC window, but off-mission/junk rows must never feed discovery, opportunity
 * classification, or cannibal action evidence. Manual seeds remain allowed;
 * this test only constrains what first-party GSC evidence can drive.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { discoverKeywords } from '@/lib/seoFactory/keywordDiscover'
import { scoreAndClassify } from '@/lib/seoFactory/opportunityAction'
import { detectCannibalization } from '@/lib/seoFactory/cannibalDetect'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))
jest.mock('@/lib/gscAnalytics', () => ({
  resolveGscDayWindow: jest.fn(() => ({ startDate: '2026-06-01', endDate: '2026-08-29', days: 90 })),
}))
jest.mock('@/lib/seoFactory/keywordDiscover', () => ({
  discoverKeywords: jest.fn(async () => ({ candidates: [], suggestOk: true, suggestCalls: 0, suggestState: 'empty' })),
}))
jest.mock('@/lib/seoFactory/keywordGrouping', () => ({ groupKeywords: jest.fn(() => []) }))
jest.mock('@/lib/seoFactory/coverageLinks', () => ({
  scoreClusterCoverage: jest.fn(),
  suggestInternalLinks: jest.fn(() => []),
}))
jest.mock('@/lib/seoFactory/opportunityAction', () => ({
  scoreAndClassify: jest.fn(() => []),
  pickOpportunityForSeed: jest.fn(() => undefined),
}))
jest.mock('@/lib/seoFactory/cannibalDetect', () => ({ detectCannibalization: jest.fn(() => []) }))
jest.mock('@/lib/seoFactory/seoBrief', () => ({
  buildSeoBrief: jest.fn(() => ({ primaryTopic: 'canada study permit processing time' })),
  formatSeoBriefForWriter: jest.fn(() => 'writer contract'),
}))

const mockRequireAdminUser = requireAdminUser as jest.Mock
const mockDiscoverKeywords = discoverKeywords as jest.Mock
const mockScoreAndClassify = scoreAndClassify as jest.Mock
const mockDetectCannibalization = detectCannibalization as jest.Mock

const OFF_MISSION = {
  query: 'student housing application',
  page: 'https://example.com/housing',
  impressions: 900,
  clicks: 10,
  ctr: 0.011,
  position: 8,
}
const JUNK = {
  query: '"2026 room rates final.pdf" pacific.edu/sites/default/files/user2983',
  page: 'https://example.com/rates.pdf',
  impressions: 1500,
  clicks: 0,
  ctr: 0,
  position: 3,
}
const DEEP_TAIL = {
  query: 'canada study permit biometrics ottawa',
  page: 'https://legal.yousafeconsultancy.com/ca/biometrics/',
  impressions: 5,
  clicks: 0,
  ctr: 0,
  position: 30,
}
const QUALIFIED = {
  query: 'canada study permit processing time',
  page: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
  impressions: 248,
  clicks: 4,
  ctr: 0.016,
  position: 10.2,
}

function dbStub() {
  return {
    from: (table: string) => {
      const api = {
        select: () => api,
        eq: () => api,
        not: () => api,
        limit: () => api,
        then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(
            table === 'seo_gsc_rows'
              ? { data: [OFF_MISSION, JUNK, DEEP_TAIL, QUALIFIED], error: null }
              : { data: [], error: null },
          ).then(resolve, reject),
      }
      return api
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: dbStub() })
})

describe('POST /api/content-studio/briefs/from-intel — qualified GSC boundary', () => {
  it('keeps junk, off-mission, and deep-tail rows out of every action-driving GSC input', async () => {
    const { POST } = await import('@/app/api/content-studio/briefs/from-intel/route')
    const request = {
      json: async () => ({ seed: 'canada study permit processing time', title: 'Study permit processing time' }),
    } as never

    const res = await POST(request)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const discoveryArg = mockDiscoverKeywords.mock.calls[0][0]
    expect(discoveryArg.gscQueries).toEqual([QUALIFIED.query])

    const classifiedRows = mockScoreAndClassify.mock.calls[0][0] as Array<{ query: string }>
    expect(classifiedRows.map((row) => row.query)).toEqual([QUALIFIED.query])

    const cannibalArg = mockDetectCannibalization.mock.calls[0][0]
    expect(cannibalArg.hits.map((row: { query: string }) => row.query)).toEqual([QUALIFIED.query])
  })
})
