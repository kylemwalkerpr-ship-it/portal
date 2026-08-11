/**
 * Regression tests for inline-annotation synthesis (lib/seoFactory/inlineAnnotations.ts).
 *
 * Locks in the fix for "warnings have no way of being resolved": evidence-less
 * quality-gate warnings (tone_whilst, emdash_spam, missing_reader_path,
 * missing_second_person, wall_of_text…) previously produced ZERO annotations,
 * so the editor showed a warning count with no Fix button. Every finding must
 * now yield a fixable annotation.
 */

import { findingToAnnotations, buildWarningsFixPrompt, mergeWarnings } from '@/lib/seoFactory/inlineAnnotations'
import type { QualityFinding } from '@/lib/seoFactory/contentQualityGate'

const CONTENT = `---
title: Student Visa Guide
---

# Student Visa Guide

Applicants must prepare documents whilst the process runs.

## Eligibility Requirements

You submit your application, then you attend the interview. The department
requires proof of funds. You should check the official schedule.

## FAQ

What is a student visa?
A permission to study issued by the host country.
`

function warn(over: Partial<QualityFinding>): QualityFinding {
  return {
    code: 'tone_whilst',
    severity: 'warning',
    message: 'Prefer "while" over "whilst" for plain international English',
    fix: 'Replace whilst → while',
    ...over,
  }
}

describe('findingToAnnotations', () => {
  it('evidence-less warning still yields a fixable annotation anchored in content', () => {
    const anns = findingToAnnotations(CONTENT, warn({}))
    expect(anns.length).toBeGreaterThanOrEqual(1)
    expect(anns[0].severity).toBe('warning')
    expect(anns[0].code).toBe('tone_whilst')
    expect(anns[0].fix).toContain('whilst')
    // The annotation is anchored at the actual "whilst" token (code-token lookup)
    expect(anns[0].highlightedText.toLowerCase()).toContain('whilst')
    expect(anns[0].line).toBeGreaterThanOrEqual(1)
  })

  it('structural warnings fall back to a document-level anchor (never empty)', () => {
    const structural = [
      warn({ code: 'missing_reader_path', message: 'Long guide has no visible reading path / contents aid', fix: 'Add a concise table of contents' }),
      warn({ code: 'missing_second_person', message: 'Little or no second person ("you") — reads abstract', fix: 'Address the reader directly' }),
      warn({ code: 'wall_of_text', message: 'Several prose blocks are too dense', fix: 'Break dense paragraphs into 1–3 sentence units' }),
      warn({ code: 'missing_visual_break', message: 'Long-form page has no useful list or comparison table', fix: 'Add a genuine checklist or table' }),
    ]
    for (const f of structural) {
      const anns = findingToAnnotations(CONTENT, f)
      expect(anns.length).toBeGreaterThanOrEqual(1)
      expect(anns[0].severity).toBe('warning')
      expect(anns[0].code).toBe(f.code)
    }
  })

  it('evidence-bearing blockers still anchor at the exact flagged text', () => {
    const f = warn({
      code: 'ai_slop',
      severity: 'blocker',
      message: 'Machine-sounding phrasing',
      fix: 'Rewrite plainly',
      evidence: 'whilst the process runs',
    })
    const anns = findingToAnnotations(CONTENT, f)
    expect(anns.length).toBeGreaterThanOrEqual(1)
    expect(anns[0].severity).toBe('blocker')
    expect(anns[0].highlightedText).toContain('whilst the process runs')
  })

  it('sentence_start_repetition maps every matching sentence start', () => {
    const f = warn({
      code: 'sentence_start_repetition',
      severity: 'warning',
      message: 'Same sentence opening repeated 5× ("applicants must…")',
      fix: 'Vary sentence openings',
      evidence: 'Applicants must',
    })
    const anns = findingToAnnotations(CONTENT, f)
    expect(anns.length).toBeGreaterThanOrEqual(1)
    for (const a of anns) expect(a.code).toBe('sentence_start_repetition')
  })
})

describe('mergeWarnings', () => {
  it('merges quality + audit warnings deduped by code (audit-only preserved)', () => {
    const merged = mergeWarnings(
      [warn({ code: 'tone_whilst' }), warn({ code: 'missing_second_person' })],
      [warn({ code: 'schema_article', message: 'Missing Article JSON-LD', fix: 'Add Article schema' }), warn({ code: 'meta_description', message: 'Missing meta description' }), warn({ code: 'tone_whilst' })],
    )
    const codes = merged.map((w) => w.code)
    expect(codes).toContain('tone_whilst')
    expect(codes).toContain('missing_second_person')
    expect(codes).toContain('schema_article')
    expect(codes).toContain('meta_description')
    // quality finding wins the code collision
    expect(merged.find((w) => w.code === 'tone_whilst')!.message).toBe('Prefer "while" over "whilst" for plain international English')
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('buildWarningsFixPrompt', () => {
  it('lists every warning with its remediation and demands minimal edits', () => {
    const prompt = buildWarningsFixPrompt(CONTENT, [
      { code: 'tone_whilst', message: 'Prefer "while"', fix: 'Replace whilst → while' },
      { code: 'missing_reader_path', message: 'No contents aid', fix: 'Add a table of contents' },
    ])
    expect(prompt).toMatch(/WARNINGS SWEEP/)
    expect(prompt).toContain('[tone_whilst]')
    expect(prompt).toContain('[missing_reader_path]')
    expect(prompt).toContain('Replace whilst → while')
    expect(prompt).toMatch(/smallest possible edits/i)
    expect(prompt).toMatch(/Do NOT regenerate/i)
  })
})
