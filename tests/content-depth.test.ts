/**
 * Google-aligned depth floors — thin content must never ship unattended.
 */
import {
  checkContentDepth,
  clampBriefWordBudget,
  countBodyWords,
  formatBodyWordDisplay,
  maxWordsForType,
  minWordsForType,
  targetWordsForType,
  unwrapWholeDocumentFence,
} from '@/lib/seoFactory/contentDepth'
import { auditContent } from '@/lib/seoFactory/audit'

describe('clampBriefWordBudget (Research-stage word-count by content type)', () => {
  it('returns the canonical budget when the model omits min/max words', () => {
    expect(clampBriefWordBudget('article')).toEqual({ minWords: 2200, maxWords: 2800 })
    expect(clampBriefWordBudget('blog_post')).toEqual({ minWords: 800, maxWords: 1500 })
    expect(clampBriefWordBudget('regional_page')).toEqual({ minWords: 1200, maxWords: 2000 })
    expect(clampBriefWordBudget('marketplace_gig')).toEqual({ minWords: 500, maxWords: 1200 })
  })

  it('keeps a model sub-range fully inside the budget', () => {
    expect(clampBriefWordBudget('article', 2400, 2600)).toEqual({ minWords: 2400, maxWords: 2600 })
  })

  it('clamps values below the floor back up to the canonical minimum', () => {
    // A model under-specifying a blog (600 words) must not reach drafting
    expect(clampBriefWordBudget('blog_post', 600, 900)).toEqual({ minWords: 800, maxWords: 900 })
    expect(clampBriefWordBudget('article', 1800, 2200)).toEqual({ minWords: 2200, maxWords: 2200 })
  })

  it('clamps values above the hard max back down', () => {
    // The 6,175-word blowout must be impossible from a brief
    expect(clampBriefWordBudget('article', 2200, 9000)).toEqual({ minWords: 2200, maxWords: 2800 })
    expect(clampBriefWordBudget('blog_post', 800, 6000)).toEqual({ minWords: 800, maxWords: 1500 })
  })

  it('every supported content type has a coherent min ≤ target ≤ max budget', () => {
    for (const t of ['article', 'blog_post', 'regional_page', 'marketplace_gig']) {
      const min = minWordsForType(t)
      const target = targetWordsForType(t)
      const max = maxWordsForType(t)
      expect(min).toBeLessThanOrEqual(target)
      expect(target).toBeLessThanOrEqual(max)
    }
  })
})

describe('minWordsForType (Google depth floors)', () => {
  it('requires comprehensive depth for legal guides / articles (SEO guard: 2200–2800)', () => {
    expect(minWordsForType('legal_guide')).toBe(2200)
    expect(minWordsForType('article')).toBe(2200)
    expect(targetWordsForType('legal_guide')).toBeGreaterThanOrEqual(2500)
  })

  it('requires solid blogs and regionals (SEO guard: 800–1500)', () => {
    expect(minWordsForType('blog_summary')).toBe(800)
    expect(minWordsForType('blog_post')).toBe(800)
    expect(minWordsForType('regional_from')).toBe(1200)
  })

  it('keeps gigs scannable but not stubs', () => {
    expect(minWordsForType('marketplace_gig')).toBe(500)
  })
})

describe('countBodyWords', () => {
  it('excludes front matter and JSON-LD from the count', () => {
    const md = `---
title: Test
description: ${'x'.repeat(150)}
---

# Hello

${'word '.repeat(100)}

\`\`\`json
{"@context":"https://schema.org","@type":"Article","text":"${'pad '.repeat(500)}"}
\`\`\`

<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
`
    const n = countBodyWords(md)
    expect(n).toBeLessThan(150)
    expect(n).toBeGreaterThan(90)
    expect(md.trim().split(/\s+/).filter(Boolean).length).toBeGreaterThan(n)
  })
})

describe('checkContentDepth + auditContent', () => {
  it('blocks thin legal guides', () => {
    const thin = `---
title: Thin Guide About Visas Here
description: ${'A concrete meta description with enough characters for the audit band xx.'.repeat(2)}
primaryKeyword: student visa
robots: index,follow
---

# Thin Guide

## In 60 seconds
- one

## Steps
Short.

## Documents  
Short.

## Risks
Short.

## FAQ
### Q1?
A1.

## Sources
- https://www.uscis.gov/

Not legal advice. Consult an attorney.
`
    const depth = checkContentDepth({ content: thin, contentType: 'legal_guide' })
    expect(depth.ok).toBe(false)
    expect(depth.belowMin || depth.thin).toBe(true)

    const audit = auditContent({
      content: thin,
      contentType: 'legal_guide',
      primaryKeyword: 'student visa',
      indexable: true,
    })
    expect(audit.blockers.some((b) => b.code === 'word_count' || b.code === 'thin_content')).toBe(
      true,
    )
    expect(audit.indexableRecommended).toBe(false)
  })

  it('passes when body meets floor', () => {
    const body = Array.from({ length: 2400 }, (_, i) => `word${i}`).join(' ')
    const md = `---
title: Comprehensive Student Visa Guide 2026
description: ${'Practical steps documents and timelines for F-1 applicants seeking clear next actions. '.slice(0, 155)}
primaryKeyword: student visa
robots: index,follow
---

# Comprehensive Student Visa Guide 2026

## In 60 seconds
- step one of the process
- documents you need ready

${body}

## Eligibility steps
Details with https://www.uscis.gov/ example.

## Documents checklist
List of items.

## Common risks
Risks.

## FAQ
### What is the first step?
You gather documents and confirm eligibility against official rules.

### How long does it take?
Timelines vary; check USCIS for current processing.

### What if I am refused?
You may have review options depending on the decision.

### Can family join?
Dependents may have separate pathways.

## Sources
- https://www.uscis.gov/

This is educational only, not legal advice. Consult an attorney for your case.
`
    const depth = checkContentDepth({ content: md, contentType: 'legal_guide' })
    expect(depth.ok).toBe(true)
    expect(depth.wordCount).toBeGreaterThanOrEqual(2200)
  })
})

describe('unwrapWholeDocumentFence + honest body-word display', () => {
  it('counts prose that a model wrapped in one markdown fence', () => {
    const inner = '# Title\n\n' + Array.from({ length: 80 }, () => 'word').join(' ')
    expect(countBodyWords('```markdown\n' + inner + '\n```')).toBe(countBodyWords(inner))
    expect(unwrapWholeDocumentFence('```md\nhello world\n```').trim()).toBe('hello world')
  })

  it('does not hide a 0-word editor behind a stale stored count', () => {
    expect(formatBodyWordDisplay(0, 2618)).toBe('0 (stored 2618 — not in editor)')
    expect(formatBodyWordDisplay(2618, 2618)).toBe('2618')
    expect(formatBodyWordDisplay(0, 0)).toBe('0')
  })
})
