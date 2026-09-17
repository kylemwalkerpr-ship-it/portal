/**
 * H2 — GET/POST /api/content-studio/opportunities/score is QUALIFIED-ONLY.
 *
 * The route turns persisted GSC rows into ACTIONABLE opportunities. Real but
 * off-mission demand (campus housing / dining / parking process queries with no
 * immigration-document or tenancy-legal anchor) stays observable — it is
 * measured by the /api/content-studio/gsc/performance visibility summary — but
 * it must never be scored or classified into an opportunity action.
 *
 * Both entry points are locked here: the GET path that reads seo_gsc_rows and
 * the POST path that scores caller-supplied rows.
 */
import { GET, POST } from '@/app/api/content-studio/opportunities/score/route'
import { requireAdminUser } from '@/lib/portalAuth'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({ requireAdminUser: jest.fn() }))

const mockRequireAdminUser = requireAdminUser as jest.Mock

type FakeRow = Record<string, unknown>

const JUNK_ROW: FakeRow = {
  query: '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
  page: 'https://example.com/pdf',
  clicks: 0,
  impressions: 2000,
  ctr: 0,
  position: 3,
}

/** Real demand outside the mission — observable, never actionable. */
const OFF_MISSION_ROWS: FakeRow[] = [
  {
    query: 'student housing application',
    page: 'https://example.com/housing-application',
    clicks: 0,
    impressions: 900,
    ctr: 0,
    position: 8,
  },
  {
    query: 'university dorm move in checklist',
    page: 'https://example.com/dorm-checklist',
    clicks: 0,
    impressions: 400,
    ctr: 0,
    position: 12,
  },
  {
    query: 'parking permit application',
    page: 'https://example.com/parking',
    clicks: 0,
    impressions: 300,
    ctr: 0,
    position: 9,
  },
  {
    query: 'meal plan status',
    page: 'https://example.com/dining',
    clicks: 0,
    impressions: 250,
    ctr: 0,
    position: 6,
  },
]

/** On-mission demand — must survive the filter untouched. */
/** On-mission but too weak to drive an action — observable as deep_tail. */
const DEEP_TAIL_ROWS: FakeRow[] = [
  {
    query: 'canada study permit biometrics ottawa',
    page: 'https://legal.yousafeconsultancy.com/ca/biometrics/',
    clicks: 0,
    impressions: 5,
    ctr: 0,
    position: 30,
  },
]

const QUALIFIED_ROWS: FakeRow[] = [
  {
    query: 'canada study permit processing time',
    page: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
    clicks: 4,
    impressions: 248,
    ctr: 0.016,
    position: 10.2,
  },
  {
    query: 'f-1 student housing proof of address',
    page: 'https://legal.yousafeconsultancy.com/us/f1-proof-of-address/',
    clicks: 2,
    impressions: 120,
    ctr: 0.016,
    position: 14,
  },
]

const MIXED_ROWS: FakeRow[] = [...OFF_MISSION_ROWS, JUNK_ROW, ...DEEP_TAIL_ROWS, ...QUALIFIED_ROWS]

const OFF_MISSION_QUERIES = OFF_MISSION_ROWS.map((r) => String(r.query))
const QUALIFIED_QUERIES = QUALIFIED_ROWS.map((r) => String(r.query))

/** seo_gsc_rows chain stub: window rows, then the latest-stored-window probe. */
function stubDb(rows: FakeRow[]) {
  let readIndex = 0
  return {
    from: () => {
      let cols = ''
      const api = {
        select: (c: string) => {
          cols = c
          return api
        },
        eq: () => api,
        order: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          const result = cols === 'start_date, end_date'
            ? { data: [], error: null }
            : { data: readIndex++ === 0 ? rows : rows, error: null }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return api
    },
  } as never
}

const request = (query = '') =>
  ({ nextUrl: new URL(`http://localhost/api/content-studio/opportunities/score${query}`) }) as never

const postRequest = (body: Record<string, unknown>) =>
  ({
    json: async () => body,
    nextUrl: new URL('http://localhost/api/content-studio/opportunities/score?days=90&limit=50'),
  }) as never

const queriesOf = (body: Record<string, any>) =>
  (body.opportunities as Array<{ query: string }>).map((o) => o.query)

beforeEach(() => {
  mockRequireAdminUser.mockReset()
})

describe('GET /api/content-studio/opportunities/score — off-mission exclusion', () => {
  it('never scores or classifies off-mission rows into actionable opportunities', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: stubDb(MIXED_ROWS) })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    const queries = queriesOf(body)
    expect(queries).toEqual(QUALIFIED_QUERIES)
    for (const offMission of OFF_MISSION_QUERIES) {
      expect(queries).not.toContain(offMission)
      expect(JSON.stringify(body.opportunities)).not.toContain(offMission)
    }
    expect(JSON.stringify(body.opportunities)).not.toContain('pacific.edu')
    expect(body.count).toBe(QUALIFIED_QUERIES.length)
    // Observable in the response, never actioned. (Malformed junk is already
    // dropped at the read boundary, so the counter only sees the real demand
    // that the action boundary refuses.)
    expect(body.excludedNonActionable).toBe(OFF_MISSION_ROWS.length + DEEP_TAIL_ROWS.length)
  })

  it('retains qualified demand and keeps the response contract', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: stubDb(QUALIFIED_ROWS) })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(body.usedFallback).toBe(false)
    expect(queriesOf(body)).toEqual(QUALIFIED_QUERIES)
    expect(body.weights).toBeDefined()
    expect(body.range.startDate).toBeDefined()
    expect(body.range.endDate).toBeDefined()
  })

  it('returns zero opportunities for an off-mission-only window instead of inventing actions', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: stubDb(OFF_MISSION_ROWS) })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(body.opportunities).toEqual([])
    expect(body.count).toBe(0)
    expect(body.excludedNonActionable).toBe(OFF_MISSION_ROWS.length)
  })
})

describe('POST /api/content-studio/opportunities/score — off-mission exclusion', () => {
  it('filters off-mission rows out of caller-supplied rows', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...OFF_MISSION_ROWS, ...DEEP_TAIL_ROWS, ...QUALIFIED_ROWS].map((r) => ({
          query: r.query,
          page: r.page,
          impressions: r.impressions,
          clicks: r.clicks,
          ctr: r.ctr,
          position: r.position,
        })),
      }),
    )
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(queriesOf(body)).toEqual(QUALIFIED_QUERIES)
    expect(body.excludedNonActionable).toBe(OFF_MISSION_ROWS.length + DEEP_TAIL_ROWS.length)
  })

  it('delegates to the same qualified-only GET read when no rows are supplied', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: stubDb(MIXED_ROWS) })
    const res = await POST(postRequest({ weights: { demand: 0.5 } }))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(queriesOf(body)).toEqual(QUALIFIED_QUERIES)
  })
})
