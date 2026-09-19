/**
 * Landing cache contract (marketplace CPU optimization):
 *
 * The landing's single heaviest public fan-out must be served from the
 * explicit versioned KV helper (lib/cache.ts), not Next.js's data cache —
 * OpenNext incremental-cache behavior is not a reliable/available store on
 * the Free plan. The DB-unavailable fallback shell must never be persisted,
 * and the cached snapshot must no longer carry the raw per-gig gallery.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readRepo = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')

const landing = readRepo('app/marketplace/PublicMarketplaceLanding.tsx')
const display = readRepo('lib/marketplaceDisplay.ts')

describe('landing KV path — explicit versioned cache only', () => {
  it('has no Next.js data-cache wrapper left on the landing', () => {
    expect(landing).not.toContain('unstable_cache')
    expect(landing).not.toContain('next/cache')
    expect(landing).not.toContain('loadLandingDataCached')
  })

  it('reads and writes the versioned `gigs` KV entry', () => {
    expect(landing).toContain(
      "import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'",
    )
    expect(landing).toContain("generateVersionedCacheKey('gigs', LANDING_CACHE_PATH, LANDING_CACHE_QUERY)")
    expect(landing).toContain('getCached<LandingData>(cacheKey, LANDING_CACHE_TTL_SECONDS)')
    expect(landing).toContain('setCached(cacheKey, fresh, LANDING_CACHE_TTL_SECONDS)')
    expect(landing).toContain('const LANDING_CACHE_TTL_SECONDS = 300')
    expect(landing).toContain("const LANDING_CACHE_PATH = '/marketplace-landing'")
  })

  it('the component consumes the cached loader directly (no second cache layer)', () => {
    expect(landing).toContain('const data = await loadLandingData()')
    expect(landing).not.toMatch(/await\s+loadLandingData\w*Cached\(/)
  })

  it('recomputes on miss but never persists the DB-unavailable fallback shell', () => {
    const computeIdx = landing.indexOf('const fresh = await computeLandingData()')
    const bailIdx = landing.indexOf('if (!fresh) return fallbackLandingData()')
    const writeIdx = landing.indexOf('await setCached(cacheKey, fresh, LANDING_CACHE_TTL_SECONDS)')

    expect(computeIdx).toBeGreaterThan(-1)
    expect(bailIdx).toBeGreaterThan(computeIdx)
    expect(writeIdx).toBeGreaterThan(bailIdx)
  })

  it('shares the facet entry with the gig-facets API (no second COUNT fan-out)', () => {
    expect(landing).toContain('getCachedFacetCounts()')
    expect(landing).toContain('setCachedFacetCounts(counts)')
  })
})

describe('landing payload trim — raw gallery is not cached/serialized', () => {
  it('LandingGig marks the source gallery as shape-only (not part of the snapshot)', () => {
    expect(display).toContain('gallery_images?: Array<{ url: string }>')
  })

  it('the shaped gig keeps the resolved cover and drops the raw gallery', () => {
    expect(landing).toContain('cover_image_url: resolveCoverUrl(row),')
    expect(landing).not.toContain('gallery_images: gallery')
    expect(landing).not.toContain('normalizeGallery')
    // The DB select still needs the raw column to resolve the cover from it.
    expect(landing).toContain('gallery_images, tiers:gig_tiers')
  })
})
