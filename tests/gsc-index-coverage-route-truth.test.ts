import { POST } from '@/app/api/content-studio/gsc/index-coverage/route'
import { detectGscAuthMode, getGscAccess } from '@/lib/gscAuth'
import { fetchGscIndexCoverage } from '@/lib/gscIndexCoverage'
import { collectEstatePageInventory } from '@/lib/seoFactory/indexCoverageFixes'
import { createSupabaseAdminClient } from '@/lib/supabase'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ role: 'admin', profileId: 'admin' })),
}))

jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn(), detectGscAuthMode: jest.fn() }))
jest.mock('@/lib/gscIndexCoverage', () => ({
  fetchGscIndexCoverage: jest.fn(),
  prioritizeIndexCoverageUrls: jest.requireActual('@/lib/gscIndexCoverage').prioritizeIndexCoverageUrls,
  chunkUrlsForFilter: jest.requireActual('@/lib/gscIndexCoverage').chunkUrlsForFilter,
}))
jest.mock('@/lib/seoFactory/indexCoverageFixes', () => ({
  collectEstatePageInventory: jest.fn(),
  indexUrlKey: jest.requireActual('@/lib/seoFactory/indexCoverageFixes').indexUrlKey,
}))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))

const mockedAccess = getGscAccess as jest.Mock
const mockedAuthMode = detectGscAuthMode as jest.Mock
const mockedFetch = fetchGscIndexCoverage as jest.Mock
const mockedInventory = collectEstatePageInventory as jest.Mock
const mockedDb = createSupabaseAdminClient as jest.Mock

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never
}

type PriorRow = { url: string; inspected_at: string | null }

type PriorReadError = { message: string }

type PriorQuery = {
  in: (column: string, urls: string[]) => PriorQuery
  order: (column: string, options?: { ascending?: boolean }) => PriorQuery
  limit: (count: number) => PriorQuery
  then: (resolve: (value: { data: PriorRow[] | null; error: PriorReadError | null }) => unknown) => Promise<unknown>
}

type PriorReadOptions = {
  /** Reject the read the way a proxy/PostgREST does when the encoded filter is too large. */
  encodedFilterBudget?: number
  /** Fail the Nth prior-history read (0-based); simulate a transient/large-query failure. */
  failReads?: (readIndex: number) => boolean
}

/** Mirrors the production cost model: encoded URL + quotes/commas + wrapper overhead. */
function filterCost(urls: string[]): number {
  return urls.reduce((total, url) => total + encodeURIComponent(url).length + 6, 2)
}

function priorQuery(rows: PriorRow[], options: PriorReadOptions, reads: string[][]): PriorQuery {
  const state: { urls: string[] | null; limit: number } = { urls: null, limit: Number.POSITIVE_INFINITY }
  const byUrl = new Map(rows.map((row) => [row.url, row]))
  const builder: PriorQuery = {
    in: jest.fn((_column: string, urls: string[]) => { state.urls = urls; return builder }),
    order: jest.fn(() => builder),
    limit: jest.fn((count: number) => { state.limit = count; return builder }),
    then: (resolve) => {
      const readIndex = reads.length
      const urls = state.urls ?? []
      reads.push([...urls])
      if (options.encodedFilterBudget !== undefined && filterCost(urls) > options.encodedFilterBudget) {
        return Promise.resolve({ data: null, error: { message: `encoded filter exceeds ${options.encodedFilterBudget} bytes` } }).then(resolve)
      }
      if (options.failReads?.(readIndex)) {
        return Promise.resolve({ data: null, error: { message: 'prior history read failed' } }).then(resolve)
      }
      const data = urls.map((url) => byUrl.get(url)).filter((row): row is PriorRow => Boolean(row))
      return Promise.resolve({ data: data.slice(0, state.limit), error: null }).then(resolve)
    },
  }
  return builder
}

