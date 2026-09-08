/**
 * Facets wiring contract (2026-09-08):
 *
 * One source of truth for marketplace chip counts:
 *  1. lib/marketplaceFacets.ts::computeFacetCounts runs the DB COUNTs with
 *     the exact same filters as the listing API:
 *       - jurisdiction counts use jurisdictionCountryOrFilter (OR'd, NULL-inclusive)
 *       - category counts use buildCategoryOrFilter (OR'd, NULL-inclusive)
 *     and NEVER throws — a failed COUNT yields `null`, not 0.
 *  2. The gig-facets API route delegates to the lib (no second count implementation).
 *  3. The landing consumes the same counts and falls back per-field to its
 *     in-memory partition whenever a COUNT didn't resolve — chips can never
 *     claim 0 over a populated grid because of a COUNT hiccup.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { computeFacetCounts, isResolved, isValidFacetCountry, FACET_JX_CODES } from '@/lib/marketplaceFacets'
import { CATEGORIES } from '@/lib/categories'
import { jurisdictionCountryOrFilter } from '@/lib/jurisdictionFilter'

const repoRoot = process.cwd()
const readRepo = (p: string) => readFileSync(path.join(repoRoot, p), 'utf8')

describe('marketplaceFacets — counting contract', () => {
  function fakeDb(handlers: {
    onOrFilter?: (or: string) => number | null
    plainCount?: number | null
    failOnOrContaining?: string
  }) {
    const mkQuery = (state: { or?: string; failed?: boolean }) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        gte: () => q,
        or: (filter: string) => {
          state.or = filter
          return q
        },
        then: (resolve: (v: any) => void, reject: (e: any) => void) => {
          // Awaiting the builder resolves the head-count.
          ;(async () => {
            if (handlers.failOnOrContaining && state.or?.includes(handlers.failOnOrContaining)) {
              throw new Error('boom')
            }
            if (handlers.onOrFilter && state.or) {
              resolve({ count: handlers.onOrFilter(state.or), error: null })
              return
            }
            resolve({ count: handlers.plainCount ?? 0, error: null })
          })().then(resolve, reject)
        },
      }
      return q
    }
    return { from: () => mkQuery({}) }
  }

  test('unfiltered totals: one count per category + 4 jurisdictions + 2 provider types + total', async () => {
    const db = fakeDb({ plainCount: 7 })
    const counts = await computeFacetCounts(db)
    // categoryCounts covers the full taxonomy (top-level ids only)
    for (const cat of CATEGORIES) {
      expect(counts.categoryCounts[cat.id]).toBe(7)
    }
    expect(Object.keys(counts.jurisdictionCounts).sort()).toEqual([...FACET_JX_CODES].sort())
    expect(counts.jurisdictionCounts.us).toBe(7)
    expect(counts.jurisdictionCounts.au).toBe(7)
    expect(counts.providerTypeCounts).toEqual({ attorney: 7, consultant: 7 })
    expect(counts.total).toBe(7)
  })

  test('jurisdiction counts carry the NULL-inclusive OR filter', async () => {
    const seen: string[] = []
    const db = fakeDb({ onOrFilter: (or) => (seen.push(or), 5) })
    const counts = await computeFacetCounts(db)
    for (const j of FACET_JX_CODES) {
      const expected = jurisdictionCountryOrFilter(j)
      expect(seen).toContain(expected)
      expect(counts.jurisdictionCounts[j]).toBe(5)
    }
  })

  test('a failed COUNT resolves to null, never 0', async () => {
    const db = fakeDb({ failOnOrContaining: 'jurisdiction.eq.us' })
    const counts = await computeFacetCounts(db)
    expect(counts.jurisdictionCounts.us).toBeNull()
    // Other jurisdictions still counted
    expect(counts.jurisdictionCounts.uk).not.toBeNull()
  })

  test('isValidFacetCountry gates the country param', () => {
    expect(isValidFacetCountry('us')).toBe(true)
    expect(isValidFacetCountry('au')).toBe(true)
    expect(isValidFacetCountry('de')).toBe(false)
    expect(isValidFacetCountry('')).toBe(false)
    expect(isValidFacetCountry(null)).toBe(false)
    expect(isValidFacetCountry(undefined)).toBe(false)
  })
})

describe('marketplaceFacets — isResolved fallback helper', () => {
  test('null/undefined fall back; 0 is a real count and must NOT fall back', () => {
    expect(isResolved(null)).toBe(false)
    expect(isResolved(undefined)).toBe(false)
    expect(isResolved(0)).toBe(true)
    expect(isResolved(217)).toBe(true)
  })
})

describe('marketplaceFacets — wiring contract', () => {
  test('gig-facets API route delegates to the lib (no second count implementation)', () => {
    const route = readRepo('app/api/marketplace/gig-facets/route.ts')
    expect(route).toContain("from '@/lib/marketplaceFacets'")
    expect(route).toContain('computeFacetCounts(db')
    // The route must not hand-roll its own COUNT fan-out anymore.
    expect(route).not.toMatch(/buildCategoryOrFilter/)
    expect(route).not.toMatch(/jurisdictionCountryOrFilter/)
  })

  test('landing prefers DB facet counts with per-field in-memory fallback', () => {
    const landing = readRepo('app/marketplace/PublicMarketplaceLanding.tsx')
    expect(landing).toContain("from '@/lib/marketplaceFacets'")
    expect(landing).toContain('isResolved(facets?.total)')
    expect(landing).toContain('isResolved(facets?.categoryCounts?.[catId])')
    // Chips render the facet-preferred total, not the raw in-memory one.
    expect(landing).toContain('({chipTotal})')
    expect(landing).toContain('catCountFor(cs.cat.id, cs.count)')
    // Jurisdiction rail cards prefer the DB count too.
    expect(landing).toContain('isResolved(facetCounts.jurisdictionCounts[code])')
  })

  test('landing runs the facet COUNTs in parallel with the inventory pull', () => {
    const landing = readRepo('app/marketplace/PublicMarketplaceLanding.tsx')
    expect(landing).toContain('computeFacetCounts(db)')
    expect(landing).toContain('Promise.all([inventoryP, reviewsP, facetsP])')
  })
})
