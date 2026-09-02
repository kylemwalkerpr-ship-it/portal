import {
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  mergeAppendedSections,
  extractH2Titles,
} from '@/lib/seoFactory/prompts'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

describe('depth expand helpers', () => {
  it('buildDepthExpandPrompt states current vs min words', () => {
    const p = buildDepthExpandPrompt({
      title: 'Test',
      topic: 'student visa',
      primaryKeyword: 'student visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 1800,
      targetWords: 2200,
      currentWords: 750,
      draft: '---\ntitle: x\n---\n\n# Hello\n\nShort body.',
    })
    expect(p).toMatch(/750/)
    expect(p).toMatch(/1800/)
    expect(p).toMatch(/DEPTH EXPANSION/)
    expect(p).toMatch(/PREVIOUS DRAFT/)
  })

  it('buildDepthExpandPrompt carries h2Outline and demands the deficit', () => {
    const p = buildDepthExpandPrompt({
      title: 'Test',
      topic: 'student visa',
      primaryKeyword: 'student visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 2200,
      targetWords: 2500,
      maxWords: 2800,
      currentWords: 1660,
      draft: '# x\n\nshort',
      h2Outline: ['Eligibility Requirements', 'Application Process'],
    })
    // The planned outline is threaded into the prompt so expansion follows it
    expect(p).toMatch(/Eligibility Requirements/)
    expect(p).toMatch(/Application Process/)
    // The exact remaining deficit is demanded so the model knows the floor
    expect(p).toMatch(/1660/)
    expect(p).toMatch(/2200/)
    // Under-delivering is framed as the only real failure (no mixed signal)
    expect(p).toMatch(/Under-delivering is the ONLY failure/)
  })

  it('buildDepthExpandPrompt warns against repeating sentence openings so the full rewrite never re-creates sentence_start_repetition', () => {
    const p = buildDepthExpandPrompt({
      title: 'Test',
      topic: 'student visa',
      primaryKeyword: 'student visa',
      region: 'US',
      contentType: 'legal_guide',
      minWords: 2200,
      targetWords: 2500,
      currentWords: 1900,
      draft: 'short',
    })
    expect(p).toMatch(/SENTENCE OPENINGS/)
    // Covers prose AND bullets (TL;DR list, FAQ answers) — the expand pass
    // rewrites the whole page, so bullets with the same opener are just as
    // robotic as sentences and get the same up-front instruction.
    expect(p).toMatch(/Do NOT start 5 or more sentences \(or list items\)/)
    expect(p).toMatch(/same 12 characters/)
    expect(p).toMatch(/pronouns, connectives, and concrete nouns/)
  })

  it('buildDepthAppendPrompt demands the full remaining deficit with focus', () => {
    const p = buildDepthAppendPrompt({
      primaryKeyword: 'student visa',
      region: 'US',
      minWords: 2200,
      currentWords: 1660,
      existingH2s: ['Eligibility'],
      draftExcerpt: 'short',
      h2Outline: ['Eligibility Requirements', 'Application Process'],
      focus: 'Document checklist deep dive',
    })
    // Must request the measured deficit plus bounded headroom, never an
    // unbounded 700+ word append that pushes the full page over its maximum.
    expect(p).toMatch(/Add 660–960 NEW body words/)
    expect(p).toMatch(/2200 total/)
    // The rotating focus and planned outline are threaded in
    expect(p).toMatch(/FOCUS THIS PASS ON: Document checklist deep dive/)
    expect(p).toMatch(/Application Process/)
    expect(p).not.toMatch(/Need ~400 MORE words/) // old soft target
  })

  it('buildDepthAppendPrompt warns against repeating sentence openings so appended sections never re-create sentence_start_repetition', () => {
    const p = buildDepthAppendPrompt({
      primaryKeyword: 'student visa',
      region: 'US',
      minWords: 2200,
      currentWords: 1900,
      existingH2s: ['Eligibility'],
      draftExcerpt: 'short',
    })
    expect(p).toMatch(/SENTENCE OPENINGS/)
    // Explicitly names the failure mode (repeated 12-char subject phrase) and
    // the remedy (pronouns / connectives / concrete nouns after first mention).
    expect(p).toMatch(/Do NOT start 5 or more sentences/)
    expect(p).toMatch(/same 12 characters/)
    expect(p).toMatch(/pronouns, connectives, and concrete nouns/)
  })

  it('mergeAppendedSections inserts before script', () => {
    const draft = `# Title\n\nIntro\n\n<script type="application/ld+json">{}</script>\n`
    const append = `## Extra section\n\n${'word '.repeat(50)}`
    const merged = mergeAppendedSections(draft, append)
    expect(merged.indexOf('Extra section')).toBeLessThan(merged.indexOf('<script'))
    expect(countBodyWords(merged)).toBeGreaterThan(countBodyWords(draft))
  })

  it('extractH2Titles lists headings', () => {
    const md = '## One\n\nx\n\n## Two\n\ny'
    expect(extractH2Titles(md)).toEqual(['One', 'Two'])
  })
})

describe('mergeAppendedSections — echo-guard (draft-time bleed)', () => {
  const draft = `---
title: Guide
---

# Guide

## Section A

${Array(40).fill('word').join(' ')}

## Section B

${Array(40).fill('word').join(' ')}`

  it('refuses an append that opens with its own H1 (near-full rewrite)', () => {
    const echo = `# Guide

## Section A

${Array(40).fill('word').join(' ')}

## Section B

${Array(40).fill('word').join(' ')}`
    const merged = mergeAppendedSections(draft, echo)
    expect(merged).toBe(draft)
  })

  it('refuses an append that opens with a frontmatter block', () => {
    const echo = `---
title: Guide
---

# Guide

## Section A

${Array(40).fill('word').join(' ')}`
    expect(mergeAppendedSections(draft, echo)).toBe(draft)
  })

  it('still accepts genuine section fragments (## headings)', () => {
    const sections = `## Costs and fees

${Array(20).fill('word').join(' ')}`
    const merged = mergeAppendedSections(draft, sections)
    expect(merged).not.toBe(draft)
    expect(merged).toContain('## Costs and fees')
  })
})
