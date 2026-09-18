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

/**
 * PR #224 production proof — these exact GSC rows still surfaced as actionable
 * in /api/content-studio/opportunities/score: five real campus/lifestyle terms
 * (off-mission) and one malformed quoted Pacific fiscal-year housing-rate row
 * (junk). Both must be refused while the raw rows stay observable through the
 * GSC visibility summary.
 */
const PR224_RESIDUAL_ROWS: FakeRow[] = [
  {
    query: 'student rentals near university of south carolina',
    page: 'https://example.com/sc-rentals',
    clicks: 1,
    impressions: 320,
    ctr: 0.003,
    position: 8,
  },
  {
    query: 'student rentals near florida international university',
    page: 'https://example.com/fiu-rentals',
    clicks: 0,
    impressions: 210,
    ctr: 0,
    position: 11,
  },
  {
    query: 'student living university of south carolina',
    page: 'https://example.com/sc-living',
    clicks: 0,
    impressions: 180,
    ctr: 0,
    position: 9,
  },
  {
    query: 'international student storage cornell',
    page: 'https://example.com/cornell-storage',
    clicks: 0,
    impressions: 140,
    ctr: 0,
    position: 12,
  },
  {
    query: 'is warwick safe for international students',
    page: 'https://example.com/warwick-safety',
    clicks: 0,
    impressions: 90,
    ctr: 0,
    position: 14,
  },
  {
    query: '"fy27_stk_housing_rates" pacific',
    page: 'https://pacific.edu/sites/default/files/users/user2983',
    clicks: 0,
    impressions: 400,
    ctr: 0,
    position: 3,
  },
]

/** Same family, genuine mission/legal anchor — must keep being actioned. */
const PR224_ANCHORED_ROWS: FakeRow[] = [
  {
    query: 'f-1 student rentals near university of south carolina',
    page: 'https://legal.yousafeconsultancy.com/us/f1-student-rentals/',
    clicks: 0,
    impressions: 160,
    ctr: 0,
    position: 12,
  },
  {
    query: 'student housing discrimination rights',
    page: 'https://legal.yousafeconsultancy.com/us/housing-discrimination/',
    clicks: 0,
    impressions: 120,
    ctr: 0,
    position: 15,
  },
]

const PR224_ANCHORED_QUERIES = PR224_ANCHORED_ROWS.map((r) => String(r.query))

