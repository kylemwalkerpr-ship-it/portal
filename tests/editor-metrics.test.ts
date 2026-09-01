import { extractProse, fleschReadingEase, scoreHarperLints, computeSeoScore, computeEditorMetrics } from '../lib/editorMetrics'

describe('editor metrics', () => {
  it('extracts prose from markdown including frontmatter/headings/lists', () => {
    const md = `---
title: X
---
# Guide

## Section

Plain sentence here. Another one.

- bullet text
| a | b |
`
    const prose = extractProse(md)
    expect(prose).toContain('Plain sentence here')
    expect(prose).toContain('Another one')
    expect(prose).not.toContain('#')
    expect(prose).not.toContain('|')
    expect(prose).not.toContain('---')
  })

  it('scores readability with Flesch', () => {
    const hard = fleschReadingEase('The epistemological consolidation of preparatory juridical discourse necessitates substantial chronological investment.')
    const easy = fleschReadingEase('You can apply online. It takes about ten minutes. You need your passport.')
    expect(hard.score).toBeLessThan(easy.score)
  })

  it('weights harper errors harder than style suggestions', () => {
    const errs = scoreHarperLints([{ kind: 'Spelling' }, { kind: 'Grammar' }, { kind: 'Grammar' }])
    const style = scoreHarperLints([{ kind: 'Style' }, { kind: 'Style' }])
    expect(errs.score).toBeLessThan(style.score)
    expect(errs.errors).toBe(3)
  })

  it('seo score rewards FAQ + keyword in H1 + depth', () => {
    const good = `# Student visa fee increase\n\n## In 60 seconds\n\nIntro sentence about student visa fee increase.\n\n## Costs\n\nText text text about cost and study. [source](https://gov.example/1) more. [other](https://edu.example/2)\n\n## Process\n\nText. \n\n## FAQ\n\n### Do I need a consultant? Yes.\n\n## Sources\n\n- a\n`
    const bad = '# X\n\nTiny.\n'
    const g = computeSeoScore(good, { primaryKeyword: 'student visa fee increase', targetWords: 1200 })
    const b = computeSeoScore(bad, { primaryKeyword: 'student visa fee increase', targetWords: 1200 })
    expect(g.score).toBeGreaterThan(60)
    expect(g.pass.some((p) => p.includes('H1'))).toBe(true)
    expect(b.score).toBeLessThan(40)
  })

  it('computeEditorMetrics aggregates all three', () => {
    const m = computeEditorMetrics('# T\n\nHello there. This is a fine article.', [], { primaryKeyword: 'fine article' })
    expect(typeof m.grammar.score).toBe('number')
    expect(typeof m.readability.score).toBe('number')
    expect(typeof m.seo.score).toBe('number')
  })
})

import { ensureMinimumOutline } from '../lib/seoEngine/researchDemand'

describe('ensureMinimumOutline', () => {
  it('completes a sparse skeleton with structural + example sections', () => {
    const given = ['Eligibility and requirements', 'Application process']
    const out = ensureMinimumOutline(given)
    expect(out).toContain('In 60 seconds')
    expect(out).toContain('Worked Example')
    expect(out).toContain('FAQ')
    expect(out).toContain('Sources')
    expect(out[0]).toBe('In 60 seconds')
  })

  it('is idempotent and never duplicates existing structural sections', () => {
    const full = ['In 60 seconds', 'Process', 'Worked Example', 'FAQ', 'Sources']
    const out = ensureMinimumOutline(full)
    expect(out.filter((h) => h.toLowerCase() === 'faq').length).toBe(1)
    expect(out.filter((h) => h.toLowerCase() === 'sources').length).toBe(1)
    expect(out.length).toBe(5)
  })

  it('caps at 12 and normalizes H2: prefixes', () => {
    const many = Array.from({ length: 14 }, (_, i) => `Section number ${i}`)
    const out = ensureMinimumOutline(many)
    expect(out.length).toBeLessThanOrEqual(12)
    const prefixed = ensureMinimumOutline(['H2: Costs'])
    expect(prefixed).toContain('Costs')
    expect(prefixed).not.toContain('H2: Costs')
  })
})
