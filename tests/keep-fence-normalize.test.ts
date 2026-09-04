import { normalizeEditorDocument, sanitizeFrontmatter } from '@/lib/seoFactory/formatContract'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { repairClassFor } from '@/lib/seoFactory/contentQualityPlaybook'

describe('KEEP--- fence normalization (Audit & Fix pollution)', () => {
  const polluted = `KEEP---
title: "AU Student Visa Fee Increase"
description: "Guide to the Australian student visa fee increase for international applicants."
content_type: legal_guide
primaryKeyword: AU student visa fee increase
region: AU
---

# Australian Student Visa Fee Increase

International students face higher visa application charges in 2026. This guide covers the fee schedule, refunds, and how to budget before you lodge.

## Fee schedule

The base student visa charge rose. Confirm the live figure on the Department of Home Affairs site before you pay.
`

  it('normalizeEditorDocument converts KEEP--- into a real YAML fence', () => {
    const { content, fixed } = normalizeEditorDocument(polluted)
    expect(fixed).toContain('editor_keep_fence_normalized')
    expect(content).not.toMatch(/KEEP---/i)
    expect(content.trimStart().startsWith('---')).toBe(true)
  })

  it('sanitizeFrontmatter strips KEEP--- so YAML does not leak into body', () => {
    const out = sanitizeFrontmatter(polluted)
    expect(out).not.toMatch(/KEEP---/i)
    expect(out).toMatch(/^---\r?\n/)
  })

  it('countBodyWords excludes KEEP--- YAML from the body total', () => {
    const words = countBodyWords(polluted)
    expect(words).toBeGreaterThan(20)
    expect(words).toBeLessThan(80)
  })

  it('word_count_over_max is a deterministic trim gate (never expand)', () => {
    expect(repairClassFor('word_count_over_max')).toBe('deterministic')
  })
})
