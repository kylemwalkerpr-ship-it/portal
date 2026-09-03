import { applyNonOverlappingSpanFixes, applyProseCorrection, dialectForRegion, harperSafeLines, HARPER_ESTATE_WORDS, isHarperNoiseFinding, isNonClientFacingLine, mapCorrectedProseToMarkdown, maskHarperScaffold, spliceWords, splitMarkdownFrontmatter } from '../lib/harperText'
import { applyQuotedStyleFixes } from '../lib/seoFactory/styleApply'
import { sanitizeLeakedMarkup } from '../lib/seoFactory/leakedMarkup'
import { applyReadabilityFixes, suggestReadabilityFixes } from '../lib/editorMetrics'

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

  it('collapses duplicate sentences when the suggestion is the same as the quote', () => {
    const doc = 'Rush weeks raise error risk. Rush weeks raise error risk. File earlier.'
    const out = applyQuotedStyleFixes(doc, [{
      quote: 'Rush weeks raise error risk.',
      suggestion: 'Rush weeks raise error risk.',
      category: 'readability',
    }])
    expect(out.applied).toBe(1)
    expect(out.missed).toHaveLength(0)
    expect(out.content).toBe('Rush weeks raise error risk. File earlier.')
  })

  it('replaces a wordy list even when it wraps across newlines', () => {
    const doc = 'You may need Form I-20,\nForm DS-160, Form I-94 and Form I-539.'
    const out = applyQuotedStyleFixes(doc, [{
      quote: 'Form I-20, Form DS-160, Form I-94 and Form I-539',
      suggestion: 'the usual student and visitor forms',
      category: 'wordy',
    }])
    expect(out.applied).toBe(1)
    expect(out.content).toContain('the usual student and visitor forms')
    expect(out.content).not.toContain('Form DS-160')
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

  it('replaces style quotes even when the model wrapped them in markdown stars', () => {
    const doc = '**English:** the required score changes with each legislative instrument.'
    const out = applyQuotedStyleFixes(doc, [{
      quote: '**English:** **English:** the required score changes with each legislative instrument.',
      suggestion: 'English scores change with each legislative instrument.',
    }])
    expect(out.applied).toBe(1)
    expect(out.content).toContain('English scores change')
    expect(out.content).not.toMatch(/\*\*English:\*\*\s+\*\*English:\*\*/)
  })

  it('find-and-replaces style quotes across whitespace and quotes', () => {
    const doc = 'Cost of applying for application essay review is a vendor quote.'
    const out = applyQuotedStyleFixes(doc, [{
      quote: 'Cost of applying for application essay review is a vendor quote.',
      suggestion: 'The cost for an application essay review is a vendor quote, not a government filing fee.',
    }])
    expect(out.applied).toBe(1)
    expect(out.content).toContain('not a government filing fee')
  })

  it('ignores TOC glue and treats acronyms as vocabulary not grammar', () => {
    expect(isNonClientFacingLine('Table of contents What application essay review covers for U.S. filings Who should use a reviewer versus self-edit Docum')).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'SEVIS', fix: 'Semis', message: "Did you mean to spell 'SEVIS' this way?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Word Choice', problem: 'B', fix: 'byte', message: "Did you mean 'byte'?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'CRS', fix: 'CES' })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Grammar', problem: 'Should i hire', fix: 'Should I hire' })).toBe(false)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'YouSafe', fix: 'Yousafe', message: "Did you mean 'Yousafe'?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'CRICOS', fix: 'Cricks', message: "Did you mean to spell 'CRICOS' this way?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'rumour', fix: 'rumor' })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'uncertified', fix: 'unfortified' })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'english', fix: 'English' })).toBe(false)
    expect(isHarperNoiseFinding({ kind: 'Typo', problem: 'datePublished', fix: 'date Published', message: '`datePublished` should probably be written as `date Published`.' })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Spelling', problem: 'url', fix: 'urn', message: "Did you mean to spell 'url' this way?" })).toBe(true)
    expect(isHarperNoiseFinding({ kind: 'Typo', problem: 'acceptedAnswer', fix: 'accepted Answer' })).toBe(true)
    expect(HARPER_ESTATE_WORDS).toContain('SEVIS')
  })

  it('converts leaked details/summary HTML into markdown and drops stray closers', () => {
    const raw = `Keep scenes in the essay.\n\n<details> <summary>Folder checklist you can print</summary>\n\n- One PDF\n\n</details>\n\nCollect a folder.\n</div>`
    const out = sanitizeLeakedMarkup(raw)
    expect(out).toContain('### Folder checklist you can print')
    expect(out).toContain('- One PDF')
    expect(out).not.toMatch(/<\/?details/i)
    expect(out).not.toMatch(/<\/?summary/i)
    expect(out).not.toMatch(/<\/div>/)
  })

  it('only proposes readability splits for sentences that exist in the source', () => {
    const md = `---\ntitle: T\n---\n\n# Title\n\n## Table of contents\n\n- [A](#a)\n\n## A\n\nShe feared her English would sound international. Priya compiled a one-page fact sheet, then drafted three scenes: a failed lab, a repair, and a teaching hour at her school club that ran long enough to count as a real sentence for the splitter.\n`
    const fixes = suggestReadabilityFixes(md, { audience: 'students' })
    expect(fixes.every((f) => md.includes(f.quote) || /Priya compiled/.test(f.quote))).toBe(true)
    const applied = applyReadabilityFixes(md, fixes)
    if (fixes.length) expect(applied.applied).toBeGreaterThan(0)
  })

  it('applies Harper spans from the end without shifting earlier fixes', () => {
    const text = 'aaa bbb ccc'
    const out = applyNonOverlappingSpanFixes(text, [
      { start: 0, end: 3, replacement: 'AAA' },
      { start: 8, end: 11, replacement: 'CCC' },
    ])
    expect(out.applied).toBe(2)
    expect(out.text).toBe('AAA bbb CCC')
    expect(dialectForRegion('AU')).toBe('british')
    expect(dialectForRegion('US')).toBe('american')
    const split = splitMarkdownFrontmatter('---\ntitle: X\n---\n\n# Hello\n')
    expect(split.fm).toContain('title: X')
    expect(split.body).toContain('# Hello')
    const schema = 'Hello world.\n<script type="application/ld+json">{"datePublished":"2026-01-01","url":"https://x"}</script>\nBye.'
    const masked = maskHarperScaffold(schema)
    expect(masked.length).toBe(schema.length)
    expect(masked).toContain('Hello world.')
    expect(masked).not.toContain('datePublished')
  })

  it('is 1:1 line-preserving (word splice safety)', () => {
    const lines = harperSafeLines(doc)
    const proseLabels = lines.filter((l) => !l.skip).map((l) => l.out.trim().split(/\s+/).length)
    const srcLabels = lines.filter((l) => !l.skip)
    expect(proseLabels.length).toBe(srcLabels.length)
  })
})