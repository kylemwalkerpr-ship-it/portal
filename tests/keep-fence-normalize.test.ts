import { normalizeEditorDocument, sanitizeFrontmatter } from '@/lib/seoFactory/formatContract'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'
import { repairClassFor } from '@/lib/seoFactory/contentQualityPlaybook'
import { depthMediationPlan } from '@/lib/seoFactory/reauditContract'
import { applyDeterministicRepairs } from '@/lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '@/lib/seoFactory/contentQualityGate'

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

describe('over-max trim remains clearable with outline gaps', () => {
  it('depthMediationPlan flags overMax so Trim UI can run without Expand', () => {
    const para = 'Applicants should gather passport copies, fee receipts, and a timeline of prior visas before filing. '
    const body = `# Blog title\n\n${para.repeat(90)}`
    const plan = depthMediationPlan(body, 'blog_post', 'student visa fees')
    expect(plan.overMax).toBe(true)
    expect(plan.surplus).toBeGreaterThan(0)
    expect(plan.ok).toBe(true) // Expand must not be offered
    expect(plan.deficit).toBe(0)
  })

  it('word_count_over_max stays a deterministic repair class for Audit & Fix priority', () => {
    expect(repairClassFor('word_count_over_max')).toBe('deterministic')
    expect(repairClassFor('missing_outline_section')).not.toBe('deterministic')
  })
})

describe('KEEP&lt;script + escaped JSON-LD (prod a80c077c)', () => {
  const polluted = `KEEP---
title: "I-129 Nonimmigrant Worker Petition Checklist (2026)"
content_type: blog_post
primaryKeyword: i-129 nonimmigrant worker petition
region: us
description: Use this I-129 nonimmigrant worker petition checklist, gather evidence, then confirm current USCIS forms and fees before your employer files.
---

KEEP&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": []
}
&lt;/script&gt;

# I-129 Petition Checklist Before You File (2026)

Employers file Form I-129. Confirm the live USCIS edition before you mail the packet.

## In 60 seconds

- Confirm the current Form I-129 edition on USCIS.
- Match the wage on the offer letter to the LCA.
- Gather passport, degree, and worksite evidence early.
- Premium processing uses a separate Form I-907.
- An approval notice is not a visa stamp.

## What the petition covers

USCIS uses Form I-129 when a U.S. employer asks to classify you in a temporary worker category.

## FAQ

### Who files, you or your employer?

The employer files Form I-129. You supply evidence.

## Sources

- [USCIS Forms](https://www.uscis.gov/forms)

**Disclaimer:** This page is educational only. It is not legal advice.
`

  it('normalizeEditorDocument peels KEEP--- and unescapes KEEP&lt;script', () => {
    const { content, fixed } = normalizeEditorDocument(polluted)
    expect(fixed).toContain('editor_keep_fence_normalized')
    expect(fixed).toContain('editor_escaped_script_unescaped')
    expect(content).not.toMatch(/KEEP---/i)
    expect(content).not.toMatch(/KEEP&lt;script/i)
    expect(content).not.toMatch(/&lt;script\b/i)
    expect(content).toMatch(/<script\b[^>]*application\/ld\+json/i)
    expect(content.trimStart().startsWith('---')).toBe(true)
  })

  it('applyDeterministicRepairs clears KEEP chrome so body is ship-safe', () => {
    const { content, applied } = applyDeterministicRepairs({
      content: polluted,
      title: 'I-129 Petition Checklist Before You File (2026)',
      primaryKeyword: 'i-129 nonimmigrant worker petition',
      region: 'US',
      contentType: 'blog_post',
    })
    expect(applied.some((a) => a.includes('editor_keep_fence_normalized'))).toBe(true)
    expect(content).not.toMatch(/\bKEEP(?:---+|<script\b|&lt;script\b)/i)
    expect(content).not.toMatch(/&lt;script\b/i)
  })

  it('quality gate blocks KEEP chrome and escaped scripts before repair', () => {
    const result = evaluateContentQuality({
      content: polluted,
      primaryKeyword: 'i-129 nonimmigrant worker petition',
      region: 'US',
      contentType: 'blog_post',
      indexable: true,
    })
    const codes = result.blockers.map((f) => f.code)
    expect(codes).toContain('keep_chrome_leak')
    expect(codes).toContain('escaped_script_leak')
  })

  it('keep_chrome_leak and escaped_script_leak are deterministic format blockers', () => {
    expect(repairClassFor('keep_chrome_leak')).toBe('deterministic')
    expect(repairClassFor('escaped_script_leak')).toBe('deterministic')
  })
})
