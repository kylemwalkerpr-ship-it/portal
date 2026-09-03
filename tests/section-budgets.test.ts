import { buildSectionBudgets, buildFactoryUserPrompt, syncSectionBudgetsToOutline } from '../lib/seoFactory/prompts'
import { partitionKeywords } from '../lib/seoEngine/planner'

describe('strict per-section budgets (single-run drafter contract)', () => {
  const sections = [
    { heading: 'In 60 seconds', targetWords: 80 },
    { heading: 'Who qualifies for a US green card', targetWords: 400 },
    { heading: 'Step-by-step green card application process', targetWords: 450 },
    { heading: 'Required documents and filing fees', targetWords: 450 },
    { heading: 'Worked Example', targetWords: 300 },
    { heading: 'Common application mistakes', targetWords: 300 },
    { heading: 'FAQ', targetWords: 450 },
    { heading: 'Sources', targetWords: 80 },
  ]

  it('allocates the page window across sections and reserves structural blocks', () => {
    const budgets = buildSectionBudgets({ sections, pageMin: 2200, pageMax: 2500 })
    expect(budgets.length).toBe(sections.length)
    const faq = budgets.find((b) => b.heading === 'FAQ')!
    const tldr = budgets.find((b) => b.heading === 'In 60 seconds')!
    expect(faq.maxWords).toBeGreaterThanOrEqual(320)
    expect(tldr.maxWords).toBeLessThanOrEqual(80)
    const bodyTotal = budgets.filter((b) => !/60 seconds|faq|sources/i.test(b.heading)).reduce((a, b) => a + b.maxWords, 0)
    expect(bodyTotal).toBeLessThanOrEqual(2500)
  })

  it('produces ranges the sum stays inside the window for the content body', () => {
    const budgets = buildSectionBudgets({ sections, pageMin: 2200, pageMax: 2500 })
    const maxSum = budgets.reduce((a, b) => a + b.maxWords, 0)
    expect(maxSum).toBeLessThanOrEqual(2500)
    expect(maxSum).toBeGreaterThanOrEqual(2200)
  })

  it('Σ section MINIMUMS reach the page floor — meeting every section min lands at 2200 (single-run invariant)', () => {
    // The restart loophole: if Σ(mins) < pageMin, a drafter that honours
    // every section minimum is still "under par" and may append a second
    // copy in pursuit of the global count. The contract must close that gap.
    for (const [type, pageMin, pageMax] of [
      ['article', 2200, 2500],
      ['blog_post', 800, 1200],
      ['regional_page', 1200, 2000],
    ] as const) {
      const budgets = buildSectionBudgets({ sections, pageMin, pageMax })
      const minSum = budgets.reduce((a, b) => a + b.minWords, 0)
      expect(minSum).toBeGreaterThanOrEqual(pageMin)
      const maxSum = budgets.reduce((a, b) => a + b.maxWords, 0)
      expect(maxSum).toBeLessThanOrEqual(pageMax)
      // Sanity: every section's range is coherent.
      for (const b of budgets) {
        expect(b.maxWords).toBeGreaterThanOrEqual(b.minWords)
        expect(b.minWords).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('blog_post window (800–1200) also satisfies the sum invariants with a longer outline', () => {
    const blogSections = sections.concat([
      { heading: 'Best banks for international students', targetWords: 300 },
      { heading: 'Common mistakes to avoid', targetWords: 250 },
    ])
    const budgets = buildSectionBudgets({ sections: blogSections, pageMin: 800, pageMax: 1200 })
    const minSum = budgets.reduce((a, b) => a + b.minWords, 0)
    const maxSum = budgets.reduce((a, b) => a + b.maxWords, 0)
    expect(minSum).toBeGreaterThanOrEqual(800)
    expect(maxSum).toBeLessThanOrEqual(1200)
  })

  it('renders the STRICT SECTION BUDGETS block in the drafter prompt when provided', () => {
    const budgets = buildSectionBudgets({ sections, pageMin: 2200, pageMax: 2500 })
    const prompt = buildFactoryUserPrompt({
      title: 'Green Card Guide', topic: 'green card', primaryKeyword: 'how to apply for a green card',
      region: 'US', contentType: 'legal_guide', tone: 'educational', gscBlock: '',
      sectionBudgets: budgets,
    })
    expect(prompt).toContain('ABSOLUTE SECTION QUOTAS')
    expect(prompt).toMatch(/MUST be \d+–\d+ body words \(inclusive\)/)
    expect(prompt).toContain('## FAQ:')
    expect(prompt).toMatch(/never echo the brief, never paste a previous draft, never append a second copy/i)
  })

  it('omits the block when no budgets are supplied', () => {
    const prompt = buildFactoryUserPrompt({
      title: 'Green Card Guide', topic: 'green card', primaryKeyword: 'green card',
      region: 'US', contentType: 'legal_guide', tone: 'educational', gscBlock: '',
    })
    expect(prompt).not.toContain('ABSOLUTE SECTION QUOTAS')
  })
})

describe('syncSectionBudgetsToOutline', () => {
  it('keeps existing ranges when headings are reordered and rebuilds for a new H2', () => {
    const existing = [
      { heading: 'FAQ', minWords: 200, maxWords: 320 },
      { heading: 'Eligibility', minWords: 400, maxWords: 600 },
    ]
    const synced = syncSectionBudgetsToOutline(
      ['Eligibility', 'Documents', 'FAQ'],
      existing,
      { pageMin: 800, pageMax: 1200, pageTarget: 1000 },
    )
    expect(synced.map((s) => s.heading)).toEqual(['Eligibility', 'Documents', 'FAQ'])
    expect(synced.every((s) => s.minWords > 0 && s.maxWords >= s.minWords)).toBe(true)
    const minSum = synced.reduce((a, b) => a + b.minWords, 0)
    const maxSum = synced.reduce((a, b) => a + b.maxWords, 0)
    expect(minSum).toBeGreaterThanOrEqual(800)
    expect(maxSum).toBeLessThanOrEqual(1200)
  })
})

describe('duplicate-phrase synthesis guard (how to apply for how to apply for …)', () => {
  it('never synthesizes the doubled-cadence long-tail for a how-to primary', () => {
    const p = partitionKeywords([], 'how to apply for a green card')
    const doubled = 'how to apply for how to apply for a green card'
    expect(p.longTail).not.toContain(doubled)
    expect(p.longTail.some((t) => t === doubled)).toBe(false)
    // The primary's OWN cadence is preserved, and safe suffix forms exist.
    expect(p.longTail.some((t) => t.includes('how to apply for a green card'))).toBe(true)
  })

  it('still synthesizes normal long-tails for a non-template primary', () => {
    const p = partitionKeywords([], 'uk spouse visa')
    expect(p.longTail.length).toBeGreaterThanOrEqual(4)
    expect(p.longTail.some((t) => t.startsWith('how to apply for uk spouse visa'))).toBe(true)
  })
})