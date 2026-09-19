/**
 * Marketplace page cache/static contracts:
 *
 *  - app/marketplace/gigs/page.tsx is true build-time SSG. It keeps the full
 *    directory but never enters unsupported time-based ISR on Cloudflare.
 *  - the category page count used by BOTH generateMetadata and the page body
 *    goes through lib/marketplaceCategoryCounts, so dynamic category requests
 *    reuse one cached count; failures are never cached as 0.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  CATEGORY_COUNT_CACHE_TTL_SECONDS,
  countActiveGigsForCategory,
  getCachedCategoryCount,
  isCategoryCount,
  setCachedCategoryCount,
} from '@/lib/marketplaceCategoryCounts'
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

const repoRoot = process.cwd()
const readRepo = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')

const gigHub = readRepo('app/marketplace/gigs/page.tsx')
const categoryPage = readRepo('app/marketplace/categories/[categoryId]/page.tsx')

const categoryCountKey = (filterId: string) =>
  `page:v0:/cache/category-count?${filterId}`

/** Minimal PostgREST head-count chain for the category COUNT. */
function fakeCountDb(count: number | null, error: unknown = null) {
  const q: any = {
    select: () => q,
    eq: () => q,
    or: () => q,
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      Promise.resolve({ count, error }).then(resolve, reject)
    },
  }
  return { from: () => q }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedCache.__store.clear()
})

describe('gigs directory SSG — /gigs hub', () => {
  it('keeps the full inventory query and the Complete service directory', () => {
    const source = gigHub
    expect(source).toContain(".eq('status', 'active')")
    expect(source).toContain(".not('provider_id', 'is', null)")
    expect(source).toContain(".not('slug', 'is', null)")
    expect(source).toContain('.limit(5000)')
    expect(source).toContain('Complete service directory')
    expect(source).toContain('Other services')
    expect(source).toContain('href={`/gigs/${gig.slug}`}')
  })

  it('is build-time SSG with no runtime KV/ISR path', () => {
    expect(gigHub).toContain('export const revalidate = false')
    expect(gigHub).toContain('loadActiveGigsForBuild')
    expect(gigHub).not.toContain("from '@/lib/cache'")
    expect(gigHub).not.toContain('generateVersionedCacheKey')
    expect(gigHub).not.toContain('GIGS_DIRECTORY_CACHE_')
    expect(gigHub).not.toMatch(/export const revalidate\s*=\s*\d+/)
  })

  it('fails closed if the build-time inventory query is unavailable', () => {
    expect(gigHub).toContain('throw new Error(`active-gig directory query failed:')
    expect(gigHub).toContain('throw new Error(`[marketplace/gigs] build-time directory unavailable:')
    expect(gigHub).not.toContain('if (!fresh) return []')
  })
})

describe('category count cache — lib helpers', () => {
  it('validates only finite, non-negative counts', () => {
    expect(isCategoryCount(0)).toBe(true)
    expect(isCategoryCount(217)).toBe(true)
    expect(isCategoryCount(null)).toBe(false)
    expect(isCategoryCount(undefined)).toBe(false)
    expect(isCategoryCount(-1)).toBe(false)
    expect(isCategoryCount(Number.NaN)).toBe(false)
    expect(isCategoryCount('7')).toBe(false)
  })

  it('stores and reads one versioned entry per category filter id', async () => {
    await setCachedCategoryCount('immigration', 12)

    expect(mockedCache.generateVersionedCacheKey).toHaveBeenCalledWith(
      'gigs',
      '/cache/category-count',
      'immigration',
    )
    expect(mockedCache.setCached).toHaveBeenCalledWith(
      categoryCountKey('immigration'),
      12,
      CATEGORY_COUNT_CACHE_TTL_SECONDS,
    )
    expect(await getCachedCategoryCount('immigration')).toBe(12)
    expect(await getCachedCategoryCount('legal')).toBeNull()
  })

  it('serves a warm count without touching the DB (metadata + body share it)', async () => {
    mockedCache.__store.set(categoryCountKey('immigration'), 12)

    expect(await countActiveGigsForCategory('immigration')).toBe(12)
    expect(await countActiveGigsForCategory('immigration')).toBe(12)
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('computes and caches a genuine 0 (empty category) on a miss', async () => {
    mockedCreateClient.mockReturnValue(fakeCountDb(0))

    expect(await countActiveGigsForCategory('education')).toBe(0)
    expect(mockedCreateClient).toHaveBeenCalledTimes(1)
    expect(mockedCache.__store.get(categoryCountKey('education'))).toBe(0)
  })

  it('returns 0 for a failed COUNT but never caches the failure', async () => {
    mockedCreateClient.mockReturnValue(fakeCountDb(null, { message: 'boom' }))

    expect(await countActiveGigsForCategory('immigration')).toBe(0)
    expect(mockedCreateClient).toHaveBeenCalledTimes(1)
    expect(mockedCache.setCached).not.toHaveBeenCalled()
  })

  it('ignores a malformed cached count and recomputes', async () => {
    mockedCache.__store.set(categoryCountKey('immigration'), 'twelve')
    mockedCreateClient.mockReturnValue(fakeCountDb(12))

    expect(await countActiveGigsForCategory('immigration')).toBe(12)
    expect(mockedCreateClient).toHaveBeenCalledTimes(1)
  })
})

describe('category page wiring — one cached count for metadata and body', () => {
  it('imports the cached counter instead of hand-rolling a Supabase COUNT', () => {
    expect(categoryPage).toContain(
      "import { countActiveGigsForCategory } from '@/lib/marketplaceCategoryCounts'",
    )
    expect(categoryPage).not.toContain('createSupabaseAdminClient')
    expect(categoryPage).not.toContain('buildCategoryOrFilter')
  })

  it('calls the cached counter from both generateMetadata and the page body', () => {
    const metaIdx = categoryPage.indexOf('export async function generateMetadata')
    const bodyIdx = categoryPage.indexOf('export default async function CategoryPage')
    const metaCallIdx = categoryPage.indexOf('countActiveGigsForCategory(', metaIdx)
    const bodyCallIdx = categoryPage.indexOf('countActiveGigsForCategory(', bodyIdx)

    expect(metaIdx).toBeGreaterThan(-1)
    expect(bodyIdx).toBeGreaterThan(metaIdx)
    expect(metaCallIdx).toBeGreaterThan(metaIdx)
    expect(bodyCallIdx).toBeGreaterThan(bodyIdx)
  })
})
