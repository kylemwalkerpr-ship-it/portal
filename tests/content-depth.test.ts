/**
 * Google-aligned depth floors — thin content must never ship unattended.
 */
import {
  checkContentDepth,
  clampBriefWordBudget,
  countBodyWords,
  enforceBodyWordBudget,
  formatBodyWordDisplay,
  maxWordsForType,
  minWordsForType,
  openingFrontmatterClosed,
  targetWordsForType,
  unwrapWholeDocumentFence,
} from '@/lib/seoFactory/contentDepth'
import { auditContent } from '@/lib/seoFactory/audit'

describe('countBodyWords — truncated frontmatter counts as ZERO prose (2026-09-02 live regression)', () => {
  it('an unclosed opening frontmatter block has zero prose words — YAML keys are not content', () => {
    // What a stream truncated mid-frontmatter leaves behind: the 46-word
    // "draft" that depth rescue once tried to expand.
    const truncated = '---\ntitle: Employment-Based Green Card Strategy: H-1B & Student Guide (2026)\ndescription: Map your employment-based green card strategy with official USCIS steps.\nprimaryKeyword: employment-based green card strategy\nrobots: index,follow\ndate: 2026-08-01\nregion: us\ncontentType: legal_guide\nownerHost: legal'
    expect(countBodyWords(truncated)).toBe(0)
  })

  it('a CLOSED frontmatter block is stripped as always — body prose counts normally', () => {
    const closed = '---\ntitle: T\nprimaryKeyword: k\ncontentType: legal_guide\n---\n# T\n\nReal body prose with several words here.'
    expect(countBodyWords(closed)).toBeGreaterThan(0)
  })

  it('unclosed --- plus a real H1 still counts body words (live 25k-char / 0-word stream)', () => {
    const live = `---
title: Immigration Lawyer Cost: 2026 Guide for Applicants description: Break down immigration lawyer cost by visa type. primaryKeyword: immigration lawyer cost robots: index,follow date: 2026-08-11 region: us contenttype: legalguide ownerHost: legal

# Immigration Lawyer Cost: 2026 Guide for Applicants

## In 60 seconds

- You cover two separate expenses: official government charges and separate legal billing for representation.
- Charges vary by case type, form category, and attorney experience level.
`
    expect(countBodyWords(live)).toBeGreaterThan(20)
  })

  it('collapsed one-line YAML without an opening fence does not zero the H1 body', () => {
    const live = `title: Immigration Lawyer Cost: 2026 Guide for Applicants description: Break down immigration lawyer cost. primaryKeyword: immigration lawyer cost robots: index,follow ownerHost: legal ---

# Immigration Lawyer Cost: 2026 Guide for Applicants

Applicants pay government filing fees and a separate attorney retainer.
`
    expect(countBodyWords(live)).toBeGreaterThan(8)
  })

  it('openingFrontmatterClosed distinguishes closed blocks, unclosed blocks, and plain bodies', () => {
    expect(openingFrontmatterClosed('---\ntitle: T\n---\n# T\nBody.')).toBe(true)
    expect(openingFrontmatterClosed('---\ntitle: T\nprimaryKeyword: k')).toBe(false)
    expect(openingFrontmatterClosed('# Just a body\n\nProse.')).toBe(true)
    expect(openingFrontmatterClosed('')).toBe(true)
  })
})