function dbHarness(prior: PriorRow[] = [], options: PriorReadOptions = {}) {
  const upserts: unknown[] = []
  const runInserts: unknown[] = []
  const priorReads: string[][] = []
  const from = jest.fn((table: string) => {
    if (table === 'gsc_index_coverage') {
      return {
        select: jest.fn(() => priorQuery(prior, options, priorReads)),
        upsert: jest.fn(async (payload: unknown) => { upserts.push(payload); return { error: null } }),
      }
    }
    if (table === 'seo_engine_runs') {
      return { insert: jest.fn(async (payload: unknown) => { runInserts.push(payload); return { error: null } }) }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { client: { from }, upserts, runInserts, priorReads }
}

const ACCESS = { accessToken: 'token', mode: 'service_account', siteUrl: 'sc-domain:yousafeconsultancy.com' }
const PAGE_A = {
  repo: 'caseworks', host: 'legal.yousafeconsultancy.com', path: 'app/a/page.tsx',
  url: 'https://legal.yousafeconsultancy.com/a/', title: 'A', indexable: true,
  inboundLinks: 0, sampleSources: [],
}
const PAGE_B = { ...PAGE_A, path: 'app/b/page.tsx', url: 'https://legal.yousafeconsultancy.com/b/', title: 'B' }

beforeEach(() => {
  jest.clearAllMocks()
  mockedAccess.mockResolvedValue(ACCESS)
  mockedAuthMode.mockResolvedValue('service_account')
  mockedInventory.mockResolvedValue([PAGE_A, PAGE_B])
})

describe('POST /gsc/index-coverage — truthful measurement boundary', () => {
  it('fails fast as unavailable before estate inventory work and does not touch coverage cache', async () => {
    mockedAccess.mockResolvedValue(null)
    mockedAuthMode.mockResolvedValue(null)
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as Record<string, unknown>

    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.state).toBe('unavailable')
    expect(mockedInventory).not.toHaveBeenCalled()
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.runInserts).toHaveLength(1)
  })

  it('reports failed when credentials exist but access token resolution fails', async () => {
    mockedAccess.mockResolvedValue(null)
    mockedAuthMode.mockResolvedValue('oauth')
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.state).toBe('failed')
    expect(mockedInventory).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.runInserts).toHaveLength(1)
  })

  it('persists every successful observation while returning only issues for UI compatibility', async () => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'complete', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 2, attempted: 2, inspected: 2, failed: 0, skipped: 0, errors: [],
      attemptedAt: '2026-09-17T00:00:00.000Z', completedAt: '2026-09-17T00:00:01.000Z', successfulAt: '2026-09-17T00:00:01.000Z',
      observations: [
        { url: PAGE_A.url, indexed: true, reasonCode: 'INDEXED', reason: 'Indexed', fixAction: 'NONE', fixLabel: 'No fix needed', autoFix: false, coverageState: 'Indexed', verdict: 'PASS', indexingState: null, pageFetchState: null, robotsTxtState: null, googleCanonical: null, userCanonical: null, sitemaps: [], referringUrls: [], lastCrawlTime: null },
        { url: PAGE_B.url, indexed: false, reasonCode: 'CRAWLED_NOT_INDEXED', reason: 'Crawled - currently not indexed', fixAction: 'IMPROVE_QUALITY', fixLabel: 'Improve content + links', autoFix: false, coverageState: 'Crawled - currently not indexed', verdict: 'NEUTRAL', indexingState: null, pageFetchState: null, robotsTxtState: null, googleCanonical: null, userCanonical: null, sitemaps: [], referringUrls: [], lastCrawlTime: null },
      ],
      issues: [{ url: PAGE_B.url, indexed: false, reasonCode: 'CRAWLED_NOT_INDEXED', reason: 'Crawled - currently not indexed', fixAction: 'IMPROVE_QUALITY', fixLabel: 'Improve content + links', autoFix: false, coverageState: 'Crawled - currently not indexed', verdict: 'NEUTRAL', indexingState: null, pageFetchState: null, robotsTxtState: null, googleCanonical: null, userCanonical: null, sitemaps: [], referringUrls: [], lastCrawlTime: null }],
    })

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.state).toBe('complete')
    expect(body.issues).toHaveLength(1)
    expect(h.upserts).toHaveLength(1)
    expect((h.upserts[0] as any[])).toHaveLength(2)
    expect((h.upserts[0] as any[]).map((r) => r.indexed)).toEqual([true, false])
    expect(h.runInserts).toHaveLength(1)
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      kind: 'manual',
      status: 'success',
      triggered_by: 'content-studio',
      summary: expect.objectContaining({
        measurementKind: 'index-coverage',
        measurementState: 'complete',
        selectionStrategy: 'never-inspected-first_then_oldest-inspected',
        cachePersisted: true,
      }),
    }))
  })

  it('keeps partial success, persists only successful observations, and records failed count', async () => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'partial', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 2, attempted: 2, inspected: 1, failed: 1, skipped: 0,
      errors: [{ url: PAGE_B.url, error: 'GSC inspect 429: quota' }],
      attemptedAt: '2026-09-17T00:00:00.000Z', completedAt: '2026-09-17T00:00:01.000Z', successfulAt: '2026-09-17T00:00:01.000Z',
      observations: [{ url: PAGE_A.url, indexed: true, reasonCode: 'INDEXED', reason: 'Indexed', fixAction: 'NONE', fixLabel: 'No fix needed', autoFix: false, coverageState: 'Indexed', verdict: 'PASS', indexingState: null, pageFetchState: null, robotsTxtState: null, googleCanonical: null, userCanonical: null, sitemaps: [], referringUrls: [], lastCrawlTime: null }],
      issues: [],
    })

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(206)
    expect(body.ok).toBe(true)
    expect(body.state).toBe('partial')
    expect(body.failed).toBe(1)
    expect(h.upserts).toHaveLength(1)
    expect((h.upserts[0] as any[])).toHaveLength(1)
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      kind: 'manual',
      status: 'partial',
      summary: expect.objectContaining({ measurementKind: 'index-coverage', measurementState: 'partial' }),
    }))
  })

  it('returns failed without overwriting coverage observations when every inspection fails', async () => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'failed', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 2, attempted: 2, inspected: 0, failed: 2, skipped: 0,
      errors: [{ url: PAGE_A.url, error: 'timeout' }, { url: PAGE_B.url, error: 'timeout' }],
      attemptedAt: '2026-09-17T00:00:00.000Z', completedAt: '2026-09-17T00:00:01.000Z', successfulAt: null,
      observations: [], issues: [],
    })

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.state).toBe('failed')
    expect(h.upserts).toHaveLength(0)
    expect(h.runInserts).toHaveLength(1)
  })

  it('uses cached inspection timestamps to rotate the quota-bounded sample', async () => {
    const h = dbHarness([{ url: PAGE_A.url, inspected_at: '2026-09-17T00:00:00.000Z' }])
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'complete', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 1, attempted: 1, inspected: 1, failed: 0, skipped: 0, errors: [],
      attemptedAt: '2026-09-17T00:00:00.000Z', completedAt: '2026-09-17T00:00:01.000Z', successfulAt: '2026-09-17T00:00:01.000Z',
      observations: [], issues: [],
    })

    await POST(request({ action: 'fetch', maxUrls: 1 }))

    expect(mockedFetch).toHaveBeenCalledWith([PAGE_B.url], expect.objectContaining({ maxUrls: 1, access: ACCESS }))
  })

  it('scopes prior history per candidate so a global 5000-row window cannot hide the newest inspection', async () => {
    const newest = PAGE_A.url
    const oldest = PAGE_B.url
    const never = 'https://legal.yousafeconsultancy.com/never/'
    mockedInventory.mockResolvedValue([
      PAGE_A,
      PAGE_B,
      { ...PAGE_A, path: 'app/never/page.tsx', url: never, title: 'Never' },
    ])
    const filler = Array.from({ length: 4999 }, (_, i) => ({
      url: `https://legal.yousafeconsultancy.com/old-${String(i).padStart(4, '0')}/`,
      inspected_at: '2026-08-01T00:00:00.000Z',
    }))
    const prior = [
      ...filler,
      { url: oldest, inspected_at: '2026-08-02T00:00:00.000Z' },
      { url: newest, inspected_at: '2026-09-17T00:00:00.000Z' },
    ]
    expect(prior).toHaveLength(5001)
    const h = dbHarness(prior)
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'complete', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 2, attempted: 2, inspected: 2, failed: 0, skipped: 0, errors: [],
      attemptedAt: '2026-09-17T12:00:00.000Z', completedAt: '2026-09-17T12:00:01.000Z', successfulAt: '2026-09-17T12:00:01.000Z',
      observations: [], issues: [],
    })

    await POST(request({ action: 'fetch', maxUrls: 2 }))

    expect(mockedFetch).toHaveBeenCalledWith([never, oldest], expect.objectContaining({ maxUrls: 2, access: ACCESS }))
  })

  it('rejects a non-numeric maxUrls without inventory, inspection, or scan metadata work', async () => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue({
      state: 'complete', configured: true, siteUrl: ACCESS.siteUrl,
      requested: 0, attempted: 0, inspected: 0, failed: 0, skipped: 0, errors: [],
      attemptedAt: '2026-09-17T12:00:00.000Z', completedAt: '2026-09-17T12:00:01.000Z', successfulAt: '2026-09-17T12:00:01.000Z',
      observations: [], issues: [],
    })

    const res = await POST(request({ action: 'fetch', maxUrls: 'abc' }))
    const body = await res.json() as any

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(mockedInventory).not.toHaveBeenCalled()
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.runInserts).toHaveLength(0)
  })
})


