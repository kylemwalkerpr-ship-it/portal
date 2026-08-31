import { resolveKeywordContract } from '@/lib/seoFactory/keywordContract'

describe('canonical job keyword contract', () => {
  it('backfills legacy jobs so editor and ship use the same non-empty floors', () => {
    const contract = resolveKeywordContract({
      primaryKeyword: 'Australia student visa fee increase',
      requiredShortKeywords: [],
      requiredLongTailKeywords: [],
    })
    expect(contract.backfilled).toBe(true)
    expect(contract.requiredShortKeywords.length).toBeGreaterThanOrEqual(5)
    expect(contract.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
    expect(contract.requiredShortKeywords.every((term) => term.split(/\s+/).length <= 3)).toBe(true)
    expect(contract.requiredLongTailKeywords.every((term) => term.split(/\s+/).length >= 4)).toBe(true)
  })

  it('preserves a complete persisted brief contract', () => {
    const short = ['student visa', 'visa fee', 'australia visa', 'fee increase', 'visa cost']
    const longTail = ['australia student visa fee increase', 'student visa fees in australia', 'how to pay student visa fees', 'australia visa fee guide 2026']
    expect(resolveKeywordContract({ primaryKeyword: 'student visa', requiredShortKeywords: short, requiredLongTailKeywords: longTail })).toEqual({
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
      // Caller-supplied terms have no persisted provenance, so they default to
      // real demand and stay enforceable as ship blockers.
      shortKeywordTerms: short.map((term) => ({ term, source: 'demand' })),
      longTailKeywordTerms: longTail.map((term) => ({ term, source: 'demand' })),
      backfilled: false,
    })
  })

  it('round-trips persisted provenance so a re-read never re-promotes filler to demand', () => {
    // First pass: legacy row with no provenance → partitioner backfills.
    const first = resolveKeywordContract({
      primaryKeyword: 'Australia student visa fee increase',
      requiredShortKeywords: ['visa fee'],
      requiredLongTailKeywords: [],
    })
    const synthesized = [...first.shortKeywordTerms, ...first.longTailKeywordTerms]
      .filter((t) => t.source === 'synthesized')
      .map((t) => t.term)
    expect(synthesized.length).toBeGreaterThan(0)

    // Second pass: the row now stores both the terms and their provenance,
    // exactly as content_jobs.short_keyword_terms persists them.
    const second = resolveKeywordContract({
      primaryKeyword: 'Australia student visa fee increase',
      requiredShortKeywords: first.requiredShortKeywords,
      requiredLongTailKeywords: first.requiredLongTailKeywords,
      shortKeywordTerms: first.shortKeywordTerms,
      longTailKeywordTerms: first.longTailKeywordTerms,
    })
    expect(second.backfilled).toBe(false)
    expect(second.shortKeywordTerms).toEqual(first.shortKeywordTerms)
    expect(second.longTailKeywordTerms).toEqual(first.longTailKeywordTerms)
    // Every synthesized term is still synthesized — no silent hard-block revival.
    const stillSynthesized = [...second.shortKeywordTerms, ...second.longTailKeywordTerms]
      .filter((t) => t.source === 'synthesized')
      .map((t) => t.term)
    expect(stillSynthesized.sort()).toEqual(synthesized.sort())
  })

  it('marks partitioner backfill as synthesized so the gate does not hard-block it', () => {
    const contract = resolveKeywordContract({
      primaryKeyword: 'Australia student visa fee increase',
      requiredShortKeywords: ['visa fee'],
      requiredLongTailKeywords: [],
    })
    expect(contract.backfilled).toBe(true)
    const all = [...contract.shortKeywordTerms, ...contract.longTailKeywordTerms]
    // The one term the caller supplied stays demand...
    expect(all.find((t) => t.term === 'visa fee')?.source).toBe('demand')
    // ...and the floors were filled with synthesized terms.
    expect(all.some((t) => t.source === 'synthesized')).toBe(true)
  })
})
