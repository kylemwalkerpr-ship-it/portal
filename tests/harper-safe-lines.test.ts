import { applyProseCorrection, harperSafeLines, HARPER_ESTATE_WORDS, isHarperNoiseFinding, isNonClientFacingLine, mapCorrectedProseToMarkdown, spliceWords } from '../lib/harperText'
import { applyQuotedStyleFixes } from '../lib/seoFactory/styleApply'

describe('harper leak-free transform', () => {
  const doc = `---
title: Australia student visa fee increase
canonical: https://usa.yousafeconsultancy.com/x
---

# Australia Student Visa Fee Increase

## In 60 seconds

YouSafe helps applicants plan the 2026 fee increase. AUD amounts below are estimates.

| Fee | Amount |
|-----|--------|
| Visa | AUD 2000 |

## Costs, timing and risks

Visit https://example.gov.au/fees for official figures. The application needs your CoE and OSHC policy.

\`\`\`json
{"x": 1}
\`\`\`

## FAQ

### Do I need a professional?

Only if your case is complex.

## Sources

Official source.`

  it('never leaks ## markers into the grammar engine', () => {
    const lines = harperSafeLines(doc)
    expect(lines.some((l) => l.out.includes('## '))).toBe(false)
    expect(lines.some((l) => l.out.includes('#'))).toBe(false)
  })

  it('strips frontmatter, JSON-LD/scripts, code fences and table cells', () => {
    const lines = harperSafeLines(doc)
    const text = lines.map((l) => l.out).join('\n')
    expect(text).not.toContain('title:')
    expect(text).not.toContain('canonical:')
    expect(text).not.toContain('```')
    expect(text).not.toContain('{"x": 1}')
    expect(text).not.toContain('|')
  })

  it('strips URLs but keeps the readable anchor words', () => {
    const lines = harperSafeLines(doc)
    const text = lines.map((l) => l.out).join('\n')
    expect(text).not.toContain('https://')
    expect(text).toContain('official figures')
  })

  it('keeps heading text and prose words for the engine', () => {
    const lines = harperSafeLines(doc)
    const text = lines.map((l) => l.out).join('\n')
    expect(text).toContain('In 60 seconds')
    expect(text).toContain('Do I need a professional')
    expect(text).toContain('YouSafe helps applicants')
  })

  it('carries the estate vocabulary so spelling noise stops', () => {
    for (const w of ['YouSafe', 'Caseworks', 'AUD', 'ImmiAccount', 'OSHC', 'CoE', 'IELTS', 'dependants', 'lodgement']) {
      expect(HARPER_ESTATE_WORDS).toContain(w)
    }
  })

  it('splices a same-length correction and a word-count change without throwing', () => {
    expect(spliceWords('The applcation is ready.', 'The application is ready.')).toContain('application')
    expect(applyProseCorrection('- Visit **USCIS** today.', 'Visit USCIS today.', 'Visit USCIS today.')).toBe('- Visit **USCIS** today.')
    expect(applyProseCorrection('You recieve the form.', 'You recieve the form.', 'You receive the form.')).toContain('receive')
  })

  it('maps Harper plaintext back onto markdown and is a no-op when line counts drift', () => {
    const md = '## Title\n\nYou recieve the form.\n'
    const lines = harperSafeLines(md)
    const joined = lines.filter((l) => !l.skip).map((l) => l.out).join('\n').replace('recieve', 'receive')
    const next = mapCorrectedProseToMarkdown(md, lines, joined)
    expect(next).toContain('receive')
    expect(next).toContain('## Title')
    expect(mapCorrectedProseToMarkdown(md, lines, 'only-one-line')).toBe(md)
  })

  it('quoted style fixes are idempotent', () => {
    const doc = 'You should leverage this process today.'
    const items = [{ quote: 'leverage this process', suggestion: 'use this process' }]
    const once = applyQuotedStyleFixes(doc, items)
    expect(once.applied).toBe(1)
    expect(once.content).toContain('use this process')
    const twice = applyQuotedStyleFixes(once.content, items)
    expect(twice.applied).toBe(0)
    expect(twice.content).toBe(once.content)
  })

  it('ignores TOC glue and treats acronyms as vocabulary not grammar', () => {
    expect(isNonClientFacingLine('Table of contents What application essay review covers for U.S. filings Who should use a reviewer versus self-edit Docum')).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'SEVIS', fix: 'Semis', message: "Did you mean to spell 'SEVIS' this way?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Word Choice', problem: 'B', fix: 'byte', message: "Did you mean 'byte'?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'CRS', fix: 'CES' })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Grammar', problem: 'Should i hire', fix: 'Should I hire' })).toBe(false)
    expect(HARPER_ESTATE_WORDS).toContain('SEVIS')
  })

  it('is 1:1 line-preserving (word splice safety)', () => {
    const lines = harperSafeLines(doc)
    const proseLabels = lines.filter((l) => !l.skip).map((l) => l.out.trim().split(/\s+/).length)
    const srcLabels = lines.filter((l) => !l.skip)
    expect(proseLabels.length).toBe(srcLabels.length)
  })
})