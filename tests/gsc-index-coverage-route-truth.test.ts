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

function dbHarness(prior: Array<{ url: string; inspected_at: string | null }> = []) {
  const upserts: unknown[] = []
  const runInserts: unknown[] = []
  const from = jest.fn((table: string) => {
    if (table === 'gsc_index_coverage') {
      return {
        select: jest.fn(() => ({
          order: jest.fn(() => ({ limit: jest.fn(async () => ({ data: prior, error: null })) })),
        })),
        upsert: jest.fn(async (payload: unknown) => { upserts.push(payload); return { error: null } }),
      }
    }
    if (table === 'seo_engine_runs') {
      return { insert: jest.fn(async (payload: unknown) => { runInserts.push(payload); return { error: null } }) }
    }
    throw new Error(`unexpected table ${table}`)
  })
  return { client: { from }, upserts, runInserts }
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
})
