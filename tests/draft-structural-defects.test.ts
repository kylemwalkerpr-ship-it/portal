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
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { normalizeEditorDocument } from '../lib/seoFactory/formatContract'
import { auditReferenceReachability } from '../lib/seoFactory/contentQualityGate'

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