describe('POST /api/content-studio/opportunities/score — PR #224 production residual', () => {
  it('never scores the reported residual rows (junk or off-mission)', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...PR224_RESIDUAL_ROWS, ...PR224_ANCHORED_ROWS].map((r) => ({
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
    const opportunityQueries = queriesOf(body)
    expect(opportunityQueries.sort()).toEqual([...PR224_ANCHORED_QUERIES].sort())
    expect(body.excludedNonActionable).toBe(PR224_RESIDUAL_ROWS.length)
    for (const row of PR224_RESIDUAL_ROWS) {
      // Exact-query check: the anchored `f-1 student rentals near university of
      // south carolina` legitimately contains a residual phrase as a substring.
      expect(opportunityQueries).not.toContain(String(row.query))
    }
  })
})

describe('GET /api/content-studio/opportunities/score — PR #224 production residual', () => {
  it('drops junk at the persisted read and refuses off-mission rows at the action boundary', async () => {
    mockRequireAdminUser.mockResolvedValue({
      role: 'admin',
      profileId: 'p_admin',
      db: stubDb([...PR224_RESIDUAL_ROWS, ...PR224_ANCHORED_ROWS]),
    })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(queriesOf(body).sort()).toEqual([...PR224_ANCHORED_QUERIES].sort())
    // The malformed Pacific row is dropped by the persisted read; the five real
    // campus terms are refused (and counted) at the action boundary.
    expect(body.excludedNonActionable).toBe(5)
    expect(JSON.stringify(body.opportunities)).not.toContain('fy27_stk_housing_rates')
  })
})

/**
 * PR #224 follow-up review — the tightened boundary must not over-block.
 * Tenancy instruments are legal intent and must still reach the action
 * surface; bounded near-campus variants stay off-mission and out.
 */
const REVIEW_TENANCY_ROWS: FakeRow[] = [
  {
    query: 'student rental agreement',
    page: 'https://legal.yousafeconsultancy.com/us/student-rental-agreement/',
    clicks: 1,
    impressions: 240,
    ctr: 0.004,
    position: 9,
  },
  {
    query: 'student rent agreement',
    page: 'https://legal.yousafeconsultancy.com/us/student-rent-agreement/',
    clicks: 0,
    impressions: 180,
    ctr: 0,
    position: 12,
  },
  {
    query: 'student rental deposit',
    page: 'https://legal.yousafeconsultancy.com/us/student-rental-deposit/',
    clicks: 0,
    impressions: 160,
    ctr: 0,
    position: 11,
  },
  {
    query: 'student security deposit rights',
    page: 'https://legal.yousafeconsultancy.com/us/security-deposit-rights/',
    clicks: 2,
    impressions: 140,
    ctr: 0.014,
    position: 8,
  },
]

/**
 * PR #224 production proof — SELF-BRAND LEAK.
 *
 * The live `/api/content-studio/opportunities/score` response surfaced the
 * estate's own brand query `you safe`, even though the run-together forms
 * (`yousafe` / `yousafeconsultancy`) were already junk. Brand navigational
 * demand can never be an actionable opportunity, while ordinary prose that
 * merely contains "you safe" is real demand and must survive.
 */
const BRAND_ROWS: FakeRow[] = [
  {
    query: 'you safe',
    page: 'https://legal.yousafeconsultancy.com/',
    clicks: 0,
    impressions: 1200,
    ctr: 0,
    position: 2,
  },
  {
    query: 'you safe consultancy',
    page: 'https://legal.yousafeconsultancy.com/about/',
    clicks: 0,
    impressions: 300,
    ctr: 0,
    position: 4,
  },
]

const BRAND_PROSE_ROW: FakeRow = {
  query: 'are you safe to travel on a visa',
  page: 'https://legal.yousafeconsultancy.com/uk/travel-while-on-visa/',
  clicks: 1,
  impressions: 400,
  ctr: 0.003,
  position: 9,
}

const BRAND_PROSE_QUERY = String(BRAND_PROSE_ROW.query)

describe('POST /api/content-studio/opportunities/score — spaced self-brand leak', () => {
  it('never scores the estate brand query, but keeps prose containing "you safe"', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...BRAND_ROWS, BRAND_PROSE_ROW, ...QUALIFIED_ROWS].map((r) => ({
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
    const queries = queriesOf(body)
    for (const brand of BRAND_ROWS) {
      expect(queries).not.toContain(String(brand.query))
      expect(JSON.stringify(body.opportunities)).not.toContain('"query":"you safe"')
    }
    expect(queries).toContain(BRAND_PROSE_QUERY)
    expect(queries).toEqual([BRAND_PROSE_QUERY, ...QUALIFIED_QUERIES])
    expect(body.excludedNonActionable).toBe(BRAND_ROWS.length)
  })
})

describe('GET /api/content-studio/opportunities/score — spaced self-brand leak', () => {
  it('drops the brand rows at the persisted read and still actions real prose demand', async () => {
    mockRequireAdminUser.mockResolvedValue({
      role: 'admin',
      profileId: 'p_admin',
      db: stubDb([...BRAND_ROWS, BRAND_PROSE_ROW, ...QUALIFIED_ROWS]),
    })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    // Brand rows are junk: dropped at the persisted read before scoring, so
    // they are not even counted as non-actionable demand.
    expect(queriesOf(body)).toEqual([BRAND_PROSE_QUERY, ...QUALIFIED_QUERIES])
    expect(body.excludedNonActionable).toBe(0)
    expect(JSON.stringify(body.opportunities)).not.toContain('"query":"you safe"')
  })
})

const REVIEW_NEAR_CAMPUS_ROWS: FakeRow[] = [
  {
    query: 'student rent near university',
    page: 'https://example.com/near-campus-rent',
    clicks: 0,
    impressions: 320,
    ctr: 0,
    position: 7,
  },
  {
    query: 'rooms near university campus',
    page: 'https://example.com/near-campus-rooms',
    clicks: 0,
    impressions: 210,
    ctr: 0,
    position: 10,
  },
  {
    query: 'international student self storage',
    page: 'https://example.com/self-storage',
    clicks: 0,
    impressions: 150,
    ctr: 0,
    position: 13,
  },
]

const REVIEW_TENANCY_QUERIES = REVIEW_TENANCY_ROWS.map((r) => String(r.query))

/**
 * Final review finding — BOUNDED self-brand navigational forms.
 *
 * `you safe` / `you safe consultancy` were already junk, but `you safe login`,
 * `you safe portal` and `you safe consultancy london` still reached the score
 * action surface. The boundary must stay bounded: prose that merely starts
 * with the brand words ("you safe to travel on a student visa") is real demand.
 */
const BRAND_NAV_ROWS: FakeRow[] = [
  {
    query: 'you safe login',
    page: 'https://legal.yousafeconsultancy.com/login/',
    clicks: 0,
    impressions: 800,
    ctr: 0,
    position: 3,
  },
  {
    query: 'you safe portal',
    page: 'https://legal.yousafeconsultancy.com/portal/',
    clicks: 0,
    impressions: 200,
    ctr: 0,
    position: 5,
  },
  {
    query: 'you safe consultancy london',
    page: 'https://legal.yousafeconsultancy.com/uk/',
    clicks: 0,
    impressions: 150,
    ctr: 0,
    position: 6,
  },
]

const BRAND_NAV_PROSE_ROW: FakeRow = {
  query: 'you safe to travel on a student visa',
  page: 'https://legal.yousafeconsultancy.com/uk/travel-while-on-visa/',
  clicks: 1,
  impressions: 250,
  ctr: 0.004,
  position: 11,
}

/** `on OPT` is immigration status; `meal plan opt out` is campus dining demand. */
const OPT_STATUS_ROW: FakeRow = {
  query: 'is it safe for international students on opt',
  page: 'https://legal.yousafeconsultancy.com/us/opt/',
  clicks: 2,
  impressions: 260,
  ctr: 0.008,
  position: 8,
}

const BARE_OPT_ROW: FakeRow = {
  query: 'meal plan opt out',
  page: 'https://example.com/dining-opt-out',
  clicks: 0,
  impressions: 180,
  ctr: 0,
  position: 7,
}

const BRAND_NAV_EXPECTED_QUERIES = [
  String(BRAND_NAV_PROSE_ROW.query),
  String(OPT_STATUS_ROW.query),
  ...QUALIFIED_QUERIES,
]

describe('POST /api/content-studio/opportunities/score — self-brand navigational leak (review finding)', () => {
  it('never scores bounded self-brand navigational rows, but keeps brand-like prose and the `on opt` question', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...BRAND_NAV_ROWS, BRAND_NAV_PROSE_ROW, OPT_STATUS_ROW, BARE_OPT_ROW, ...QUALIFIED_ROWS].map((r) => ({
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
    expect(queriesOf(body)).toEqual(BRAND_NAV_EXPECTED_QUERIES)
    for (const row of BRAND_NAV_ROWS) {
      expect(JSON.stringify(body.opportunities)).not.toContain(String(row.query))
    }
    expect(JSON.stringify(body.opportunities)).not.toContain('"query":"meal plan opt out"')
    expect(body.excludedNonActionable).toBe(BRAND_NAV_ROWS.length + 1)
  })
})

describe('GET /api/content-studio/opportunities/score — self-brand navigational leak (review finding)', () => {
  it('drops self-brand navigational rows at the persisted read and still actions the `on opt` question', async () => {
    mockRequireAdminUser.mockResolvedValue({
      role: 'admin',
      profileId: 'p_admin',
      db: stubDb([...BRAND_NAV_ROWS, BRAND_NAV_PROSE_ROW, OPT_STATUS_ROW, BARE_OPT_ROW, ...QUALIFIED_ROWS]),
    })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    // Junk brand rows are dropped at the persisted read (not counted as
    // non-actionable demand); only the bare-`opt` dining row is excluded at
    // the action boundary.
    expect(queriesOf(body)).toEqual(BRAND_NAV_EXPECTED_QUERIES)
    expect(body.excludedNonActionable).toBe(1)
  })
})

/**
 * Diff review finding — the `on opt` anchor matched the ordinary verb inside
 * "opt out" / "opt-in", so campus dining/housing PROCESS rows were rescued
 * into the action surface. They are real, observable demand: off-mission, never
 * scored. The status phrase itself must keep reaching the action surface.
 */
const OPT_PROCESS_ROWS: FakeRow[] = [
  {
    query: 'meal plan information on opt out',
    page: 'https://example.com/dining-opt-out-info',
    clicks: 0,
    impressions: 320,
    ctr: 0,
    position: 6,
  },
  {
    query: 'student housing details on opt-in',
    page: 'https://example.com/housing-opt-in',
    clicks: 1,
    impressions: 140,
    ctr: 0.007,
    position: 12,
  },
]

const OPT_PROCESS_QUERIES = OPT_PROCESS_ROWS.map((r) => String(r.query))
const OPT_PROCESS_EXPECTED_QUERIES = [...QUALIFIED_QUERIES, String(OPT_STATUS_ROW.query)].sort()

describe('POST /api/content-studio/opportunities/score — opt-out/opt-in leak (diff review finding)', () => {
  it('refuses opt-out/opt-in process rows while still actioning the `on opt` status question', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...OPT_PROCESS_ROWS, OPT_STATUS_ROW, ...QUALIFIED_ROWS].map((r) => ({
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
    const queries = queriesOf(body)
    expect(queries.sort()).toEqual(OPT_PROCESS_EXPECTED_QUERIES)
    for (const query of OPT_PROCESS_QUERIES) {
      expect(queries).not.toContain(query)
      expect(JSON.stringify(body.opportunities)).not.toContain(query)
    }
    expect(body.excludedNonActionable).toBe(OPT_PROCESS_ROWS.length)
  })
})

describe('GET /api/content-studio/opportunities/score — opt-out/opt-in leak (diff review finding)', () => {
  it('drops opt-out/opt-in process rows at the persisted read and keeps the `on opt` status question', async () => {
    mockRequireAdminUser.mockResolvedValue({
      role: 'admin',
      profileId: 'p_admin',
      db: stubDb([...OPT_PROCESS_ROWS, OPT_STATUS_ROW, ...QUALIFIED_ROWS]),
    })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(queriesOf(body).sort()).toEqual(OPT_PROCESS_EXPECTED_QUERIES)
    expect(body.excludedNonActionable).toBe(OPT_PROCESS_ROWS.length)
  })
})

/**
 * Final review findings — natural-length mission-safety demand and
 * living-COST demand were action-blocked, while `student living` was treated
 * as campus lifestyle even without housing context.
 */
const REVIEW_SAFETY_ROWS: FakeRow[] = [
  {
    query: 'is it safe for international students to work in the uk',
    page: 'https://legal.yousafeconsultancy.com/uk/work-while-on-visa/',
    clicks: 3,
    impressions: 420,
    ctr: 0.007,
    position: 7,
  },
  {
    query: 'is it safe for international students to study in canada',
    page: 'https://legal.yousafeconsultancy.com/ca/study-while-on-permit/',
    clicks: 2,
    impressions: 380,
    ctr: 0.005,
    position: 8,
  },
  {
    query: 'is it safe for international students to travel while on a visa',
    page: 'https://legal.yousafeconsultancy.com/uk/travel-while-on-visa/',
    clicks: 1,
    impressions: 260,
    ctr: 0.004,
    position: 10,
  },
  {
    query: 'are you safe to travel on a student visa',
    page: 'https://legal.yousafeconsultancy.com/uk/travel-safety/',
    clicks: 1,
    impressions: 240,
    ctr: 0.004,
    position: 9,
  },
]

const REVIEW_SAFETY_QUERIES = REVIEW_SAFETY_ROWS.map((r) => String(r.query))

/** Living-COST demand is mission-relevant budgeting demand, not housing demand. */
const REVIEW_LIVING_COST_ROW: FakeRow = {
  query: 'student living expenses canada',
  page: 'https://legal.yousafeconsultancy.com/ca/living-costs/',
  clicks: 1,
  impressions: 180,
  ctr: 0.006,
  position: 11,
}

/** Same family WITH housing context — stays off-mission and out of the action surface. */
const REVIEW_STUDENT_LIVING_PLACE_ROW: FakeRow = {
  query: 'student living university of south carolina',
  page: 'https://example.com/sc-living',
  clicks: 0,
  impressions: 180,
  ctr: 0,
  position: 9,
}

const REVIEW_ACTIONABLE_QUERIES = [
  ...REVIEW_SAFETY_QUERIES,
  String(REVIEW_LIVING_COST_ROW.query),
  ...QUALIFIED_QUERIES,
]

describe('POST /api/content-studio/opportunities/score — natural-length mission safety (final review finding)', () => {
  it('scores natural-length mission-safety and living-cost rows, refusing brand nav and housing lifestyle', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [
          ...BRAND_NAV_ROWS,
          ...REVIEW_SAFETY_ROWS,
          REVIEW_LIVING_COST_ROW,
          REVIEW_STUDENT_LIVING_PLACE_ROW,
          ...QUALIFIED_ROWS,
        ].map((r) => ({
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
    // Order-insensitive: the route ranks by score, so membership is the contract.
    expect(queriesOf(body).sort()).toEqual([...REVIEW_ACTIONABLE_QUERIES].sort())
    // Three navigational brand rows (junk) + the housing-context living row.
    expect(body.excludedNonActionable).toBe(BRAND_NAV_ROWS.length + 1)
    expect(JSON.stringify(body.opportunities)).not.toContain('you safe login')
    expect(JSON.stringify(body.opportunities)).not.toContain('student living university of south carolina')
  })
})

describe('GET /api/content-studio/opportunities/score — natural-length mission safety (final review finding)', () => {
  it('drops brand nav at the persisted read and keeps mission-safety + living-cost rows qualified', async () => {
    mockRequireAdminUser.mockResolvedValue({
      role: 'admin',
      profileId: 'p_admin',
      db: stubDb([
        ...BRAND_NAV_ROWS,
        ...REVIEW_SAFETY_ROWS,
        REVIEW_LIVING_COST_ROW,
        REVIEW_STUDENT_LIVING_PLACE_ROW,
        ...QUALIFIED_ROWS,
      ]),
    })
    const res = await GET(request('?days=90&limit=50'))
    const body = (await res.json()) as Record<string, any>

    expect(body.ok).toBe(true)
    expect(queriesOf(body).sort()).toEqual([...REVIEW_ACTIONABLE_QUERIES].sort())
    // Junk brand rows are dropped at the persisted read (not counted as
    // non-actionable demand); only the housing-context living row is refused
    // at the action boundary.
    expect(body.excludedNonActionable).toBe(1)
  })
})

describe('POST /api/content-studio/opportunities/score — tightened boundary (PR #224 review)', () => {
  it('keeps tenancy instruments actionable while refusing bounded near-campus variants', async () => {
    mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db: {} })
    const res = await POST(
      postRequest({
        rows: [...REVIEW_TENANCY_ROWS, ...REVIEW_NEAR_CAMPUS_ROWS].map((r) => ({
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
    expect(queriesOf(body).sort()).toEqual([...REVIEW_TENANCY_QUERIES].sort())
    expect(body.excludedNonActionable).toBe(REVIEW_NEAR_CAMPUS_ROWS.length)
    for (const row of REVIEW_NEAR_CAMPUS_ROWS) {
      expect(JSON.stringify(body.opportunities)).not.toContain(String(row.query))
    }
  })
})
