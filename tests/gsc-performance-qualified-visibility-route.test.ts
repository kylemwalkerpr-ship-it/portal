/**
 * P1 measurement integrity — GET /api/content-studio/gsc/performance contract.
 *
 * The route must return a TRUTHFUL FULL-WINDOW visibility summary from the
 * persisted rows (raw / qualified / off-mission / junk / deep tail), explicitly
 * bounded, while the existing limited diagnostic row list and the existing
 * latest-stored-window fallback semantics stay intact.
 */
import { GET } from '@/app/api/content-studio/gsc/performance/route'
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

type DataRead = { cols: string; order: Array<[string, boolean]> }

/**
 * seo_gsc_rows chain stub: full-window scan pages, exact count, latest-window
 * probe. Every data (non-head, non-probe) read is recorded with the order chain
 * it was issued with, so a test can prove the route derives its diagnostics from
 * ONE resolved scan instead of also issuing a separate limited display read.
 */
function stubDb(input: {
  window: FakeRow[]
  count?: number | null
  countError?: string
  fallbackCount?: number | null
  latest?: { start_date: string; end_date: string } | null
  fallbackWindow?: FakeRow[]
}) {
  let scanIndex = 0
  let countIndex = 0
  const reads: DataRead[] = []
  const selects: string[] = []
  const db = {
    from: () => {
      let cols = ''
      let opts: { count?: 'exact'; head?: boolean } | undefined
      const order: Array<[string, boolean]> = []
      const api = {
        select: (c: string, o?: { count?: 'exact'; head?: boolean }) => {
          cols = c
          opts = o
          selects.push(c)
          return api
        },
        eq: () => api,
        order: (column: string, o?: { ascending?: boolean }) => {
          order.push([column, o?.ascending !== false])
          return api
        },
        limit: () => api,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          let result: { data?: unknown; count?: number | null; error: { message: string } | null }
          if (cols === 'start_date, end_date') {
            result = { data: input.latest ? [input.latest] : [], error: null }
          } else if (opts?.head) {
            const n = countIndex === 0 ? input.count : input.fallbackCount ?? input.count
            countIndex += 1
            result = input.countError && countIndex === 1
              ? { data: null, count: null, error: { message: input.countError } }
              : { count: n ?? null, data: null, error: null }
          } else {
            reads.push({ cols, order: order.map((o) => [...o] as [string, boolean]) })
            const rows = scanIndex === 0 ? input.window : input.fallbackWindow ?? input.window
            scanIndex += 1
            result = { data: rows, error: null }
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return api
    },
  }
  return { db, reads, selects }
}

const request = (query = '') => ({ nextUrl: new URL(`http://localhost/api/content-studio/gsc/performance${query}`) }) as never

const RAW_ROWS: FakeRow[] = [
  {
    query: '"2026-2027 stockton room and meal plan rates final.pdf" pacific.edu/sites/default/files/users/user2983',
    page: 'https://example.com/pdf',
    clicks: 0,
    impressions: 2000,
    ctr: 0,
    position: 3,
  },
  {
    query: 'university of the pacific student housing',
    page: 'https://example.com/housing',
    clicks: 0,
    impressions: 900,
    ctr: 0,
    position: 9.8,
  },
  {
    query: 'canada study permit processing time',
    page: 'https://legal.yousafeconsultancy.com/ca/study-permit/',
    clicks: 4,
    impressions: 248,
    ctr: 0.016,
    position: 10.2,
  },
  {
    query: 'study permit biometrics appointment ottawa',
    page: 'https://legal.yousafeconsultancy.com/ca/biometrics/',
    clicks: 0,
    impressions: 5,
    ctr: 0,
    position: 30,
  },
]

async function bodyFor(db: unknown, query = '?days=90&limit=1') {
  mockRequireAdminUser.mockResolvedValue({ role: 'admin', profileId: 'p_admin', db })
  const res = await GET(request(query))
  return (await res.json()) as Record<string, any>
}

beforeEach(() => {
  mockRequireAdminUser.mockReset()
})

describe('GET /api/content-studio/gsc/performance — qualified visibility', () => {
  it('keeps the limited junk-free diagnostic list AND reports the full-window mix', async () => {
    const body = await bodyFor(stubDb({ window: RAW_ROWS, count: RAW_ROWS.length }).db)

    expect(body.ok).toBe(true)
    expect(body.usedFallback).toBe(false)
    // Existing limited diagnostic list: junk dropped, capped at `limit`.
    expect(body.rowCount).toBe(1)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].query).toBe('university of the pacific student housing')

    // The whole raw scan is NOT serialized (up to 25k rows would be wasteful):
    // raw GSC rows stay persisted and diagnosable in seo_gsc_rows and are used
    // server-side to derive the full-window summary. The limited diagnostic
    // list stays backward-compatible and carries the derived class additively.
    expect(body.rawRows).toBeUndefined()
    expect(body.rawRowCount).toBeUndefined()
    expect(body.rows[0].visibilityClass).toBe('off_mission')

    const visibility = body.visibility
    expect(visibility.totals.impressions).toBe(3153)
    expect(visibility.qualified.impressions).toBe(248)
    expect(visibility.offMission.impressions).toBe(900)
    expect(visibility.offMission.share).toBeCloseTo(900 / 3153, 4)
    expect(visibility.junk.impressions).toBe(2000)
    expect(visibility.deepTail.impressions).toBe(5)
    expect(visibility.eligible).toBeUndefined()

    // Independent of the display limit and explicitly bounded.
    expect(visibility.scope.displayLimit).toBe(1)
    expect(visibility.scope.persistedRows).toBe(RAW_ROWS.length)
    expect(visibility.scope.windowRowCount).toBe(RAW_ROWS.length)
    expect(visibility.scope.complete).toBe(true)
    expect(visibility.scope.truncated).toBe(false)
    expect(visibility.scope.unscannedRows).toBe(0)
  })

  it('keeps the latest-stored-window fallback semantics and says so', async () => {
    const body = await bodyFor(
      stubDb({
        window: [],
        count: 0,
        fallbackCount: RAW_ROWS.length,
        latest: { start_date: '2026-06-01', end_date: '2026-08-29' },
        fallbackWindow: RAW_ROWS,
      }).db,
      '?days=90&limit=40',
    )

    expect(body.usedFallback).toBe(true)
    expect(body.range.startDate).toBe('2026-06-01')
    expect(body.range.endDate).toBe('2026-08-29')
    expect(body.visibility.scope.usedFallback).toBe(true)
    expect(body.visibility.qualified.impressions).toBe(248)
    expect(body.visibility.offMission.impressions).toBe(900)
  })

  it('keeps the four buckets reconciling back to the raw totals', async () => {
    const body = await bodyFor(stubDb({ window: RAW_ROWS, count: RAW_ROWS.length }).db, '?days=90&limit=40')
    const visibility = body.visibility
    // qualified excludes ALL of junk + off-mission + deep tail
    expect(visibility.qualified.impressions).toBe(248)
    expect(visibility.qualified.impressions + visibility.offMission.impressions + visibility.junk.impressions + visibility.deepTail.impressions).toBe(
      visibility.totals.impressions,
    )
    expect(visibility.offMission.impressions).toBeGreaterThan(0)
  })

  /**
   * M1/M2 — one resolved read. The full-window measurement scan is the primary
   * read, and the limited junk-free diagnostic list is derived from the SAME
   * resolved window instead of a second, independently-limited display read
   * (which could disagree about the window and mislead diagnostics).
   */
  it('derives the limited diagnostics from the same resolved full-window scan', async () => {
    const { db, reads } = stubDb({ window: RAW_ROWS, count: RAW_ROWS.length })
    const body = await bodyFor(db, '?days=90&limit=2')

    // One resolved window read: the old code issued a second, independently
    // limited display read here.
    expect(reads).toHaveLength(1)
    expect(reads[0].order[0]).toEqual(['impressions', false])
    expect(reads[0].order.map(([c]) => c)).toContain('query')
    expect(reads[0].order.map(([c]) => c)).toContain('page')

    // Diagnostics = junk-free prefix of the scan rows, in scan order.
    expect(body.rows.map((r: { query: string }) => r.query)).toEqual([
      'university of the pacific student housing',
      'canada study permit processing time',
    ])
    expect(body.rowCount).toBe(2)
    expect(body.rows[0].visibilityClass).toBe('off_mission')
    expect(body.visibility.scope.complete).toBe(true)
  })

  /**
   * M1/M2 error path — if the full measurement scan fails, the previously
   * working diagnostics must still load (display read + best-effort window),
   * with `visibility: null` and an explicit warning instead of a silent blank
   * or a fabricated summary.
   */
  it('falls back to the persisted display read with visibility:null when the scan fails', async () => {
    const { db } = stubDb({
      window: RAW_ROWS,
      count: RAW_ROWS.length,
      countError: 'permission denied for table seo_gsc_rows',
    })
    const body = await bodyFor(db, '?days=90&limit=40')

    expect(body.ok).toBe(true)
    expect(body.visibility).toBeNull()
    expect(String(body.visibilityError)).toMatch(/permission denied|scan/i)
    expect(String(body.visibilityWarning)).toMatch(/visibility|measurement/i)
    // Diagnostics keep working — junk-free, ordered, unchanged shape.
    expect(body.rows.map((r: { query: string }) => r.query)).toEqual([
      'university of the pacific student housing',
      'canada study permit processing time',
      'study permit biometrics appointment ottawa',
    ])
    expect(body.rowCount).toBe(3)
    expect(body.usedFallback).toBe(false)
    expect(body.range.startDate).toBeDefined()
  })
})
