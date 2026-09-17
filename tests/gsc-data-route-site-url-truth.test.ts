/**
 * M1 — POST /api/content-studio/gsc/data property truth.
 *
 * The route accepts a per-request `siteUrl` override and echoes a `siteUrl`
 * label in its response. That label must be the exact GSC property the live
 * Search Analytics queries targeted: a non-empty override has to reach
 * fetchSiteSearchAnalytics (not merely relabel rows pulled from the
 * configured default property), and callers that omit the override must keep
 * the existing configured-property default.
 */
import { POST } from '@/app/api/content-studio/gsc/data/route'
import { getGscAccess } from '@/lib/gscAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/lib/portalAuth', () => ({
  requireAdminUser: jest.fn(async () => ({ role: 'admin', profileId: 'p_admin' })),
}))

jest.mock('@/lib/gscAuth', () => ({ getGscAccess: jest.fn() }))

jest.mock('@/lib/gscContentBrief', () => ({
  buildGscContentBrief: jest.fn(async () => ({
    source: 'snapshot',
    mode: 'snapshot',
    siteUrl: null,
    rangeNote: '',
    primaryKeywords: [],
    relatedKeywords: [],
    opportunityKeywords: [],
    relatedPages: [],
    strategyHints: [],
    warnings: [],
  })),
}))

jest.mock('@/lib/seoDataLoaders', () => ({
  loadGscSnapshot: jest.fn(async () => ({
    generatedAt: '2026-09-15',
    totals: { totalClicks: 0, totalImpressions: 0 },
    topQueries: [],
    topPages: [],
    opportunities: {},
  })),
}))

const CONFIGURED_SITE = 'sc-domain:yousafeconsultancy.com'
const REQUESTED_SITE = 'https://legal.yousafeconsultancy.com/'

const originalFetch = global.fetch
let querySites: string[] = []

function request(body: Record<string, unknown>) {
  return { json: async () => body } as never
}

/** Decode the property segment of a Search Analytics query URL. */
function siteFromQueryUrl(url: string): string {
  const match = url.match(/\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query/)
  return match ? decodeURIComponent(match[1]) : ''
}

function rowsResponse(rows: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ rows }) } as Response
}

/** Canned GSC payloads — every dimension gets rows so the route stays live. */
function gscFetchMock(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  const site = siteFromQueryUrl(url)
  if (!site) throw new Error(`unexpected fetch: ${url}`)
  querySites.push(site)

  const body = JSON.parse(String(init?.body ?? '{}')) as { dimensions?: string[] }
  const dimension = body.dimensions?.[0]
  if (!dimension) {
    return Promise.resolve(rowsResponse([{ clicks: 10, impressions: 100, ctr: 0.1, position: 5 }]))
  }
  if (dimension === 'date') {
    return Promise.resolve(rowsResponse([{ keys: ['2026-09-14'], clicks: 10, impressions: 100 }]))
  }
  if (dimension === 'query') {
    return Promise.resolve(
      rowsResponse([{ keys: ['f-1 visa'], clicks: 5, impressions: 50, ctr: 0.1, position: 4 }]),
    )
  }
  if (dimension === 'page') {
    return Promise.resolve(
      rowsResponse([{ keys: [`${site}/f-1/`], clicks: 5, impressions: 50, ctr: 0.1, position: 4 }]),
    )
  }
  return Promise.resolve(rowsResponse([{ keys: [dimension], clicks: 5, impressions: 50, ctr: 0.1, position: 4 }]))
}

beforeEach(() => {
  jest.clearAllMocks()
  querySites = []
  ;(getGscAccess as jest.Mock).mockResolvedValue({
    accessToken: 'token',
    mode: 'service_account',
    siteUrl: CONFIGURED_SITE,
  })
  global.fetch = jest.fn(gscFetchMock) as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = originalFetch
})

describe('POST /api/content-studio/gsc/data — queried property matches the response label', () => {
  it('queries the request siteUrl override and labels the response with that same property', async () => {
    const res = await POST(request({ siteUrl: REQUESTED_SITE, days: 28 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.source).toBe('live')
    const queried = [...new Set(querySites)]
    expect(queried).toEqual([REQUESTED_SITE])
    expect(body.siteUrl).toBe(queried[0])
  })

  it('keeps the configured-property default when no siteUrl override is sent', async () => {
    const res = await POST(request({ days: 28 }))
    const body = (await res.json()) as Record<string, unknown>

    expect(body.source).toBe('live')
    const queried = [...new Set(querySites)]
    expect(queried).toEqual([CONFIGURED_SITE])
    expect(body.siteUrl).toBe(queried[0])
  })

  it('queries and reports the explicit property passed to fetchSiteSearchAnalytics', async () => {
    const live = await fetchSiteSearchAnalytics(28, { siteUrl: REQUESTED_SITE })

    const queried = [...new Set(querySites)]
    expect(queried).toEqual([REQUESTED_SITE])
    expect(live.siteUrl).toBe(queried[0])
  })
})
