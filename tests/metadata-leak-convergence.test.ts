/**
 * `renderable_metadata_leak` must always be clearable.
 *
 * Production report (score 88/100, 1 blocker): a draft blocked on
 * `renderable_metadata_leak` and "Audit & Fix" could not resolve it, because an
 * **unterminated** `<script …>` block satisfied neither repair pass:
 *
 *   - every schema pass in `normalizeEditorDocument` matched only COMPLETE
 *     `<script>…</script>` blocks, so the fragment was never removed;
 *   - the inline-schema scanner latched `inScript = true` on the opening tag
 *     and never reset, so every later leaked line was skipped too;
 *   - the gate's `stripForScan` also masks only complete blocks, so the JSON
 *     stayed *visible* and the blocker kept firing.
 *
 * Net effect: a permanent ship blocker with no repair path — the exact
 * gate/repair contract violation this suite exists to prevent.
 */
import { normalizeEditorDocument } from '../lib/seoFactory/formatContract'
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'

const article = (leak: string) => `---
title: Estimated Tax Payment Help 2026
description: How international students handle quarterly estimated tax payments.
---

# Estimated Tax Payment Help 2026

## In 60 seconds

- You may owe estimated tax when withholding falls short.
- Deadlines fall quarterly across the tax year.
- Penalties apply when a payment arrives late.

## Who must pay

You confirm your withholding, then you compare it against the liability.

${leak}

## FAQ

### Who must pay estimated tax?
Nonresident students with untaxed income often must pay quarterly.

### When are payments due?
Payments fall due in April, June, September, and January.

### What if I underpay?
The agency may charge an underpayment penalty on the shortfall.

### Can I pay online?
Yes, the official portal accepts electronic payments.

## Sources

- [IRS official site](https://www.irs.gov/)

## Related guides

- [Student tax guide](https://legal.yousafeconsultancy.com/us/student-tax)

This guide is educational only and is not legal advice.
`

const leaks: Record<string, string> = {
  'unterminated script block': '<script type="application/ld+json">\n{ "@context": "https://schema.org", "@type": "Article" }',
  'raw JSON-LD with no script tag': '{ "@context": "https://schema.org", "@type": "Article", "headline": "X" }',
  'inline frontmatter line': '--- title: Estimated Tax Payment Help 2026',
}

const leakFires = (md: string) =>
  evaluateContentQuality({
    content: md,
    contentType: 'legal_guide',
    primaryKeyword: 'estimated tax payment help',
    indexable: true,
  }).findings.some((f) => f.code === 'renderable_metadata_leak')

describe('renderable_metadata_leak is always repairable', () => {
  it.each(Object.entries(leaks))('deterministic repair clears: %s', (_name, leak) => {
    const doc = article(leak)
    expect(leakFires(doc)).toBe(true)

    const repaired = applyDeterministicRepairs({
      content: doc,
      primaryKeyword: 'estimated tax payment help',
      indexable: true,
    })
    expect(leakFires(repaired.content)).toBe(false)
  })

  it.each(Object.entries(leaks))('repair is idempotent: %s', (_name, leak) => {
    const opts = { primaryKeyword: 'estimated tax payment help', indexable: true }
    const once = applyDeterministicRepairs({ content: article(leak), ...opts })
    const twice = applyDeterministicRepairs({ content: once.content, ...opts })
    expect(leakFires(twice.content)).toBe(false)
  })
})

describe('normalizeEditorDocument — unterminated script handling', () => {
  it('drops the fragment and records the repair', () => {
    const doc = article('<script type="application/ld+json">\n{ "@context": "https://schema.org", "@type": "Article" }')
    const { content, fixed } = normalizeEditorDocument(doc)
    expect(fixed).toContain('editor_unterminated_schema_dropped')
    expect(content).not.toContain('<script')
    expect(content).not.toContain('@context')
  })

  it('never consumes body prose or headings following the fragment', () => {
    const doc = article('<script type="application/ld+json">\n{ "@context": "https://schema.org" }')
    const { content } = normalizeEditorDocument(doc)
    expect(content).toContain('## FAQ')
    expect(content).toContain('Nonresident students with untaxed income often must pay quarterly.')
    expect(content).toContain('## Sources')
    expect(content).toContain('This guide is educational only and is not legal advice.')
  })

  it('leaves a complete, valid JSON-LD block untouched', () => {
    const valid = [
      '<script type="application/ld+json">',
      '{"@context":"https://schema.org","@type":"Article","headline":"Estimated Tax Payment Help 2026"}',
      '</script>',
    ].join('\n')
    const { content, fixed } = normalizeEditorDocument(article(valid))
    expect(fixed).not.toContain('editor_unterminated_schema_dropped')
    expect(content).toContain('"@type":"Article"')
  })

  it('still repairs leaked fragments that appear AFTER an unclosed tag', () => {
    // The latching `inScript` flag used to skip everything past the first
    // unclosed tag, so this second leak survived every pass.
    const doc = article(
      '<script type="application/ld+json">\n{ "@context": "https://schema.org", "@type": "Article" }',
    ).replace(
      '## Sources',
      '{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [] }\n\n## Sources',
    )
    const { content } = normalizeEditorDocument(doc)
    expect(content).not.toContain('FAQPage')
    expect(content).toContain('## Sources')
  })
})
