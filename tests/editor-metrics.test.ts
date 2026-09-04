import { extractProse, fleschReadingEase, fleschTargetForBrief, scoreHarperLints, computeSeoScore, computeEditorMetrics, suggestReadabilityFixes, applyReadabilityFixes, expandMetaToBriefTarget, missingBriefKeywords, injectMissingBriefKeywords } from '../lib/editorMetrics'

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

  it('meta description uses the ship gate 70–160 and treats 114 as SERP warn not a fail', () => {
    const desc = 'Check the 485 graduate visa streams, English, and skills evidence before you lodge in Australia.'
    expect(desc.length).toBeGreaterThanOrEqual(70)
    expect(desc.length).toBeLessThan(140)
    const md = `---\ntitle: "Graduate visa 485"\ndescription: "${desc}"\n---\n\n# Graduate visa 485\n\nIntro about graduate visa 485.\n`
    const s = computeSeoScore(md, { primaryKeyword: 'graduate visa 485' })
    expect(s.fail.some((f) => /meta/i.test(f))).toBe(false)
    expect(s.warn.some((w) => /ship-ok/.test(w) && /140/.test(w))).toBe(true)
    const apostrophe = `---\ndescription: "You'll need documents, English, and a skills assessment for the 485 graduate visa in Australia."\n---\n\n# T\n\nHi.\n`
    const full = computeSeoScore(apostrophe)
    expect(full.fail.some((f) => /No meta/.test(f))).toBe(false)
    const expanded = expandMetaToBriefTarget(md, { primaryKeyword: 'graduate visa 485' })
    expect(expanded.applied).toBe(true)
    expect(expanded.length).toBeGreaterThanOrEqual(140)
    expect(expanded.length).toBeLessThanOrEqual(160)
  })

  it('brief content type sets the Flesch floor and long sentences get split suggestions', () => {
    expect(fleschTargetForBrief({ contentType: 'blog_post' })).toBe(60)
    expect(fleschTargetForBrief({ contentType: 'legal_guide' })).toBe(50)
    expect(fleschTargetForBrief({ contentType: 'article', audience: 'students hiring an admissions consultant', tone: 'educational' })).toBe(55)
    const long = 'Applicants who want a graduate visa after study in Australia must compare the post-study work stream with the graduate work stream and collect evidence of CRICOS study, English, and a skills assessment before they lodge because processing clocks do not pause for missing documents.'
    const fixes = suggestReadabilityFixes(`# T\n\n${long}\n`, { contentType: 'blog_post', audience: 'graduates' })
    expect(fixes.length).toBeGreaterThan(0)
    expect(fixes[0].suggestion).toMatch(/\.\s+[A-Z]/)
  })

  it('readability auto-fix shortens dense wording when sentences are already short', () => {
    const md = `# T\n\nYou should utilize the portal in order to file. Subsequently you demonstrate status.\n`
    const fixes = suggestReadabilityFixes(md, { contentType: 'blog_post' })
    expect(fixes.some((f) => /utilize|in order to|subsequently|demonstrate/i.test(f.quote))).toBe(true)
    const out = applyReadabilityFixes(md, fixes)
    expect(out.applied).toBeGreaterThan(0)
    expect(out.content).toMatch(/\buse\b/)
    expect(out.content).not.toMatch(/\butilize\b/i)
  })

  it('injects missing brief keywords into the body without making them headings', () => {
    const md = `---
title: Essay editing
description: How F-1 students use an editor before a school file in 2026 cycle now.
---

# Essay editing service

Intro about editors and honour codes.

## What to send
Passport and I-20.

## FAQ
Who can edit? A reviewer the school allows.

## Sources
- a
`
    const hint = {
      primaryKeyword: 'essay editing service',
      requiredShortKeywords: ['essay editing service', 'college essay', 'personal statement'],
      requiredLongTailKeywords: ['f-1 essay editing', 'us college application essay'],
    }
    const missing = missingBriefKeywords(md, hint)
    expect(missing.length).toBeGreaterThan(0)
    const out = injectMissingBriefKeywords(md, hint)
    expect(out.applied).toBeGreaterThan(0)
    expect(out.content).not.toMatch(/^##\s+college essay/m)
    const after = missingBriefKeywords(out.content, hint)
    expect(after.length).toBeLessThan(missing.length)
  })

  it('computeEditorMetrics aggregates all three', () => {
    const m = computeEditorMetrics('# T\n\nHello there. This is a fine article.', [], { primaryKeyword: 'fine article' })
    expect(typeof m.grammar.score).toBe('number')
    expect(typeof m.readability.target).toBe('number')
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
