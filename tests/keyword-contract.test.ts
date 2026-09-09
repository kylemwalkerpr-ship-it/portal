import {
  keywordContractForDraft,
  keywordSeverityForType,
  pruneUnplaceableSynthesizedKeywords,
  renderKeywordContractBrief,
  resolveKeywordContract,
  sanitizeBriefOutline,
} from '@/lib/seoFactory/keywordContract'

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

  it('legacy fabricated strings are dropped and the long-tail floor is refilled', () => {
    const contract = resolveKeywordContract({
      primaryKeyword: 'estimated tax payment help',
      requiredShortKeywords: ['estimated tax requirements', 'estimated tax eligibility', 'tax payment help', 'irs payment plan', 'tax deadline help'],
      requiredLongTailKeywords: [
        'requirements for a estimated tax payment help',
        'estimated tax payment help in 2026 explained',
        'estimated tax payment help checklist and timeline',
        'estimated tax payment help for international students',
      ],
    })
    const markerTerms = [
      'requirements for a estimated tax payment help',
      'estimated tax payment help in 2026 explained',
      'estimated tax payment help checklist and timeline',
    ]
    for (const term of markerTerms) {
      expect(contract.requiredLongTailKeywords).not.toContain(term)
      expect(contract.longTailKeywordTerms.find((t) => t.term === term)).toBeUndefined()
    }
    expect(contract.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
    expect(contract.requiredLongTailKeywords).toContain('estimated tax payment help for international students')
    expect(contract.backfilled).toBe(false)
  })
})

