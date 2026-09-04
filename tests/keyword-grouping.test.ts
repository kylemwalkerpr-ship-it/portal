import { groupKeywords, clusterLabel, DEFAULT_CLUSTERING_CONFIG } from '@/lib/seoFactory/keywordGrouping'
import { expandSeedTemplates, type KeywordCandidate } from '@/lib/seoFactory/keywordDiscover'
import { jaccard, tokens } from '@/lib/seoFactory/keywordCluster'

function kw(s: string): KeywordCandidate {
  const normalized = s.toLowerCase()
  return { id: normalized, keyword: s, normalized, source: 'manual', sources: ['manual'] }
}

describe('keyword grouping (Phase 3 Jaccard)', () => {
  it('is deterministic and groups related study-permit phrases', () => {
    const input = [
      kw('canada study permit requirements'),
      kw('canadian student visa requirements'),
      kw('study permit documents canada'),
      kw('uk graduate route'),
    ]
    const a = groupKeywords(input)
    const b = groupKeywords(input)
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    const permit = a.find((c) => c.keywords.length >= 2 && c.keywords.some((k) => k.normalized.includes('study permit')))
    expect(permit).toBeTruthy()
    expect(permit!.keywords.length).toBeGreaterThanOrEqual(2)
    expect(permit!.label.length).toBeGreaterThan(4)
  })

  it('exports a readable label from the dominant phrase', () => {
    expect(clusterLabel(['canada study permit requirements', 'study permit documents canada'])).toMatch(/study permit/i)
  })

  it('jaccard is local and threshold-tunable without code rewrite', () => {
    const a = tokens('canada study permit requirements')
    const b = tokens('study permit documents canada')
    expect(jaccard(a, b)).toBeGreaterThan(0.3)
    const tight = groupKeywords([
      kw('canada study permit requirements'),
      kw('study permit documents canada'),
    ], { jaccardThreshold: 0.99, keepSingletons: true })
    expect(tight.every((c) => c.keywords.length === 1)).toBe(true)
    const loose = groupKeywords([
      kw('canada study permit requirements'),
      kw('study permit documents canada'),
    ], { jaccardThreshold: 0.2, keepSingletons: true })
    expect(loose.some((c) => c.keywords.length >= 2)).toBe(true)
  })

  it('drops singletons when keepSingletons is false', () => {
    const mixed = groupKeywords([
      kw('canada study permit requirements'),
      kw('study permit documents canada'),
      kw('totally unrelated mango smoothie'),
    ], { keepSingletons: false, minClusterSize: 2 })
    expect(mixed.every((c) => c.keywords.length >= 2)).toBe(true)
    expect(mixed.some((c) => c.keywords.some((k) => k.normalized.includes('mango')))).toBe(false)
  })

  it('clusters expanded seeds without a network call', () => {
    const cands = expandSeedTemplates('canada study permit')
    const groups = groupKeywords(cands, DEFAULT_CLUSTERING_CONFIG)
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0].keywords.length).toBeGreaterThanOrEqual(1)
  })
})
