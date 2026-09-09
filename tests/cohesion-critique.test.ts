import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  critiqueCohesion,
  factTokens,
  factsWerePreserved,
} from '@/lib/seoFactory/cohesionCritique'

function para(opener: string, rest: string): string {
  return `${opener} ${rest}`
}

describe('critiqueCohesion', () => {
  it('scores unique, non-overlapping sections high', () => {
    const content = `# Student visa guide

Applicants start with an admission letter from a SEVP-certified school.

## Eligibility

Admission, financial evidence, and a valid passport are the first checks. Consular officers also weigh home ties.

## Documents

The I-20, SEVIS fee receipt, and bank statements belong in one folder. Bring originals to the interview.

## Costs

Government filing fees and SEVIS charges are published on official schedules. Attorney retainers sit on top of those.

## FAQ

### How long does processing take?

Times vary by embassy and season.

## Sources

- https://www.uscis.gov/
`
    const { score, findings } = critiqueCohesion(content)
    expect(findings).toEqual([])
    expect(score).toBe(100)
  })

  it('lowers the score when the same first four words open ≥3 paragraphs', () => {
    const body = para('Applicants should gather documents', 'before they file the petition in 2026.')
    const content = `# Guide

${body}

${body}

${body}

## Eligibility

Different section about funding rules and interview preparation for the consulate.
`
    const { score, findings } = critiqueCohesion(content)
    expect(findings.some((f) => f.code === 'repeated_paragraph_opener')).toBe(true)
    expect(score).toBeLessThanOrEqual(92)
  })

  it('flags adjacent H2 bodies with high token overlap', () => {
    const repeated =
      'Eligibility checks require a valid passport financial evidence admission letters SEVIS registration and interview preparation for consular officers reviewing the same packet of supporting materials.'
    const content = `# Guide

Intro with a distinct thesis about the student route.

## Eligibility

${repeated}

## Documents

${repeated}

## Costs

Filing fees follow a published government schedule that does not overlap those checks.
`
    const { findings, score } = critiqueCohesion(content)
    expect(findings.some((f) => f.code === 'adjacent_section_overlap')).toBe(true)
    expect(score).toBeLessThan(100)
  })

  it('flags FAQ questions that duplicate H2 titles and extra TL;DR blocks', () => {
    const content = `# Guide

A unique opening.

## In 60 seconds

- First summary of the process.

## Eligibility

Admission and funding checks.

## In 60 seconds

- Second summary of the same process.

## FAQ

### Eligibility

This restates the H2.
`
    const { findings, score } = critiqueCohesion(content)
    expect(findings.some((f) => f.code === 'faq_duplicates_h2')).toBe(true)
    expect(findings.some((f) => f.code === 'multiple_tldr_blocks')).toBe(true)
    expect(score).toBe(Math.max(0, 100 - 8 * findings.length))
  })
})

describe('factTokens / factsWerePreserved (author-revise reject helper)', () => {
  const original = `# Guide

See https://www.uscis.gov/i-20 for form I-20. Applicants must not promise an outcome. The SEVIS fee is 350 in 2026.

**Disclaimer:** This page is educational. It is **not legal advice**.
`

  it('extracts URLs, numbers, and legal qualifiers', () => {
    const tokens = factTokens(original)
    expect(tokens.some((t) => t.includes('uscis.gov'))).toBe(true)
    expect(tokens).toEqual(expect.arrayContaining(['350', '2026']))
    expect(tokens.some((t) => t.includes('must not'))).toBe(true)
  })

  it('accepts a rewrite that keeps facts and the disclaimer', () => {
    const revised = `# Guide

Form I-20 is explained at https://www.uscis.gov/i-20. Applicants must not promise an outcome. The SEVIS fee remains 350 in 2026.

**Disclaimer:** This page is educational. It is **not legal advice**.
`
    expect(factsWerePreserved(original, revised).ok).toBe(true)
  })

  it('rejects when a URL, number, or disclaimer disappears', () => {
    expect(factsWerePreserved(original, '# Guide\n\nNo facts left.\n').ok).toBe(false)
    expect(factsWerePreserved(original, original.replace('https://www.uscis.gov/i-20', '')).ok).toBe(false)
    expect(factsWerePreserved(original, original.replace('**Disclaimer:**', 'Note:')).ok).toBe(false)
  })
})

describe('author-revise route contract', () => {
  it('is exclusive reviewer policy with skipQualityContract false', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'app/api/content-studio/author-revise/route.ts'),
      'utf8',
    )
    expect(source).toContain('exclusive: true')
    expect(source).toContain('cascadeOnCapacity: false')
    expect(source).toContain('DEFAULT_REVIEW_PIN')
    expect(source).toContain('skipQualityContract: false')
    expect(source).toContain('factsWerePreserved')
    expect(source).toContain('rejected: true')
    expect(source).toContain('maxDuration = 180')
  })
})
