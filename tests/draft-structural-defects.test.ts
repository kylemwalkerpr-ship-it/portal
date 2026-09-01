/**
 * Regression: live-draft structural defects (2026-09-01, "Estimated Tax
 * Payment Help for Visa Holders (2026 Guide)" in-flight job):
 *
 *  1. Run-in headings glued onto prose ("apply. ### H-1B workers") rendered
 *     as literal "### …" text in the published view.
 *  2. Duplicated H3 sub-sections across article copies persisted.
 *  3. FAQ questions with empty answers shipped.
 *  4. Plain-text source labels with no URL slipped through the bare-URL audit.
 */
import { applyDeterministicRepairs, stripDuplicateArticleCopy } from '../lib/seoFactory/editorialScaffold'
import { normalizeEditorDocument } from '../lib/seoFactory/formatContract'
import { auditReferenceReachability, detectForcedFaqWordings, detectKeywordPastedHeadings, evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'

describe('run-in heading split (formatContract.normalizeEditorDocument)', () => {
  it('splits a ### glued onto the end of a paragraph onto its own line', () => {
    const out = normalizeEditorDocument(
      'The four steps below mirror that worksheet. ### Step 1: Estimate your 2026 total income\n\nAdd expected wages.',
    )
    expect(out.content).toContain('worksheet.\n\n### Step 1: Estimate your 2026 total income\n')
    expect(out.fixed).toContain('run_in_headings_split')
  })

  it('leaves standalone headings and fenced code untouched', () => {
    const doc = '## FAQ\n\n### A real question?\n\nYes.\n\n```json\n{"note": " ### not a heading"}\n```\n'
    const out = normalizeEditorDocument(doc)
    expect(out.fixed).not.toContain('run_in_headings_split')
    expect(out.content).toBe(doc.trim())
  })
})

describe('H3 duplicate sections', () => {
  it('drops a repeated ### sub-section that echoes an earlier one', () => {
    const doc = `# Guide

## Who must pay

### F-1 students on OPT

OPT students owe quarterly taxes on freelance income.

### H-1B workers

Withholding covers only salary.

## More sections

### F-1 students on OPT

OPT students owe quarterly taxes on freelance income.

### H-1B workers

Withholding covers only salary.
`
    const repaired = applyDeterministicRepairs({
      content: doc, primaryKeyword: 'estimated tax payment help',
      region: 'US', indexable: true, contentType: 'article',
    })
    expect(repaired.content.match(/^### F-1 students on OPT$/gm)).toHaveLength(1)
    expect(repaired.applied.some((a) => a.startsWith('duplicate_heading_sections_removed'))).toBe(true)
  })
})

describe('empty FAQ answers', () => {
  it('removes a ### question that has no answer body', () => {
    const doc = `# Guide

## FAQ

### What is the estimated tax payment help for visa holders?

### How to apply for estimated tax payment help?

You do not apply for permission to pay.

## Sources

- [IRS](https://www.irs.gov/)
`
    const repaired = applyDeterministicRepairs({
      content: doc, primaryKeyword: 'estimated tax payment help',
      region: 'US', indexable: true, contentType: 'article',
    })
    expect(repaired.content).not.toContain('### What is the estimated tax payment help for visa holders?')
    expect(repaired.content).toContain('### How to apply for estimated tax payment help?')
    expect(repaired.applied.some((a) => a.startsWith('faq_empty_answers_removed'))).toBe(true)
  })
})

describe('plain-text source labels link to curated official URLs', () => {
  it('wraps a DHS / State plain label with its canonical URL', () => {
    const doc = `# Guide

## Sources

- [IRS, Estimated Taxes](https://www.irs.gov/businesses/small-businesses-self-employed/estimated-taxes)
- Study in the States (DHS)
- Travel.State.Gov, Student Visa
`
    const repaired = applyDeterministicRepairs({
      content: doc, primaryKeyword: 'estimated tax payment help',
      region: 'US', indexable: true, contentType: 'article',
    })
    expect(repaired.content).toContain('[Study in the States (DHS)](https://studyinthestates.dhs.gov/)')
    expect(repaired.content).toContain('[Travel.State.Gov, Student Visa](https://travel.state.gov/content/travel/en/us-visas/study.html)')
    expect(repaired.applied.some((a) => a.startsWith('official_source_labels_linked'))).toBe(true)
  })
})

describe('FAQ questions pasted from keyword templates (stuffing)', () => {
  const FAQ = (qs: string) => `# Estimated Tax Payment Help for Visa Holders

## In 60 seconds

- One bullet.

## FAQ

${qs}

## Sources

- [IRS](https://www.irs.gov/)
`

  const USER_EXAMPLES = `### Do you need a estimated tax payment help if you only have a W-2 job?

Usually no. A W-2 employer withholds.

### Is it possible to estimated tax payment help after the deadline?

Yes, you can make a late payment.

### How to pay quarterly estimated taxes on OPT without overpaying?

Estimate conservatively.
`

  it('detects the machine-worded questions from the reported article', () => {
    const found = detectForcedFaqWordings(FAQ(USER_EXAMPLES), 'estimated tax payment help')
    const questions = found.map((f) => f.question)
    expect(questions).toContain('Do you need a estimated tax payment help if you only have a W-2 job?')
    expect(questions).toContain('Is it possible to estimated tax payment help after the deadline?')
    // Natural questions never trip the detector.
    expect(questions).not.toContain('How to pay quarterly estimated taxes on OPT without overpaying?')
  })

  it('the quality gate surfaces faq_forced_keyword and the deterministic repair removes the junk Q&A', () => {
    // Structurally-compliant draft so the gate reaches the FAQ wording scan.
    const compliant = `# Estimated Tax Payment Help for Visa Holders

## In 60 seconds

- Estimated tax payment help covers quarterly payments for visa holders.
- You file on Form 1040-ES before each quarterly deadline.
- Penalties apply when a quarter is underpaid.

## How estimated tax payments work

You estimate your tax and pay it in four installments.

## FAQ

${USER_EXAMPLES}

## Sources

- [IRS](https://www.irs.gov/)

**Disclaimer:** This page is educational only and is not legal advice.
`
    const gated = evaluateContentQuality({
      content: compliant,
      primaryKeyword: 'estimated tax payment help',
      indexable: true,
    })
    expect(gated.findings.some((f) => f.code === 'faq_forced_keyword')).toBe(true)

    const repaired = applyDeterministicRepairs({
      content: compliant,
      title: 'Estimated Tax Payment Help for Visa Holders',
      primaryKeyword: 'estimated tax payment help',
      region: 'US',
      indexable: true,
      contentType: 'article',
    })
    expect(repaired.content).not.toContain('Do you need a estimated tax payment help')
    expect(repaired.content).not.toContain('Is it possible to estimated tax payment help after the deadline?')
    expect(repaired.content).toContain('How to pay quarterly estimated taxes on OPT without overpaying?')
    expect(repaired.applied.some((a) => a.startsWith('faq_forced_keyword_removed'))).toBe(true)
  })

  it('the article-glitch fix normalizes "a estimated" inside kept questions', () => {
    const withGlitch = `### How do I get a estimated tax payment help estimate?

Ask the firm for a written quote.
`
    const repaired = applyDeterministicRepairs({
      content: FAQ(withGlitch),
      title: 'Estimated Tax Payment Help for Visa Holders',
      primaryKeyword: 'estimated tax payment help',
      region: 'US',
      indexable: true,
      contentType: 'article',
    })
    // The glitch inside the FAQ question is fixed; other scaffolding never
    // introduces the broken form.
    expect(repaired.content).toContain('### How do I get an estimated tax payment help estimate?')
    expect(repaired.content).not.toMatch(/a estimated tax payment help/i)
  })
})

describe('headings pasted from keyword strings', () => {
  it('flags headings that are a required keyword or a long-tail verbatim', () => {
    const body = `# Guide

## How to apply for estimated tax payment help

Some prose.

### Estimated tax eligibility

More prose.

## What each fee model includes

Natural heading stays untouched.
`
    const found = detectKeywordPastedHeadings(
      body,
      ['estimated tax eligibility'],
      ['how to apply for estimated tax payment help'],
    )
    const headings = found.map((f) => f.heading)
    expect(headings).toContain('How to apply for estimated tax payment help')
    expect(headings).toContain('Estimated tax eligibility')
    expect(headings).not.toContain('What each fee model includes')
  })

  it('the gate surfaces keyword_pasted_heading', () => {
    const gated = evaluateContentQuality({
      content: `# Guide\n\n## How to apply for estimated tax payment help\n\nProse.\n\n## Natural section\n\nProse.\n`,
      primaryKeyword: 'estimated tax payment help',
      indexable: true,
      requiredShortKeywords: ['a', 'b', 'c', 'd', 'e'],
      requiredLongTailKeywords: ['how to apply for estimated tax payment help', 'x y z q p', 'x y z q r', 'x y z q s'],
    })
    expect(gated.findings.some((f) => f.code === 'keyword_pasted_heading')).toBe(true)
  })
})

describe('gate surfaces unnamed-source defect (no silent ship)', () => {
  it('flags plain-text entries under ## Sources that are not links', () => {
    const findings = auditReferenceReachability(
      '# Guide\n\n## Sources\n\n- Study in the States (DHS)\n- [IRS, Estimated Taxes](https://www.irs.gov/)\n',
    )
    const plain = findings.find((f) => f.code === 'source_name_not_hyperlinked')
    expect(plain).toBeDefined()
    expect(plain!.severity).toBe('warning')
    expect(plain!.message).toContain('Study in the States (DHS)')
  })
})

describe('mangled markdown tables (single glued line)', () => {
  it('rebuilds a glued table into one row per line', () => {
    const glued =
      '| Fee model | Typical range | What you get | | --- | --- | --- | | Hourly consultation | $50 to $300 per hour | Advice on a specific question | | Fixed package | $500 to $5,000 | A defined set of services |'
    const out = normalizeEditorDocument(`# Guide\n\n${glued}\n\nMore text.\n`)
    const rows = out.content.split('\n').filter((l) => l.trim().startsWith('|'))
    expect(rows.length).toBe(4)
    expect(rows[0]).toBe('| Fee model | Typical range | What you get |')
    expect(rows[1]).toBe('| --- | --- | --- |')
    expect(rows[2]).toContain('| Hourly consultation | $50 to $300 per hour | Advice on a specific question |')
    expect(rows[3]).toContain('| Fixed package | $500 to $5,000 | A defined set of services |')
    expect(out.fixed).toContain('mangled_tables_split')
  })

  it('leaves already-multiline tables untouched', () => {
    const table = '| A | B |\n| --- | --- |\n| 1 | 2 |\n'
    const out = normalizeEditorDocument(table)
    expect(out.fixed).not.toContain('mangled_tables_split')
    expect(out.content).toBe(table.trim())
  })
})

describe('echo-on-frontmatter-restart strip', () => {
  it('cuts everything from a second mid-document frontmatter block (copy #1 fragments + copy #2)', () => {
    const doc = `# First attempt intro

Leftover section text after the echo was truncated.

---

title: "Study Abroad Consultant Cost: What You Pay and When in 2026"
primaryKeyword: "study abroad consultant cost"
---

Study Abroad Consultant Cost: What You Pay and When in 2026

In 60 seconds

- The full revised article.

## Table of contents

- Something
`
    const { content, removed, copies } = stripDuplicateArticleCopy(doc)
    expect(removed).toBe(true)
    expect(copies).toBe(2)
    expect(content).not.toContain('title:')
    expect(content).not.toContain('The full revised article')
    // The orphaned first-attempt fragments survive (the revision was dropped
    // with its echoed frontmatter, keeping the earliest real content).
    expect(content).toContain('Leftover section text')
  })
})