describe('clampBriefWordBudget (Research-stage word-count by content type)', () => {
  it('returns the canonical budget when the model omits min/max words', () => {
    expect(clampBriefWordBudget('article')).toEqual({ minWords: 2200, maxWords: 2500 })
    expect(clampBriefWordBudget('blog_post')).toEqual({ minWords: 800, maxWords: 1200 })
    expect(clampBriefWordBudget('regional_page')).toEqual({ minWords: 1200, maxWords: 2000 })
    expect(clampBriefWordBudget('marketplace_gig')).toEqual({ minWords: 500, maxWords: 1200 })
  })

  it('returns the canonical window verbatim — model sub-ranges no longer survive (single source of truth)', () => {
    expect(clampBriefWordBudget('article', 2400, 2600)).toEqual({ minWords: 2200, maxWords: 2500 })
    expect(clampBriefWordBudget('blog_post', 600, 900)).toEqual({ minWords: 800, maxWords: 1200 })
    expect(clampBriefWordBudget('article', 1800, 2200)).toEqual({ minWords: 2200, maxWords: 2500 })
    expect(clampBriefWordBudget('article', 2200, 9000)).toEqual({ minWords: 2200, maxWords: 2500 })
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
  it('requires comprehensive depth for legal guides / articles (SEO guard: 2200–2500)', () => {
    expect(minWordsForType('legal_guide')).toBe(2200)
    expect(minWordsForType('article')).toBe(2200)
    expect(targetWordsForType('legal_guide')).toBeGreaterThanOrEqual(2300)
    expect(maxWordsForType('legal_guide')).toBe(2500)
  })

  it('requires solid blogs and regionals (SEO guard: 800–1200 / 1200–2000)', () => {
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

  it('unwraps a reviewer preamble + fenced article (DeepSeek V4 Pro habit)', () => {
    const inner = '# Title\n\n' + Array.from({ length: 80 }, () => 'word').join(' ')
    const wrapped = `Here is the complete article:\n\n\`\`\`text\n${inner}\n\`\`\`\n`
    expect(unwrapWholeDocumentFence(wrapped).trim()).toBe(inner)
    expect(countBodyWords(wrapped)).toBe(countBodyWords(inner))
  })

  it('does not hide a 0-word editor behind a stale stored count', () => {
    expect(formatBodyWordDisplay(0, 2618)).toBe('0 (stored 2618 — not in editor)')
    expect(formatBodyWordDisplay(2618, 2618)).toBe('2618')
    expect(formatBodyWordDisplay(0, 0)).toBe('0')
  })
})

describe('enforceBodyWordBudget — soft overshoot must land inside [min, max]', () => {
  function blogBody(words: number): string {
    const para = 'Applicants should gather passport copies, fee receipts, and a timeline of prior visas before filing.'
    const unit = countBodyWords(para)
    const n = Math.ceil(words / unit)
    const sections = ['Eligibility', 'Documents', 'Costs', 'Processing times', 'Common mistakes', 'FAQ']
    const chunks: string[] = [
      '# Student visa filing timeline 2026',
      '',
      '## In 60 seconds',
      '- Confirm the correct form and filing window.',
      '- Keep copies of every receipt you receive.',
      '',
    ]
    let i = 0
    while (countBodyWords(chunks.join('\n')) < words) {
      const heading = sections[i % sections.length]
      if (i % 8 === 0) chunks.push(`## ${heading}`, '')
      chunks.push(para, '')
      i++
    }
    return chunks.join('\n')
  }

  it('trims a synthetic oversize blog (~1240+) to ≤ 1200 and ≥ 800', () => {
    const oversize = blogBody(1242)
    expect(countBodyWords(oversize)).toBeGreaterThan(1200)
    const { content, removedWords } = enforceBodyWordBudget(oversize, 'blog_post')
    const wc = countBodyWords(content)
    expect(removedWords).toBeGreaterThan(0)
    expect(wc).toBeLessThanOrEqual(maxWordsForType('blog_post'))
    expect(wc).toBeGreaterThanOrEqual(minWordsForType('blog_post'))
    expect(checkContentDepth({ content, contentType: 'blog_post' }).overMax).toBe(false)
  })

  it('leaves an in-window blog untouched', () => {
    const ok = blogBody(950)
    const before = countBodyWords(ok)
    expect(before).toBeLessThanOrEqual(1200)
    expect(before).toBeGreaterThanOrEqual(800)
    const { content, removedWords } = enforceBodyWordBudget(ok, 'blog_post')
    expect(removedWords).toBe(0)
    expect(content).toBe(ok)
  })
})
