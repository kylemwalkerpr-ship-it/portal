/**
 * Shared facet cache contract (marketplace CPU optimization):
 *
 * The gig-facets API and the landing chips must read through the SAME
 * versioned KV entry in the `gigs` namespace, keyed by the filter query
 * string. The entry stores the RAW FacetCounts (nulls preserved) so the
 * landing can fall back per field to its in-memory partition; the API
 * normalizes nulls to 0 only when serializing its numeric response.
 */

import { GET } from '@/app/api/marketplace/gig-facets/route'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  FACET_CACHE_TTL_SECONDS,
  getCachedFacetCounts,
  normalizeFacetCounts,
  setCachedFacetCounts,
  type FacetCounts,
} from '@/lib/marketplaceFacets'
import * as cache from '@/lib/cache'

jest.mock('@/lib/cache', () => {
  const store = new Map<string, unknown>()
  return {
    __store: store,
    getCached: jest.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    setCached: jest.fn(async (key: string, data: unknown) => {
      store.set(key, data)
    }),
    generateVersionedCacheKey: jest.fn(
      async (namespace: string, path: string, query?: string) =>
        `page:v0:${path}${query ? `?${query}` : ''}`,
    ),
    getCacheVersion: jest.fn(async () => '0'),
    bumpCacheVersion: jest.fn(async () => {}),
  }
})

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: jest.fn(),
}))

const mockedCache = cache as unknown as {
  __store: Map<string, unknown>
  getCached: jest.Mock
  setCached: jest.Mock
  generateVersionedCacheKey: jest.Mock
}
const mockedCreateClient = createSupabaseAdminClient as unknown as jest.Mock

const facetKey = (query = '') => `page:v0:/api/marketplace/gig-facets${query ? `?${query}` : ''}`

const sampleCounts: FacetCounts = {
  categoryCounts: { immigration: 3, legal: null },
  jurisdictionCounts: { us: 3, uk: null, ca: 0, au: 0 },
  providerTypeCounts: { attorney: 2, consultant: null },
  total: 3,
}

/** Minimal PostgREST head-count chain — every COUNT resolves `{ count, error }`. */
function fakeCountingDb(count: number | null, error: unknown = null) {
  const mkQuery = () => {
    const q: any = {
      select: () => q,
      eq: () => q,
      in: () => q,
      gte: () => q,
      or: () => q,
      then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
        Promise.resolve({ count, error }).then(resolve, reject)
      },
    }
    return q
  }
  return { from: () => mkQuery() }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedCache.__store.clear()
})

describe('shared facet cache — lib helpers', () => {
  it('uses one versioned `gigs` entry for the unfiltered landing/API counts', async () => {
    await setCachedFacetCounts(sampleCounts)

    expect(mockedCache.generateVersionedCacheKey).toHaveBeenCalledWith(
      'gigs',
      '/api/marketplace/gig-facets',
      '',
    )
    expect(mockedCache.setCached).toHaveBeenCalledWith(
      facetKey(),
      sampleCounts,
      FACET_CACHE_TTL_SECONDS,
    )

    expect(await getCachedFacetCounts()).toEqual(sampleCounts)
    expect(mockedCache.getCached).toHaveBeenCalledWith(facetKey(), FACET_CACHE_TTL_SECONDS)
  })

  it('keys filtered facet requests separately from the unfiltered entry', async () => {
    await setCachedFacetCounts(sampleCounts, 'country=uk')

    expect(mockedCache.generateVersionedCacheKey).toHaveBeenCalledWith(
      'gigs',
      '/api/marketplace/gig-facets',
      'country=uk',
    )
    expect(await getCachedFacetCounts('')).toBeNull()
    expect(await getCachedFacetCounts('country=uk')).toEqual(sampleCounts)
  })

  it('treats a malformed cached entry as a miss (recompute, never crash)', async () => {
    mockedCache.__store.set(facetKey(), { total: 3 })
    expect(await getCachedFacetCounts()).toBeNull()
  })

  it('normalizes raw nulls to the numeric API contract only at serialization', () => {
    expect(normalizeFacetCounts(sampleCounts)).toEqual({
      categoryCounts: { immigration: 3, legal: 0 },
      jurisdictionCounts: { us: 3, uk: 0, ca: 0, au: 0 },
      providerTypeCounts: { attorney: 2, consultant: 0 },
      total: 3,
    })
    // The shared raw value keeps its nulls for the landing's per-field fallback.
    expect(sampleCounts.providerTypeCounts.consultant).toBeNull()
  })
})

describe('GET /api/marketplace/gig-facets — shared cache read-through', () => {
  it('a warm unfiltered landing entry answers the API without creating a DB client', async () => {
    mockedCache.__store.set(facetKey(), sampleCounts)

    const res = await GET(new Request('http://test/api/marketplace/gig-facets'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.data).toEqual(normalizeFacetCounts(sampleCounts))
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('on a miss it computes, serves numbers, and writes the raw entry with nulls preserved', async () => {
    mockedCreateClient.mockReturnValue(fakeCountingDb(4))

    const res = await GET(new Request('http://test/api/marketplace/gig-facets?country=us'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.data.total).toBe(4)
    expect(body.data.categoryCounts.immigration).toBe(4)
    expect(mockedCreateClient).toHaveBeenCalledTimes(1)
    expect(mockedCache.__store.get(facetKey('country=us'))).toMatchObject({
      jurisdictionCounts: { us: 4, uk: 4, ca: 4, au: 4 },
      providerTypeCounts: { attorney: 4, consultant: 4 },
      total: 4,
    })
    expect(mockedCache.setCached).toHaveBeenCalledWith(
      facetKey('country=us'),
      expect.any(Object),
      FACET_CACHE_TTL_SECONDS,
    )
  })

  it('failed COUNTs stay null in KV while the API response surfaces 0', async () => {
    mockedCreateClient.mockReturnValue(fakeCountingDb(null, { message: 'boom' }))

    const res = await GET(new Request('http://test/api/marketplace/gig-facets'))
    const body = await res.json()

    expect(body.data.total).toBe(0)
    expect(body.data.providerTypeCounts).toEqual({ attorney: 0, consultant: 0 })

    const stored = mockedCache.__store.get(facetKey()) as FacetCounts
    expect(stored.total).toBeNull()
    expect(stored.providerTypeCounts.attorney).toBeNull()
  })
})
