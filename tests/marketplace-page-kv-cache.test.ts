/**
 * Page-level versioned KV read-through (marketplace CPU optimization):
 *
 *  - app/marketplace/gigs/page.tsx reads the full active-gig directory
 *    (same 5000-row inventory, same "Complete service directory") through a
 *    versioned `gigs` entry, and never persists a failed query as an empty
 *    directory.
 *  - the category page count used by BOTH generateMetadata and the page body
 *    goes through lib/marketplaceCategoryCounts, so the two renders reuse one
 *    cached count; failures are never cached as 0.
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

describe('gigs directory cache — /gigs hub', () => {
  it('reads the directory through the versioned `gigs` KV entry', () => {
    expect(gigHub).toContain(
      "import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'",
    )
    expect(gigHub).toContain('GIGS_DIRECTORY_CACHE_PATH')
    expect(gigHub).toContain('GIGS_DIRECTORY_CACHE_QUERY')
    expect(gigHub).toContain('getCached<HubGig[]>(cacheKey, GIGS_DIRECTORY_CACHE_TTL_SECONDS)')
    expect(gigHub).toContain('setCached(cacheKey, fresh, GIGS_DIRECTORY_CACHE_TTL_SECONDS)')
    expect(gigHub).toContain("const GIGS_DIRECTORY_CACHE_QUERY = 'v1'")
    // The key is stamped in the same namespace the rest of the marketplace
    // invalidates (bumpCacheVersion('gigs')).
    expect(gigHub).toMatch(/generateVersionedCacheKey\(\s*'gigs'/)
  })

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

  it('serves the cached directory on a hit and recomputes on a miss', () => {
    const hitIdx = gigHub.indexOf('if (isHubGigDirectory(cached)) return cached')
    const computeIdx = gigHub.indexOf('const fresh = await computeActiveGigs()')
    expect(hitIdx).toBeGreaterThan(-1)
    expect(computeIdx).toBeGreaterThan(hitIdx)
  })

  it('never persists a failed query as an empty directory', () => {
    const computeIdx = gigHub.indexOf('const fresh = await computeActiveGigs()')
    const bailIdx = gigHub.indexOf('if (!fresh) return []')
    const writeIdx = gigHub.indexOf('await setCached(cacheKey, fresh, GIGS_DIRECTORY_CACHE_TTL_SECONDS)')
    expect(bailIdx).toBeGreaterThan(computeIdx)
    expect(writeIdx).toBeGreaterThan(bailIdx)
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
