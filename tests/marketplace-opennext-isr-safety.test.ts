import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(file, 'utf8')

const marketRouteFiles = [
  'app/marketplace/page.tsx',
  'app/marketplace/gigs/page.tsx',
  'app/marketplace/gigs/[slug]/page.tsx',
  'app/marketplace/categories/page.tsx',
  'app/marketplace/providers/page.tsx',
  'app/shop/page.tsx',
]

const staticMarketHubs = [
  'app/marketplace/gigs/page.tsx',
  'app/marketplace/categories/page.tsx',
  'app/marketplace/providers/page.tsx',
  'app/shop/page.tsx',
]

describe('Marketplace OpenNext ISR safety contract', () => {
  it('does not use numeric route-level revalidation without a configured cache + queue', () => {
    const openNext = read('open-next.config.ts')
    const hasIncrementalCache = /\bincrementalCache\s*:/.test(openNext)
    const hasQueue = /\bqueue\s*:/.test(openNext)

    expect(hasIncrementalCache).toBe(false)
    expect(hasQueue).toBe(false)

    for (const file of marketRouteFiles) {
      expect(read(file)).not.toMatch(/export const revalidate\s*=\s*\d+/)
    }
  })

  it('keeps prerenderable public hubs as true build-time SSG', () => {
    for (const file of staticMarketHubs) {
      expect(read(file)).toContain('export const revalidate = false')
    }
  })

  it('keeps dynamic landing and gig detail off route-level ISR', () => {
    expect(read('app/marketplace/page.tsx')).not.toContain('export const revalidate')
    expect(read('app/marketplace/gigs/[slug]/page.tsx')).not.toContain('export const revalidate')
  })
})