function scanResult(overrides: Record<string, unknown> = {}) {
  return {
    state: 'complete', configured: true, siteUrl: ACCESS.siteUrl,
    requested: 2, attempted: 2, inspected: 2, failed: 0, skipped: 0, errors: [],
    attemptedAt: '2026-09-17T12:00:00.000Z', completedAt: '2026-09-17T12:00:01.000Z', successfulAt: '2026-09-17T12:00:01.000Z',
    observations: [], issues: [],
    ...overrides,
  }
}

describe('POST /gsc/index-coverage — bounded prior history and sample budget', () => {
  it('splits a large candidate set into bounded prior-history reads without degrading rotation', async () => {
    const never = 'https://legal.yousafeconsultancy.com/zz-never/'
    const oldest = 'https://legal.yousafeconsultancy.com/zz-oldest/'
    const middles = Array.from({ length: 298 }, (_, i) => `https://legal.yousafeconsultancy.com/mid-${String(i).padStart(3, '0')}/`)
    mockedInventory.mockResolvedValue([
      { ...PAGE_A, path: 'app/never/page.tsx', url: never },
      { ...PAGE_A, path: 'app/oldest/page.tsx', url: oldest },
      ...middles.map((url) => ({ ...PAGE_A, path: 'app/mid/page.tsx', url })),
    ])
    const prior = [
      { url: oldest, inspected_at: '2026-08-01T00:00:00.000Z' },
      ...middles.map((url) => ({ url, inspected_at: '2026-09-10T00:00:00.000Z' })),
    ]
    const h = dbHarness(prior, { encodedFilterBudget: 2000 })
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult({ requested: 2, attempted: 2, inspected: 2 }))

    await POST(request({ action: 'fetch', maxUrls: 2 }))

    expect(mockedFetch).toHaveBeenCalledWith([never, oldest], expect.objectContaining({ maxUrls: 2, access: ACCESS }))
    expect(h.priorReads.length).toBeGreaterThan(1)
    for (const read of h.priorReads) {
      expect(filterCost(read)).toBeLessThanOrEqual(2000)
    }
    expect([...h.priorReads.flat()].sort()).toEqual([...new Set([never, oldest, ...middles])].sort())
  })

  it('does not misclassify candidates when cached history exceeds 5000 rows', async () => {
    const newest = 'https://legal.yousafeconsultancy.com/a-newest/'
    const oldest = 'https://legal.yousafeconsultancy.com/z-old-0000/'
    const urls = [
      oldest,
      newest,
      ...Array.from({ length: 5098 }, (_, i) => `https://legal.yousafeconsultancy.com/z-old-${String(i + 1).padStart(4, '0')}/`),
    ]
    mockedInventory.mockResolvedValue(urls.map((url) => ({ ...PAGE_A, path: 'app/page.tsx', url })))
    const prior = urls.map((url) => ({
      url,
      inspected_at: url === newest ? '2026-09-17T00:00:00.000Z' : '2026-08-01T00:00:00.000Z',
    }))
    expect(prior).toHaveLength(5100)
    const h = dbHarness(prior, { encodedFilterBudget: 2000 })
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult({ requested: 1, attempted: 1, inspected: 1 }))

    await POST(request({ action: 'fetch', maxUrls: 1 }))

    expect(mockedFetch).toHaveBeenCalledWith([oldest], expect.objectContaining({ maxUrls: 1, access: ACCESS }))
    expect(h.priorReads.flat()).toHaveLength(5100)
    expect(h.priorReads.flat()).toContain(newest)
    expect(h.priorReads.length).toBeGreaterThan(1)
    expect(h.priorReads.length).toBeLessThanOrEqual(200)
    expect([...h.priorReads.flat()].sort()).toEqual([...urls].sort())
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      summary: expect.objectContaining({ candidateCount: 5100, priorHistoryRows: 5100 }),
    }))
  })

  it('fails closed on the first prior-history read failure without attempting a second read', async () => {
    const urls = Array.from({ length: 300 }, (_, i) => `https://legal.yousafeconsultancy.com/page-${String(i).padStart(3, '0')}/`)
    mockedInventory.mockResolvedValue(urls.map((url) => ({ ...PAGE_A, path: 'app/page.tsx', url })))
    const h = dbHarness([], { encodedFilterBudget: 2000, failReads: () => true })
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult())

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(502)
    expect(body.ok).toBe(false)
    expect(body.state).toBe('failed')
    expect(body.errors[0]?.error).toMatch(/prior inspection history/i)
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.priorReads).toHaveLength(1)
    expect(h.runInserts).toHaveLength(1)
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      kind: 'manual',
      status: 'failed',
      triggered_by: 'content-studio',
      summary: expect.objectContaining({
        measurementKind: 'index-coverage',
        measurementState: 'failed',
        priorHistoryAvailable: false,
        priorHistoryReads: 1,
        selectionStrategy: 'unavailable',
      }),
    }))
  })

  it('fails closed when a later prior-history read fails', async () => {
    const urls = Array.from({ length: 300 }, (_, i) => `https://legal.yousafeconsultancy.com/page-${String(i).padStart(3, '0')}/`)
    mockedInventory.mockResolvedValue(urls.map((url) => ({ ...PAGE_A, path: 'app/page.tsx', url })))
    const h = dbHarness([], { encodedFilterBudget: 2000, failReads: (index) => index === 1 })
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult())

    const res = await POST(request({ action: 'fetch', maxUrls: 2 }))
    const body = await res.json() as any

    expect(res.status).toBe(502)
    expect(body.state).toBe('failed')
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.priorReads).toHaveLength(2)
    expect(h.runInserts).toHaveLength(1)
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      summary: expect.objectContaining({
        measurementKind: 'index-coverage',
        priorHistoryAvailable: false,
        priorHistoryReads: 2,
        selectionStrategy: 'unavailable',
      }),
    }))
  })

  it.each([
    ['null', null],
    ['zero', 0],
    ['negative', -5],
    ['fractional', 1.5],
  ])('rejects maxUrls=%s without side effects', async (_label, value) => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)

    const res = await POST(request({ action: 'fetch', maxUrls: value }))
    const body = await res.json() as any

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(mockedInventory).not.toHaveBeenCalled()
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(h.upserts).toHaveLength(0)
    expect(h.runInserts).toHaveLength(0)
  })

  it('defaults a missing maxUrls to the 50-URL sample budget', async () => {
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult())

    const res = await POST(request({ action: 'fetch' }))
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(mockedFetch).toHaveBeenCalledWith([PAGE_A.url, PAGE_B.url], expect.objectContaining({ maxUrls: 2, access: ACCESS }))
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      summary: expect.objectContaining({ maxUrls: 50, candidateCount: 2 }),
    }))
  })

  it('clamps a large positive maxUrls to the 50-URL sample budget before inspecting', async () => {
    const urls = Array.from({ length: 60 }, (_, i) => `https://legal.yousafeconsultancy.com/c-${String(i).padStart(2, '0')}/`)
    mockedInventory.mockResolvedValue(urls.map((url) => ({ ...PAGE_A, path: 'app/page.tsx', url })))
    const h = dbHarness()
    mockedDb.mockReturnValue(h.client)
    mockedFetch.mockResolvedValue(scanResult({ requested: 50, attempted: 50, inspected: 50 }))

    const res = await POST(request({ action: 'fetch', maxUrls: 250 }))
    const body = await res.json() as any

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    const [sample, options] = mockedFetch.mock.calls[0]
    expect(sample).toHaveLength(50)
    expect(options).toEqual(expect.objectContaining({ maxUrls: 50, access: ACCESS }))
    expect(h.runInserts[0]).toEqual(expect.objectContaining({
      summary: expect.objectContaining({ maxUrls: 50, candidateCount: 60 }),
    }))
  })
})
