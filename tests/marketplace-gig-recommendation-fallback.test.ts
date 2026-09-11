import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace gig recommendation fallback', () => {
  const route = read('app/api/marketplace/gigs/[slug]/route.ts')

  test('builds recommendations from provider, category, then jurisdiction inventory', () => {
    expect(route).toContain('providerGigs.filter((candidate: any) => candidate.id !== gig.id)')
    expect(route).toContain('...(sameCategoryRes.data || [])')
    expect(route).toContain('...(sameJurisdictionRes.data || [])')
    expect(route).toContain(".eq('jurisdiction', gig.jurisdiction)")
    expect(route).toContain(".eq('category', gig.category)")
  })

  test('deduplicates and caps the discovery rail without returning the current gig', () => {
    expect(route).toContain('seenRecommendationIds.has(candidate.id)')
    expect(route).toContain('candidate.id === gig.id')
    expect(route).toContain('.slice(0, 6)')
    expect(route).toContain('similar_gigs: normalizedSimilar')
  })

  test('keeps recommendation queries in the existing parallel enrichment fan-out', () => {
    expect(route).toContain('Promise.all([')
    expect(route).toContain('sameCategoryRes')
    expect(route).toContain('sameJurisdictionRes')
    expect(route).toContain(".order('rank_score', { ascending: false })")
  })
})
