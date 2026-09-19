/**
 * Free-plan ISR source contract for the marketplace hubs.
 *
 * Production evidence (main 90d1e6d2): /categories later timed out with
 * `outcome=canceled` and "waitUntil() tasks did not complete within the
 * allowed time after invocation end and have been cancelled." OpenNext is
 * configured with `defineCloudflareConfig({})`, so its incrementalCache /
 * tagCache / queue adapters resolve to the "dummy" defaults and the dummy
 * queue's send() throws. Removing hourly ISR from the deploy-static hubs keeps
 * production on paid-feature-free defaults. The /gigs hub originally stayed
 * per-request against its versioned KV snapshot, but that render exceeded the
 * Workers Free 10ms CPU budget, so it is now build-static too and its
 * query-string discovery moved to a client gate (see
 * tests/marketplace-static-estate-contract.test.ts).
 *
 * These are source contracts, not build assertions: they fail loudly if a
 * future edit reintroduces `export const revalidate` on a static hub, drops
 * the versioned KV read-through from /gigs, or tries to "fix" the Free-plan
 * hang with a paid cpu_ms limit or a paid OpenNext cache adapter.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readRepo = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')

const STATIC_HUBS = [
  'app/shop/page.tsx',
  'app/marketplace/categories/page.tsx',
  'app/marketplace/providers/page.tsx',
] as const

const REVALIDATE_EXPORT = /^\s*export\s+const\s+revalidate\b/m
const DYNAMIC_EXPORT = /^\s*export\s+const\s+dynamic\b/m
const FORCE_DYNAMIC_EXPORT = /^\s*export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/m

const gigHub = readRepo('app/marketplace/gigs/page.tsx')
const openNextConfig = readRepo('open-next.config.ts')
const wrangler = readRepo('wrangler.toml')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n')

for (const hub of STATIC_HUBS) {
  describe(`static hub ${hub}`, () => {
    const source = readRepo(hub)

    it('exports no revalidate (true SSG, not ISR)', () => {
      expect(source).not.toMatch(REVALIDATE_EXPORT)
      expect(source).not.toContain('revalidate')
    })

    it('does not opt into force-dynamic rendering', () => {
      expect(source).not.toMatch(DYNAMIC_EXPORT)
      expect(source).not.toContain('force-dynamic')
    })

    it('still renders its indexable page with canonical metadata', () => {
      expect(source).toMatch(/export\s+default/)
      expect(source).toMatch(/export\s+const\s+metadata\b|export\s+async\s+function\s+generateMetadata/)
      expect(source).toContain('robots: { index: true, follow: true }')
    })
  })
}

describe('gigs hub — true SSG over the versioned KV snapshot', () => {
  it('exports neither dynamic nor revalidate (no per-request render, no ISR)', () => {
    expect(gigHub).not.toMatch(FORCE_DYNAMIC_EXPORT)
    expect(gigHub).not.toMatch(DYNAMIC_EXPORT)
    expect(gigHub).not.toMatch(REVALIDATE_EXPORT)
    expect(gigHub).not.toContain('export const revalidate')
  })

  it('reads/writes the versioned `gigs` KV directory snapshot', () => {
    expect(gigHub).toContain(
      "import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'",
    )
    expect(gigHub).toContain("const GIGS_DIRECTORY_CACHE_PATH = '/cache/gigs-directory'")
    expect(gigHub).toContain("const GIGS_DIRECTORY_CACHE_QUERY = 'v1'")
    expect(gigHub).toContain('const GIGS_DIRECTORY_CACHE_TTL_SECONDS = 300')
    // Same namespace that publish/pause/moderate invalidates via
    // bumpCacheVersion('gigs').
    expect(gigHub).toMatch(/generateVersionedCacheKey\(\s*'gigs'/)
    expect(gigHub).toContain('getCached<HubGig[]>(cacheKey, GIGS_DIRECTORY_CACHE_TTL_SECONDS)')
    expect(gigHub).toContain('setCached(cacheKey, fresh, GIGS_DIRECTORY_CACHE_TTL_SECONDS)')
  })

  it('serves the cached snapshot on hit and recomputes on miss without persisting failures', () => {
    const hitIdx = gigHub.indexOf('if (isHubGigDirectory(cached)) return cached')
    const computeIdx = gigHub.indexOf('const fresh = await computeActiveGigs()')
    const bailIdx = gigHub.indexOf('if (!fresh) return []')
    const writeIdx = gigHub.indexOf(
      'await setCached(cacheKey, fresh, GIGS_DIRECTORY_CACHE_TTL_SECONDS)',
    )

    expect(hitIdx).toBeGreaterThan(-1)
    expect(computeIdx).toBeGreaterThan(hitIdx)
    expect(bailIdx).toBeGreaterThan(computeIdx)
    expect(writeIdx).toBeGreaterThan(bailIdx)
  })

  it('retains the complete service directory contract', () => {
    expect(gigHub).toContain("getMarketplaceCanonicalUrl('/gigs')")
    expect(gigHub).toContain('export default async function MarketplaceServicesHub()')
    expect(gigHub).toContain(".eq('status', 'active')")
    expect(gigHub).toContain(".not('provider_id', 'is', null)")
    expect(gigHub).toContain(".not('slug', 'is', null)")
    expect(gigHub).toContain('.limit(5000)')
    expect(gigHub).toContain('Complete service directory')
    expect(gigHub).toContain('Other services')
    expect(gigHub).toContain('href={`/gigs/${gig.slug}`}')
    expect(gigHub).toContain('gigs.filter((gig) => gig.category === category.id)')
    expect(gigHub).toContain('const uncategorized = gigs.filter(')
  })
})

describe('no paid-plan escape hatch was added for the Free-plan hang', () => {
  it('wrangler.toml still sends no paid [limits] / cpu_ms / subrequests block', () => {
    expect(wrangler).not.toMatch(/^\s*\[limits\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*cpu_ms\s*=/m)
    expect(wrangler).not.toMatch(/^\s*subrequests\s*=/m)
  })

  it('open-next.config.ts keeps the default (dummy) adapters', () => {
    expect(openNextConfig).toMatch(/defineCloudflareConfig\(\{\s*\}\)/)
    expect(openNextConfig).not.toMatch(
      /incrementalCache|tagCache|queue|r2IncrementalCache|d1NextTagCache|shardedD1TagCache|doQueue/,
    )
  })
})
