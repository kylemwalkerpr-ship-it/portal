/**
 * stripDuplicateArticleCopy — deterministic removal of a second full article
 * copy concatenated by resume/regenerate runs (live defect 2026-09-01:
 * "Resume Review Service" job stored copy #1 + copy #2 — two H1s, doubled
 * H2s, ~5.1k words for a 2.2k guide, duplicated JSON-LD).
 */
import { stripDuplicateArticleCopy } from '../lib/seoFactory/editorialScaffold'

const FM = `---
title: Resume Review Service: Options, Costs and Trade-Offs in 2026
content_type: article
---`

const copyA = `# Resume Review Service for International Students: A 2026 Guide

## In 60 seconds

- First bullet for applicants.
- Second bullet for applicants.

## How the review process works

The reviewer reads your resume and returns comments.

## FAQ

### How much does it cost?
Most basic reviews cost between $50 and $150.

## Sources

- [USCIS](https://www.uscis.gov/working-in-the-united-states)

<script type="application/ld+json">
{"@type": "Article", "headline": "Resume Review Service for International Students"}
</script>`

const copyB = `# Resume Review Service: Options, Costs and Trade-Offs 2026

## In 60 seconds

- First bullet for applicants.
- Second bullet for applicants.

## How the review process works

The reviewer reads your resume and returns comments.

## FAQ

### How much does it cost?
Most basic reviews cost between $50 and $150.

## Sources

- [USCIS](https://www.uscis.gov/working-in-the-united-states)

<script type="application/ld+json">
{"@type": "Article", "headline": "Resume Review Service: Options, Costs and Trade-Offs"}
</script>`

describe('stripDuplicateArticleCopy', () => {
  it('leaves a single-copy body untouched', () => {
    const { content, removed, copies } = stripDuplicateArticleCopy(`${FM}\n\n${copyA}`)
    expect(removed).toBe(false)
    expect(copies).toBe(1)
    expect(content).toContain('# Resume Review Service for International Students')
  })

  it('keeps the copy whose H1 matches the frontmatter title and drops the echo', () => {
    const twoCopies = `${FM}\n\n${copyA}\n\n${copyB}`
    const first = stripDuplicateArticleCopy(twoCopies)
    expect(first.removed).toBe(true)
    expect(first.copies).toBe(2)
    expect(first.content).toContain('# Resume Review Service: Options, Costs and Trade-Offs 2026')
    expect(first.content).not.toContain('# Resume Review Service for International Students: A 2026 Guide')
    // The duplicate JSON-LD script of the dropped copy is gone too.
    expect((first.content.match(/<script/g) || []).length).toBe(1)
  })

  it('falls back to keeping the first copy when the frontmatter has no title', () => {
    const noFm = `${copyA}\n\n# Resume Review Service: Options, Costs and Trade-Offs 2026\n\n## In 60 seconds\n\n- X\n- Y\n`
    const { content, removed } = stripDuplicateArticleCopy(noFm)
    expect(removed).toBe(true) // the trailing duplicate repeats a kept outline
    expect(content).toContain('# Resume Review Service for International Students')
    expect(content).not.toContain('# Resume Review Service: Options, Costs and Trade-Offs 2026')
  })

  it('is idempotent', () => {
    const twoCopies = `${FM}\n\n${copyA}\n\n${copyB}`
    const once = stripDuplicateArticleCopy(twoCopies)
    expect(once.removed).toBe(true)
    const twice = stripDuplicateArticleCopy(once.content)
    expect(twice.removed).toBe(false)
    expect(twice.content).toBe(once.content)
  })
})