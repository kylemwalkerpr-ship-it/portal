/**
 * Document fingerprint tests (implementation brief §5.4, Milestone B).
 * Determinism, invariant capture, and violation detection.
 */
import {
  computeDocumentFingerprint,
  fingerprintViolations,
  shadowPreservationCheck,
  textHash,
} from '@/lib/seoFactory/documentFingerprint'

const BASE_DOC = `---
title: UK Skilled Worker Visa Requirements 2026 Guide
description: Eligibility, salary thresholds, documents, and the application procedure for the UK Skilled Worker visa.
canonicalUrl: https://yousafeconsultancy.com/legal/uk-skilled-worker-visa
robots: index,follow
---

# UK Skilled Worker Visa Requirements

## In 60 seconds

- You need a sponsoring employer
- Salary must meet the threshold
- Apply online with your documents

## Table of contents

- [Eligibility](#eligibility)
- [FAQ](#faq)

## Eligibility

You must have a certificate of sponsorship from a licensed sponsor. See [Home Office rules](https://www.gov.uk/skilled-worker-visa).

## Process

- Step one
- Step two
- Step three

## FAQ

### Do I need IELTS?

Yes, most applicants prove English ability.

## Sources

- https://www.gov.uk/skilled-worker-visa

<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
`

describe('computeDocumentFingerprint', () => {
  it('captures H1, headings, skeleton, frontmatter keys, links, and schema', () => {
    const fp = computeDocumentFingerprint(BASE_DOC)
    expect(fp.h1).toBe('UK Skilled Worker Visa Requirements')
    expect(fp.headings.map((h) => h.text)).toEqual([
      'In 60 seconds', 'Table of contents', 'Eligibility', 'Process', 'FAQ', 'Do I need IELTS?', 'Sources',
    ])
    expect(fp.skeleton).toEqual(['In 60 seconds', 'TOC', 'FAQ', 'Sources'])
    expect(fp.frontmatterKeys).toEqual(['title', 'description', 'canonicalUrl', 'robots'])
    expect(fp.links.some((l) => l.url === 'https://www.gov.uk/skilled-worker-visa')).toBe(true)
    expect(fp.citations).toEqual(['https://www.gov.uk/skilled-worker-visa'])
    expect(fp.schemaTypes).toEqual(['Article'])
    expect(fp.listItems).toBe(9)
  })

  it('is deterministic and idempotent over the same input', () => {
    expect(computeDocumentFingerprint(BASE_DOC).hash).toBe(computeDocumentFingerprint(BASE_DOC).hash)
    expect(textHash('abc')).toBe(textHash('abc'))
    expect(textHash('abc')).not.toBe(textHash('abd'))
  })
})

describe('fingerprintViolations', () => {
  it('reports no violations for an identical document', () => {
    expect(fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(BASE_DOC))).toEqual([])
  })

  it('rejects a renamed unflagged heading', () => {
    const changed = BASE_DOC.replace('## Process', '## Application Process')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(changed))
    expect(v.some((x) => x.invariant === 'headings')).toBe(true)
  })

  it('allows a renamed heading when explicitly targeted', () => {
    const changed = BASE_DOC.replace('## Process', '## Application Process')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(changed), {
      targetedHeadings: ['Process', 'Application Process'],
    })
    expect(v.some((x) => x.invariant === 'headings')).toBe(false)
  })

  it('rejects a collapsed list', () => {
    const collapsed = BASE_DOC.replace('- Step one\n- Step two\n- Step three\n', 'Step one, step two, then step three.\n')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(collapsed))
    expect(v.some((x) => x.invariant === 'lists')).toBe(true)
  })

  it('rejects frontmatter key removal and canonical changes via key set', () => {
    const changed = BASE_DOC.replace('robots: index,follow\n', '')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(changed))
    expect(v.some((x) => x.invariant === 'frontmatter')).toBe(true)
  })

  it('rejects removing an approved citation', () => {
    const changed = BASE_DOC.replace(' See [Home Office rules](https://www.gov.uk/skilled-worker-visa).', '')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(changed))
    expect(v.some((x) => x.invariant === 'citations')).toBe(true)
    expect(v.some((x) => x.invariant === 'links')).toBe(true)
  })

  it('rejects reordered structural sections', () => {
    const faq = BASE_DOC.indexOf('## FAQ')
    const sources = BASE_DOC.indexOf('## Sources')
    const reordered =
      BASE_DOC.slice(0, faq) +
      BASE_DOC.slice(sources, BASE_DOC.indexOf('<script')) +
      BASE_DOC.slice(faq, sources) +
      BASE_DOC.slice(BASE_DOC.indexOf('<script'))
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(reordered))
    expect(v.some((x) => x.invariant === 'skeleton')).toBe(true)
  })

  it('rejects a broad rewrite losing more than 40% of body words', () => {
    const stub = BASE_DOC.slice(0, BASE_DOC.indexOf('## Eligibility'))
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(stub))
    expect(v.some((x) => x.invariant === 'volume')).toBe(true)
  })

  it('rejects invented links outside targeted anchors', () => {
    const invented = BASE_DOC.replace('## Process', '## Process\n\nSee [other](https://example.com/x).')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(invented))
    expect(v.some((x) => x.invariant === 'links')).toBe(true)
  })

  it('rejects model-authored schema changes', () => {
    // Removing the scaffolded schema block (or swapping its type) is rejected.
    const removed = BASE_DOC.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, '')
    const v = fingerprintViolations(computeDocumentFingerprint(BASE_DOC), computeDocumentFingerprint(removed))
    expect(v.some((x) => x.invariant === 'schema')).toBe(true)
  })
})

describe('shadowPreservationCheck', () => {
  it('returns wouldReject=false for a preserved edit and stable hashes', () => {
    const same = shadowPreservationCheck(BASE_DOC, BASE_DOC)
    expect(same.ok).toBe(true)
    expect(same.wouldReject).toBe(false)
    expect(same.beforeHash).toBe(same.afterHash)
  })

  it('records would-reject reasons without mutating anything', () => {
    const changed = BASE_DOC.replace('## FAQ', '## Questions')
    const check = shadowPreservationCheck(BASE_DOC, changed)
    expect(check.wouldReject).toBe(true)
    expect(check.violations.length).toBeGreaterThan(0)
    expect(check.violations.length).toBeLessThanOrEqual(20)
  })
})
