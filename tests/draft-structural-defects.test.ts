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
import { auditReferenceReachability, detectForcedFaqWordings, detectKeywordPastedHeadings, evaluateContentQuality, suggestHeadingRewrite } from '../lib/seoFactory/contentQualityGate'

describe('run-in heading split (formatContract.normalizeEditorDocument)', () => {
  it('splits a ### glued onto the end of a paragraph onto its own line', () => {
    const out = normalizeEditorDocument(
      'The four steps below mirror that worksheet. ### Step 1: Estimate your 2026 total income\n\nAdd expected wages.',
    )
    expect(out.content).toContain('worksheet.\n\n### Step 1: Estimate your 2026 total income\n')
    expect(out.fixed).toContain('run_in_headings_split')
  })

  it('leaves standalone headings intact and removes reader-facing code/schema fences', () => {
    const doc = '## FAQ\n\n### A real question?\n\nYes.\n\n```json\n{"note": " ### not a heading"}\n```\n'
    const out = normalizeEditorDocument(doc)
    expect(out.fixed).not.toContain('run_in_headings_split')
    expect(out.fixed.some((x) => x.startsWith('reader_code_fences_removed'))).toBe(true)
    expect(out.content).toBe('## FAQ\n\n### A real question?\n\nYes.')
    expect(out.content).not.toContain('```')
    expect(out.content).not.toContain('"note"')
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

describe('duplicate article copy', () => {
  it('strips a repeated article body after the complete first copy', () => {
    const first = `# Guide\n\n## Who must pay\n\nRules.\n\n## FAQ\n\n### Who pays?\n\nPeople.\n\n## Sources\n\n- [IRS](https://www.irs.gov/)\n\n**Disclaimer:** Educational only.`
    const duplicated = `${first}\n\n${first}`
    const out = stripDuplicateArticleCopy(duplicated)
    expect(out.changed).toBe(true)
    expect(out.content.match(/^# Guide$/gm)).toHaveLength(1)
    expect(out.content.match(/^## Who must pay$/gm)).toHaveLength(1)
  })
})

describe('keyword-pasted headings and FAQ prompts', () => {
  it('detects headings and FAQ questions that mechanically paste the full keyword', () => {
    const keyword = 'estimated tax payment help for visa holders'
    const body = `# Estimated Tax Payment Help for Visa Holders\n\n## How does estimated tax payment help for visa holders work?\n\nUse Form 1040-ES.\n\n## FAQ\n\n### What is estimated tax payment help for visa holders?\n\nQuarterly tax payments.`
    expect(detectKeywordPastedHeadings(body, keyword).length).toBeGreaterThan(0)
    expect(detectForcedFaqWordings(body, keyword).length).toBeGreaterThan(0)
    expect(suggestHeadingRewrite('How does estimated tax payment help for visa holders work?', keyword)).not.toContain(keyword)
  })
})

describe('reference reachability', () => {
  it('flags plain-text source labels that do not contain a URL', () => {
    const body = `# Guide\n\n## Sources\n\n- IRS Publication 505\n- [IRS](https://www.irs.gov/)`
    const findings = auditReferenceReachability(body)
    expect(findings.some((f) => /Publication 505/.test(f))).toBe(true)
  })
})

describe('full quality gate structural defects', () => {
  it('reports the deterministic structural defects to the editorial gate', () => {
    const keyword = 'estimated tax payment help for visa holders'
    const body = `# Estimated Tax Payment Help for Visa Holders\n\n## How does estimated tax payment help for visa holders work?\n\n${'This practical section explains the filing rule clearly to you. '.repeat(45)}\n\n## FAQ\n\n### What is estimated tax payment help for visa holders?\n\nYou use the official worksheet.\n\n## Sources\n\n- IRS Publication 505\n- [IRS](https://www.irs.gov/)\n\n**Disclaimer:** Educational only.`
    const q = evaluateContentQuality({
      content: body,
      contentType: 'article',
      region: 'US',
      indexable: true,
      primaryKeyword: keyword,
    })
    expect(q.hardFails.some((x) => x.code === 'keyword_pasted_heading')).toBe(true)
    expect(q.hardFails.some((x) => x.code === 'plain_text_source')).toBe(true)
  })
})
