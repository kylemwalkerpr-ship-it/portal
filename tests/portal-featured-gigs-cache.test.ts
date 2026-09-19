import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const featured = read('components/design/landing/data/featured-services.ts')
const featuredCode = featured
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n')
const portalRoot = read('app/page.tsx')

describe('portal landing featured gigs cache contract', () => {
  test('does not use Next writable data cache under read-only OpenNext cache', () => {
    expect(featuredCode).not.toContain("from 'next/cache'")
    expect(featuredCode).not.toContain('unstable_cache')
    expect(featuredCode).not.toContain('getFeaturedGigsCached')
  })

  test('keeps the explicit KV read-through cache and DB fallback', () => {
    expect(featured).toContain("const KV_CACHE_KEY = 'featured-gigs'")
    expect(featured).toContain('getCached<FeaturedGig[]>(KV_CACHE_KEY, KV_CACHE_TTL)')
    expect(featured).toContain('const result = await fetchFeaturedGigsFromDb()')
    expect(featured).toContain('setCached(KV_CACHE_KEY, result, KV_CACHE_TTL).catch(() => {})')
  })

  test('portal root stays build-static', () => {
    expect(portalRoot).not.toMatch(/^\s*export\s+const\s+revalidate\b/m)
    expect(portalRoot).not.toContain('force-dynamic')
  })
})
