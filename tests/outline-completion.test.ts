import {
  canonicalOutlineForGate,
  completeMissingOutlineSections,
  insertSectionBeforeFaqOrSources,
  parseGeneratedOutlineSection,
  outlineCompletionErrorMessage,
} from '@/lib/seoFactory/outlineCompletion'

describe('insertSectionBeforeFaqOrSources', () => {
  it('inserts before FAQ', () => {
    const body = '## Eligibility\n\nProse.\n\n## FAQ\n\n### Q?\n\nA.\n'
    const out = insertSectionBeforeFaqOrSources(body, '## Worked Example\n\nA realistic case.')
    expect(out.indexOf('## Worked Example')).toBeGreaterThan(-1)
    expect(out.indexOf('## Worked Example')).toBeLessThan(out.indexOf('## FAQ'))
  })

  it('appends when there is no FAQ or Sources', () => {
    const body = '## Eligibility\n\nProse.\n'
    const out = insertSectionBeforeFaqOrSources(body, '## Worked Example\n\nA realistic case.')
    expect(out.trim().endsWith('A realistic case.')).toBe(true)
  })
})

describe('canonicalOutlineForGate', () => {
  it('prefers contentSpec.outline over h2Outline', () => {
    const spec = { outline: [{ heading: 'From spec', level: 2 as const, purpose: 'p' }] }
    const out = canonicalOutlineForGate(spec, ['From brief'])
    expect(out?.[0].heading).toBe('From spec')
  })

  it('falls back to h2Outline', () => {
    const out = canonicalOutlineForGate(null, ['Eligibility', 'FAQ'])
    expect(out?.map((o) => o.heading)).toEqual(['Eligibility', 'FAQ'])
  })
})

describe('completeMissingOutlineSections', () => {
  it('inserts generated bodies for missing H2s', async () => {
    const article = `## Eligibility\n\nEnough prose here.\n\n## FAQ\n\n### Q?\n\nA.\n`
    const result = await completeMissingOutlineSections({
      content: article,
      outline: [
        { heading: 'Eligibility' },
        { heading: 'Worked Example' },
        { heading: 'FAQ' },
      ],
      generateSection: async ({ heading }) =>
        `This is a generated ${heading} section with enough words to pass the length floor for outline completion so the helper accepts it as real prose rather than a stub. `.repeat(3),
    })
    expect(result.inserted).toEqual(['Worked Example'])
    expect(result.remaining).toEqual([])
    expect(result.stoppedForBudget).toBe(false)
    expect(result.content).toContain('## Worked Example')
    expect(result.content.indexOf('## Worked Example')).toBeLessThan(result.content.indexOf('## FAQ'))
  })

  it('lists remaining headings when generation fails', async () => {
    const article = `## Eligibility\n\nProse.\n`
    const result = await completeMissingOutlineSections({
      content: article,
      outline: [{ heading: 'Worked Example' }],
      generateSection: async () => null,
    })
    expect(result.inserted).toEqual([])
    expect(result.remaining).toEqual(['Worked Example'])
    expect(result.stoppedForBudget).toBe(false)
    expect(outlineCompletionErrorMessage(result.remaining)).toContain('Worked Example')
    expect(outlineCompletionErrorMessage(result.remaining)).toMatch(/EditorPatch cannot add headings/)
  })
})

describe('parseGeneratedOutlineSection', () => {
  it('rejects stubs under 120 chars', () => {
    expect(parseGeneratedOutlineSection('Too short.')).toBeNull()
  })
})

describe('completeMissingOutlineSections — word budget fail-closed (P0-GEN-3)', () => {
  it('stops inserting when body is already at/over maxWords and reports remaining', async () => {
    const filler = Array.from({ length: 30 }, (_, i) =>
      `Paragraph ${i} covers eligibility documents fees timelines and pitfalls for applicants in 2026 with practical detail.`,
    ).join('\n\n')
    const article = `## Eligibility\n\n${filler}\n\n## FAQ\n\n### Q?\n\nA.\n`
    const result = await completeMissingOutlineSections({
      content: article,
      outline: [
        { heading: 'Eligibility' },
        { heading: 'Worked Example' },
        { heading: 'Costs' },
        { heading: 'FAQ' },
      ],
      maxWords: 50,
      generateSection: async ({ heading }) =>
        `Generated ${heading} section with enough words to pass the outline completion length floor for real prose content. `.repeat(4),
    })
    expect(result.stoppedForBudget).toBe(true)
    expect(result.inserted).toEqual([])
    expect(result.remaining).toEqual(expect.arrayContaining(['Worked Example', 'Costs']))
  })

  it('stops further inserts once an insert pushes the body to maxWords', async () => {
    const article = `## Eligibility\n\nShort opener.\n\n## FAQ\n\n### Q?\n\nA.\n`
    let calls = 0
    const result = await completeMissingOutlineSections({
      content: article,
      outline: [
        { heading: 'Eligibility' },
        { heading: 'Worked Example' },
        { heading: 'Costs' },
        { heading: 'FAQ' },
      ],
      maxWords: 80,
      maxPasses: 2,
      maxSectionsPerPass: 3,
      generateSection: async ({ heading }) => {
        calls++
        return (
          `Generated ${heading} section with enough words to pass the outline completion length floor for real prose content about documents fees and timelines. `.repeat(5)
        )
      },
    })
    expect(result.stoppedForBudget).toBe(true)
    expect(result.inserted.length).toBeGreaterThanOrEqual(1)
    expect(result.remaining.length).toBeGreaterThan(0)
    expect(calls).toBeLessThan(3)
  })
})
