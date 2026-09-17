import { getGscAccess } from '@/lib/gscAuth'
import {
  chunkUrlsForFilter,
  encodedFilterCost,
  fetchGscIndexCoverage,
  INSPECTION_FILTER_BUDGET_BYTES,
  prioritizeIndexCoverageUrls,
} from '@/lib/gscIndexCoverage'

jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn() }))

const mockedGetGscAccess = getGscAccess as jest.MockedFunction<typeof getGscAccess>

function inspection(indexStatusResult: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ inspectionResult: { indexStatusResult } }),
    text: async () => '',
  } as Response
}

function httpError(status: number, body = 'boom') {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as Response
}

describe('GSC index coverage measurement truth', () => {
  const access = {
    accessToken: 'token',
    mode: 'service_account' as const,
    siteUrl: 'sc-domain:yousafeconsultancy.com',
  }

  beforeEach(() => {
    jest.restoreAllMocks()
    mockedGetGscAccess.mockReset()
  })

  it('reports unavailable when no usable GSC access exists', async () => {
    mockedGetGscAccess.mockResolvedValue(null)

    const result = await fetchGscIndexCoverage(['https://legal.yousafeconsultancy.com/a/'], {
      concurrency: 1,
      delayMs: 0,
      maxUrls: 1,
    })

    expect(result.state).toBe('unavailable')
    expect(result.configured).toBe(false)
    expect(result.attempted).toBe(0)
    expect(result.inspected).toBe(0)
    expect(result.observations).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('does not report complete when there are no URLs to inspect', async () => {
    mockedGetGscAccess.mockResolvedValue(access)

    const result = await fetchGscIndexCoverage([], { concurrency: 1, delayMs: 0, maxUrls: 0 })

    expect(result.state).toBe('failed')
    expect(result.requested).toBe(0)
    expect(result.attempted).toBe(0)
    expect(result.inspected).toBe(0)
    expect(result.observations).toEqual([])
    expect(result.errors[0]?.error).toMatch(/no urls available/i)
  })

  it('reports failed when every attempted inspection errors', async () => {
    mockedGetGscAccess.mockResolvedValue(access)
    jest.spyOn(global, 'fetch').mockResolvedValue(httpError(500))

    const result = await fetchGscIndexCoverage([
      'https://legal.yousafeconsultancy.com/a/',
      'https://legal.yousafeconsultancy.com/b/',
    ], { concurrency: 1, delayMs: 0, maxUrls: 2 })

    expect(result.state).toBe('failed')
    expect(result.configured).toBe(true)
    expect(result.attempted).toBe(2)
    expect(result.inspected).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(result.observations).toEqual([])
  })

  it('reports partial and preserves successful observations when only some calls fail', async () => {
    mockedGetGscAccess.mockResolvedValue(access)
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(inspection({
        verdict: 'PASS',
        coverageState: 'Indexed, submitted in sitemap',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
      }))
      .mockResolvedValueOnce(httpError(429, 'quota'))

    const result = await fetchGscIndexCoverage([
      'https://legal.yousafeconsultancy.com/a/',
      'https://legal.yousafeconsultancy.com/b/',
    ], { concurrency: 1, delayMs: 0, maxUrls: 2 })

    expect(result.state).toBe('partial')
    expect(result.attempted).toBe(2)
    expect(result.inspected).toBe(1)
    expect(result.observations).toHaveLength(1)
    expect(result.observations[0].indexed).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
  })

  it('reports complete and returns both indexed and non-indexed successful observations', async () => {
    mockedGetGscAccess.mockResolvedValue(access)
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(inspection({
        verdict: 'PASS',
        coverageState: 'Indexed, submitted in sitemap',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
      }))
      .mockResolvedValueOnce(inspection({
        verdict: 'NEUTRAL',
        coverageState: 'Crawled - currently not indexed',
        indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        robotsTxtState: 'ALLOWED',
      }))

    const result = await fetchGscIndexCoverage([
      'https://legal.yousafeconsultancy.com/a/',
      'https://legal.yousafeconsultancy.com/b/',
    ], { concurrency: 1, delayMs: 0, maxUrls: 2 })

    expect(result.state).toBe('complete')
    expect(result.attempted).toBe(2)
    expect(result.inspected).toBe(2)
    expect(result.observations).toHaveLength(2)
    expect(result.observations.map((row) => row.indexed)).toEqual([true, false])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].reasonCode).toBe('CRAWLED_NOT_INDEXED')
  })

  it('treats a successful response without indexStatusResult as an inspection error, not unknown-to-google evidence', async () => {
    mockedGetGscAccess.mockResolvedValue(access)
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ inspectionResult: {} }),
      text: async () => '',
    } as Response)

    const result = await fetchGscIndexCoverage(['https://legal.yousafeconsultancy.com/a/'], {
      concurrency: 1,
      delayMs: 0,
      maxUrls: 1,
    })

    expect(result.state).toBe('failed')
    expect(result.observations).toEqual([])
    expect(result.errors[0]?.error).toMatch(/missing indexStatusResult/i)
  })
})

describe('prioritizeIndexCoverageUrls', () => {
  it('rotates missing URLs first, then the least recently inspected URLs', () => {
    const urls = [
      'https://legal.yousafeconsultancy.com/a/',
      'https://legal.yousafeconsultancy.com/b/',
      'https://legal.yousafeconsultancy.com/c/',
      'https://legal.yousafeconsultancy.com/d/',
    ]

    const prioritized = prioritizeIndexCoverageUrls(urls, [
      { url: urls[0], inspectedAt: '2026-09-16T00:00:00.000Z' },
      { url: urls[1], inspectedAt: '2026-09-10T00:00:00.000Z' },
      { url: urls[3], inspectedAt: '2026-09-12T00:00:00.000Z' },
    ], 3)

    expect(prioritized).toEqual([urls[2], urls[1], urls[3]])
  })

  it('deduplicates candidate URLs before applying the quota', () => {
    const a = 'https://legal.yousafeconsultancy.com/a/'
    expect(prioritizeIndexCoverageUrls([a, a], [], 10)).toEqual([a])
  })
})


describe('chunkUrlsForFilter', () => {
  it('keeps every PostgREST filter chunk within the conservative encoded budget', () => {
    const urls = Array.from({ length: 200 }, (_, i) => `https://legal.yousafeconsultancy.com/very-long-page-name-${i}/`)

    const chunks = chunkUrlsForFilter(urls)

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.flat()).toEqual(urls)
    for (const chunk of chunks) {
      expect(encodedFilterCost(chunk)).toBeLessThanOrEqual(INSPECTION_FILTER_BUDGET_BYTES)
    }
  })

  it('keeps the encoded filter budget small enough for a proxy request line', () => {
    expect(INSPECTION_FILTER_BUDGET_BYTES).toBeLessThanOrEqual(2000)
  })

  it('never drops a URL that alone exceeds the budget', () => {
    const huge = `https://legal.yousafeconsultancy.com/${'x'.repeat(3000)}/`
    expect(chunkUrlsForFilter([huge])).toEqual([[huge]])
  })
})
