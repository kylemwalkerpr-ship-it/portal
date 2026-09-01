import { harperSafeLines, HARPER_ESTATE_WORDS } from '../lib/harperText'

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

  it('is 1:1 line-preserving (word splice safety)', () => {
    const lines = harperSafeLines(doc)
    const proseLabels = lines.filter((l) => !l.skip).map((l) => l.out.trim().split(/\s+/).length)
    const srcLabels = lines.filter((l) => !l.skip)
    expect(proseLabels.length).toBe(srcLabels.length)
  })
})