describe('pruneUnplaceableSynthesizedKeywords — synthesized warnings resolve at the gate', () => {
  const body = `# Estimated Tax Payment Help for Visa Holders

## In 60 seconds

- Estimated tax payment help for visa holders covers quarterly payments.

## FAQ

### How do I make estimated tax payments?

Estimate your tax, divide it into four payments, and send them by the quarterly deadlines.

## Sources

- [IRS](https://www.irs.gov/)
`

  it('evicts fabrication-marker filler first, replaces leftovers with fresh natural terms, and keeps the count floor', () => {
    const src = {
      content: body,
      primaryKeyword: 'estimated tax payment help',
      requiredShortKeywords: [
        'estimated tax eligibility',
        'estimated tax requirements',
        'tax payment help',
        'irs payment plan',
        'quarterly tax dates',
        'tax deadline help',
      ],
      requiredLongTailKeywords: [
        'requirements for a estimated tax payment help',
        'estimated tax payment help for international students',
        'estimated tax payment help in 2026 explained',
        'estimated tax payment help checklist and timeline',
        'estimated tax payment help for f1 students',
      ],
      shortKeywordTerms: [
        { term: 'estimated tax eligibility', source: 'synthesized' },
        { term: 'estimated tax requirements', source: 'synthesized' },
        { term: 'tax payment help', source: 'demand' },
        { term: 'irs payment plan', source: 'demand' },
        { term: 'quarterly tax dates', source: 'demand' },
        { term: 'tax deadline help', source: 'demand' },
      ],
      longTailKeywordTerms: [
        { term: 'requirements for a estimated tax payment help', source: 'synthesized' },
        { term: 'estimated tax payment help for international students', source: 'synthesized' },
        { term: 'estimated tax payment help in 2026 explained', source: 'synthesized' },
        { term: 'estimated tax payment help checklist and timeline', source: 'synthesized' },
        { term: 'estimated tax payment help for f1 students', source: 'demand' },
      ],
    }
    const pruned = pruneUnplaceableSynthesizedKeywords(src)
    // One gate run evicts the unplaceable marker filler…
    expect(pruned.requiredLongTailKeywords).not.toContain('requirements for a estimated tax payment help')
    // …and swaps any marker still held by the floor for fresh GRAMMATICAL
    // template terms (never "for a estimated …", never "…in 2026 explained").
    expect(pruned.requiredLongTailKeywords).not.toContain('estimated tax payment help in 2026 explained')
    expect(pruned.requiredLongTailKeywords).not.toContain('estimated tax payment help checklist and timeline')
    // Floor preserved, demand terms untouched.
    expect(pruned.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
    expect(pruned.requiredLongTailKeywords).toContain('estimated tax payment help for f1 students')
    expect(pruned.pruned).toBeGreaterThan(0)
    // Idempotent: a second run on the pruned contract is a no-op.
    const again = pruneUnplaceableSynthesizedKeywords({ ...src, ...pruned })
    expect(again.pruned).toBe(0)
    expect(again.requiredLongTailKeywords).toEqual(pruned.requiredLongTailKeywords)
  })

  it('never drops below the floor even when every synthesized term is uncovered', () => {
    const pruned = pruneUnplaceableSynthesizedKeywords({
      content: body,
      requiredShortKeywords: ['a', 'b', 'c', 'd', 'e'],
      requiredLongTailKeywords: ['x y z w a', 'x y z w b', 'x y z w c', 'x y z w d'],
      shortKeywordTerms: ['a', 'b', 'c', 'd', 'e'].map((term) => ({ term, source: 'synthesized' as const })),
      longTailKeywordTerms: ['x y z w a', 'x y z w b', 'x y z w c', 'x y z w d'].map((term) => ({ term, source: 'synthesized' as const })),
    })
    expect(pruned.requiredShortKeywords.length).toBe(5)
    expect(pruned.requiredLongTailKeywords.length).toBe(4)
  })
})

describe('keywordContractForDraft — briefing and pipeline share one sealed list', () => {
  it('does not re-partition when the brief already meets the floors', () => {
    const short = ['student visa', 'visa fee', 'australia visa', 'fee increase', 'visa cost']
    const longTail = [
      'australia student visa fee increase',
      'student visa fees in australia',
      'how to pay student visa fees',
      'australia visa fee guide 2026',
    ]
    const contract = keywordContractForDraft({
      primaryKeyword: 'australia student visa fee',
      requiredShortKeywords: short,
      requiredLongTailKeywords: longTail,
      shortKeywordTerms: short.map((term) => ({ term, source: 'demand' as const })),
      longTailKeywordTerms: longTail.map((term) => ({ term, source: 'demand' as const })),
    })
    expect(contract.backfilled).toBe(false)
    expect(contract.requiredShortKeywords).toEqual(short)
    expect(contract.requiredLongTailKeywords).toEqual(longTail)
    expect(contract.shortKeywordTerms.every((t) => t.source === 'demand')).toBe(true)
  })

  it('drops unplaceable FAQ-question strings so Harper never hard-blocks them', () => {
    const contract = keywordContractForDraft({
      primaryKeyword: 'student visa',
      requiredShortKeywords: ['student visa', 'visa fee', 'visa cost', 'visa rules', 'visa help'],
      requiredLongTailKeywords: [
        'how much is a student visa?',
        'requirements for a student visa',
        'student visa processing time australia',
        'student visa documents checklist 2026',
      ],
      shortKeywordTerms: ['student visa', 'visa fee', 'visa cost', 'visa rules', 'visa help'].map((term) => ({ term, source: 'demand' as const })),
      longTailKeywordTerms: [
        { term: 'how much is a student visa?', source: 'demand' },
        { term: 'requirements for a student visa', source: 'demand' },
        { term: 'student visa processing time australia', source: 'demand' },
        { term: 'student visa documents checklist 2026', source: 'demand' },
      ],
    })
    expect(contract.requiredLongTailKeywords).not.toContain('how much is a student visa?')
    expect(contract.requiredLongTailKeywords).not.toContain('requirements for a student visa')
    expect(contract.requiredLongTailKeywords).toContain('student visa processing time australia')
    expect(contract.requiredLongTailKeywords.length).toBeGreaterThanOrEqual(4)
    expect(contract.longTailKeywordTerms.find((t) => t.term === 'student visa processing time australia')?.source).toBe('demand')
  })
})

describe('renderKeywordContractBrief', () => {
  it('labels demand as required coverage and synthesized as discover-only (never stuff)', () => {
    const brief = renderKeywordContractBrief({
      requiredShortKeywords: ['student visa', 'visa fee'],
      requiredLongTailKeywords: ['how to apply student visa', 'student visa in 2026 explained'],
      shortKeywordTerms: [
        { term: 'student visa', source: 'demand' },
        { term: 'visa fee', source: 'synthesized' },
      ],
      longTailKeywordTerms: [
        { term: 'how to apply student visa', source: 'demand' },
        { term: 'student visa in 2026 explained', source: 'synthesized' },
      ],
      backfilled: false,
    }, 'student visa')
    expect(brief).toContain('KEYWORD CONTRACT')
    expect(brief).toContain('"student visa"')
    expect(brief).toContain('"how to apply student visa"')
    expect(brief).toContain('SYNTHESIZED floor-fill')
    expect(brief).toContain('"visa fee"')
    expect(brief).toContain('never a ship blocker')
    expect(brief).toContain('recommended ≤3 natural placements')
    expect(brief).toContain('A long-tail is satisfied if the meaning is answered')
    expect(brief).toMatch(/discover-only/i)
    expect(brief).not.toMatch(/place only if natural/i)
    expect(brief).not.toMatch(/Echo these exact phrases/i)
    expect(brief).toContain('do NOT place these phrases')
  })

  it('does not tell the writer to stuff synthesized floor-fill', () => {
    const brief = renderKeywordContractBrief({
      requiredShortKeywords: ['visa fee'],
      requiredLongTailKeywords: ['student visa in 2026 explained'],
      shortKeywordTerms: [{ term: 'visa fee', source: 'synthesized' }],
      longTailKeywordTerms: [{ term: 'student visa in 2026 explained', source: 'synthesized' }],
      backfilled: true,
    })
    expect(brief.toLowerCase()).not.toMatch(/place (only if natural|synthesized)/)
    expect(brief).toContain('do NOT place these phrases')
    expect(brief).toContain('analytics-only')
  })
})

describe('keywordSeverityForType — coverage not stuffing', () => {
  it('synthesized is always a warning', () => {
    expect(keywordSeverityForType('legal_guide', 'synthesized')).toBe('warning')
    expect(keywordSeverityForType('blog_post', 'synthesized')).toBe('warning')
  })

  it('demand shorts are blockers on legal/article/regional, warnings on blogs/news', () => {
    expect(keywordSeverityForType('legal_guide', 'demand')).toBe('blocker')
    expect(keywordSeverityForType('article', 'demand')).toBe('blocker')
    expect(keywordSeverityForType('regional_page', 'demand')).toBe('blocker')
    expect(keywordSeverityForType('regional_university', 'demand')).toBe('blocker')
    expect(keywordSeverityForType('blog_post', 'demand')).toBe('warning')
    expect(keywordSeverityForType('blog_summary', 'demand')).toBe('warning')
    expect(keywordSeverityForType('news_summary', 'demand')).toBe('warning')
  })
})

describe('sanitizeBriefOutline — never ship H2s Harper cannot rewrite', () => {
  it('drops question-mark FAQ items and verbatim keyword pastes, keeps structural headings', () => {
    const outline = sanitizeBriefOutline(
      [
        'In 60 seconds',
        'student visa',
        'How much is a student visa?',
        'Eligibility and requirements',
        'FAQ',
        'Sources',
      ],
      ['student visa', 'visa fee'],
    )
    expect(outline).toEqual([
      'In 60 seconds',
      'Eligibility and requirements',
      'FAQ',
      'Sources',
    ])
  })
})
