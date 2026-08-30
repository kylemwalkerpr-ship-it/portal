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
      backfilled: false,
    })
  })
})
