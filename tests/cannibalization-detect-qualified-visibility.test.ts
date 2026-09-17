/**
 * P1 qualified-visibility action boundary for the standalone cannibal route.
 * Raw/off-mission/deep-tail GSC rows remain measurable elsewhere but must not
 * become dashboard canonical-review / merge recommendations here.
 */
import { GET, POST } from '@/app/api/content-studio/cannibalization/detect/route'
import { requireAdminUser } from '@/lib/portalAuth'
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
jest.mock('@/lib/seoFactory/cannibalDetect', () => ({ detectCannibalization: jest.fn(() => []) }))

const mockRequireAdminUser = requireAdminUser as jest.Mock
const mockDetect = detectCannibalization as jest.Mock

const OFF_MISSION = { query: 'university of the pacific housing', page: 'https://example.com/housing', impressions: 900, clicks: 3, position: 8 }
const DEEP_TAIL = { query: 'canada study permit biometrics ottawa', page: 'https://example.com/biometrics', impressions: 5, clicks: 0, position: 30 }
const QUALIFIED = { query: 'canada study permit processing time', page: 'https://example.com/study-permit', impressions: 248, clicks: 4, position: 10.2 }

function dbStub(rows: Record<string, unknown>[]) {
  return {
    from: () => {
      const api = {
        select: () => api,
        eq: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      }
      return api
    },
  } as never
}

const getRequest = () => ({ nextUrl: new URL('http://localhost/api/content-studio/cannibalization/detect?days=90') }) as never
const postRequest = (hits: Record<string, unknown>[]) => ({
  json: async () => ({ hits }),
  nextUrl: new URL('http://localhost/api/content-studio/cannibalization/detect?days=90'),
}) as never

beforeEach(() => {
  jest.clearAllMocks()
})

describe('standalone cannibal route — qualified GSC only', () => {
  it('GET excludes off-mission and deep-tail rows before detection', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: dbStub([OFF_MISSION, DEEP_TAIL, QUALIFIED]) })
    const res = await GET(getRequest())
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockDetect).toHaveBeenCalledTimes(1)
    expect(mockDetect.mock.calls[0][0].hits).toEqual([QUALIFIED])
    expect(body.excludedNonActionable).toBe(2)
  })

  it('POST applies the same boundary to caller-supplied GSC hits', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(postRequest([OFF_MISSION, DEEP_TAIL, QUALIFIED]))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockDetect.mock.calls[0][0].hits).toEqual([QUALIFIED])
    expect(body.excludedNonActionable).toBe(2)
  })
})
