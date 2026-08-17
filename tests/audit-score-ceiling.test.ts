/**
 * Regression: the SEO audit score had a denominator bug (`max = 20` while the
 * checks only ever award 18 points), so a flawless article could never score
 * above 90%. This locks the ceiling at 100% for a fully-clean, blocker-free,
 * warning-free article.
 */
import {
  auditContent,
  AUDIT_MAX_POINTS,
  AUDIT_POINT_WEIGHTS,
} from '@/lib/seoFactory/audit'

const TITLE = 'Student visa documents checklist 2026'
// 120–170 chars so the meta_description check passes.
const DESCRIPTION =
  'A practical checklist of the student visa documents, timelines, and risks, with official sources and clear steps for applicants.'

/**
 * A long-form (pillar-tier) article that clears every audit check with zero
 * blockers and zero warnings. Padding uses a unique per-sentence token so
 * sentence-start repetition never fires, and paragraphs are kept short so the
 * wall_of_text warning never fires.
 */
function cleanLongForm(): string {
  const sentences = Array.from({ length: 180 }, (_, i) => {
    // First 12 chars are unique per index → no sentence_start_repetition.
    return `Step${i} gives you one more practical point to check against the official source.`
  })
  let pad = ''
  for (let i = 0; i < sentences.length; i++) {
    pad += sentences[i]
    pad += i % 3 === 2 ? '\n\n' : ' '
  }

  return `---
title: ${TITLE}
description: ${DESCRIPTION}
primaryKeyword: student visa documents
canonicalUrl: https://legal.yousafeconsultancy.com/us/student-visa-documents/
ogImage: /og-image.png
---

# ${TITLE}

## In 60 seconds
- Confirm the exact form list for your route on the official site
- Gather bank statements and identity documents before you file
- Check processing times so you don't miss a deadline

## On this page
- Eligibility and steps
- Documents checklist
- Risks and timelines
- FAQ

## Eligibility and steps
You confirm which route applies, then you collect evidence that matches the rules on https://www.uscis.gov/. For example, an F-1 student files the I-20 alongside the visa application.

## Documents checklist
Passport, financial proof, and school letters usually sit on the list. Verify live requirements before you pay any fee.

## Risks and timelines
Missing pages or stale bank statements often delay a case. You'll want to renew anything that expires within the next six months.

## FAQ
### What should you prepare first?
You start with identity documents and the official form list for your category.

### How long does filing take?
Processing times change, so check the agency site for the current estimate.

### What if something is missing?
You pause filing until the evidence set is complete rather than guessing.

### Can family members apply with you?
Dependents follow separate rules, so read the official page for your route.

## Sources
- https://www.uscis.gov/
- [Student visa hub](https://legal.yousafeconsultancy.com/us/student-visas/)
- [F-1 OPT guide](https://legal.yousafeconsultancy.com/us/f1-opt/)

This guide is for educational purposes only and is not legal advice. Consult a qualified immigration attorney for your situation.

<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Article","headline":"${TITLE}","image":["https://legal.yousafeconsultancy.com/og-image.png"],"datePublished":"2026-08-17","author":{"@type":"Organization","name":"MyCaseworks"},"publisher":{"@type":"Organization","name":"MyCaseworks","logo":{"@type":"ImageObject","url":"https://legal.yousafeconsultancy.com/og-image.png"}}}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What should you prepare first?","acceptedAnswer":{"@type":"Answer","text":"You start with identity documents and the official form list."}}]}
</script>

${pad}
`
}

describe('audit score denominator stays in sync with check weights', () => {
  it('AUDIT_MAX_POINTS equals the sum of every check weight', () => {
    const sum = Object.values(AUDIT_POINT_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(AUDIT_MAX_POINTS).toBe(sum)
    expect(AUDIT_MAX_POINTS).toBeGreaterThan(0)
  })

  it('every check weight is a positive integer', () => {
    for (const [check, pts] of Object.entries(AUDIT_POINT_WEIGHTS)) {
      expect(Number.isInteger(pts)).toBe(true)
      expect(pts).toBeGreaterThan(0)
    }
  })

  it('the weight table lists exactly the 13 scored checks', () => {
    // Adding or removing a check MUST update this list AND AUDIT_MAX_POINTS,
    // otherwise the ceiling silently drifts (the original 90% bug).
    expect(Object.keys(AUDIT_POINT_WEIGHTS).sort()).toEqual(
      [
        'aiAnswerBlock',
        'citations',
        'disclaimer',
        'h2Structure',
        'humanVoice',
        'internalLinks',
        'keyword',
        'metaDescription',
        'robots',
        'schemaArticle',
        'schemaFaq',
        'title',
        'wordCount',
      ].sort(),
    )
  })
})

describe('audit score ceiling', () => {
  it('a fully-clean article scores 100, not 90', () => {
    const audit = auditContent({
      content: cleanLongForm(),
      contentType: 'article',
      primaryKeyword: 'student visa documents',
      indexable: true,
    })

    expect(audit.blockers.map((b) => b.code)).toEqual([])
    expect(audit.warnings.map((w) => w.code)).toEqual([])
    expect(audit.score).toBe(100)
    expect(audit.grade).toBe('A')
  })
})
