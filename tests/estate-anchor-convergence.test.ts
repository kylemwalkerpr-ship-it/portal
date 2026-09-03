/**
 * Regression: `unlinked_related_guide` must be CLEARABLE.
 *
 * Live defect (2026-08-31): a queue draft scored human 100/100 yet stayed
 * permanently blocked, and each "Audit & Fix All" run made it worse —
 * 2 → 4 → 6 → 8 plain-text guide titles. Four cooperating bugs:
 *
 *  1. `hallucinated_links_stripped` delinked EVERY yousafeconsultancy.com
 *     markdown link, including the verified-live ESTATE_ANCHOR_LINKS that the
 *     internal-link injector re-adds moments later in the same pass.
 *  2. The em-dash AI-slop cleanup rewrote anchor LABEL text, so
 *     "UK Immigration Hub — CaseWorks Guides" became
 *     "UK Immigration Hub, CaseWorks Guides" — one guide reported as two.
 *  3. The injector deduped on URL only, so the delinked/mangled copy never
 *     suppressed re-injection: two fresh orphans accumulated per run.
 *  4. The sentence-rhythm pass prefixed an adverbial onto link-only list items
 *     ("In this case, [Guide](url)"), corrupting the citation.
 *
 * The gate was right that the content was unreachable; the repair chain was
 * producing the very defect it then refused to ship.
 */
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { auditReferenceReachability } from '../lib/seoFactory/contentQualityGate'
import { ESTATE_ANCHOR_LINKS } from '../lib/seoFactory/linkAudit'

const FM = `---
title: Australia Student Visa Fee Increase 2026
description: What the fee change means for applicants this year.
---`

const BODY = `
# Australia Student Visa Fee Increase 2026

## In 60 seconds

- The application charge rose again in 2026.
- Budget for the new amount before you lodge.
- Dependants attract separate charges.

## What changed

The department raised the charge, so you confirm the current figure first.

## FAQ

### How much is the fee now?
Check the official schedule, because the figure changes by route.

### Who pays extra?
Dependants included in the application attract their own charge.

### Can I get a refund?
Refunds are rare and apply only in narrow circumstances.

## Sources

- [Home Affairs visa pricing](https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges)
`

const DISCLAIMER = '\nThis guide is educational only and is not legal advice.\n'

function relatedSection(content: string): string {
  const at = content.search(/^##\s+related guides?\s*$/im)
  if (at < 0) return ''
  const rest = content.slice(at)
  const next = rest.slice(3).search(/^##\s+/m)
  return next < 0 ? rest : rest.slice(0, next + 3)
}

function orphanCount(content: string): number {
  const finding = auditReferenceReachability(content).find((f) => f.code === 'unlinked_related_guide')
  if (!finding) return 0
  return Number(finding.message.match(/lists (\d+)/)?.[1] ?? 0)
}

const repair = (content: string, region = 'AU') =>
  applyDeterministicRepairs({
    content,
    title: 'Australia Student Visa Fee Increase 2026',
    primaryKeyword: 'australia student visa fee increase',
    region,
    indexable: true,
    contentType: 'article',
  })

describe('estate anchor convergence — unlinked_related_guide is clearable', () => {
  it('never delinks a verified-live estate anchor it just injected', () => {
    const draft = [
      FM,
      BODY,
      '## Related guides',
      '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      '- [YouSafe Consultancy — Immigration Services](https://yousafeconsultancy.com/)',
      DISCLAIMER,
    ].join('\n')

    const { content } = repair(draft)
    expect(orphanCount(content)).toBe(0)
    // The exact verified URLs must still be linked, not reduced to bare text.
    expect(content).toContain('](https://legal.yousafeconsultancy.com/au/)')
    expect(content).toContain('](https://yousafeconsultancy.com/)')
  })

  it('preserves the em dash inside anchor label text (one guide, not two)', () => {
    const draft = [FM, BODY, '## Related guides', '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      DISCLAIMER].join('\n')

    const { content } = repair(draft)
    expect(content).toContain('[Australia Immigration Hub — CaseWorks Guides]')
    expect(content).not.toContain('Australia Immigration Hub, CaseWorks Guides')
  })

  it('still converts clause em dashes in PROSE to commas', () => {
    const draft = [FM, BODY.replace(
      'The department raised the charge, so you confirm the current figure first.',
      'The department raised the charge — you confirm the current figure first.',
    ), '## Related guides', '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      DISCLAIMER].join('\n')

    const { content } = repair(draft)
    expect(content).toContain('raised the charge, you confirm')
  })

  it('does not grow orphans across repeated Fix All runs (was 2 → 4 → 6 → 8)', () => {
    let content = [FM, BODY, '## Related guides', '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      '- [YouSafe Consultancy — Immigration Services](https://yousafeconsultancy.com/)',
      DISCLAIMER].join('\n')

    for (let run = 0; run < 4; run++) {
      content = repair(content).content
      expect(orphanCount(content)).toBe(0)
    }
    // And the section never accumulates duplicate bullets.
    const bullets = relatedSection(content).split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l))
    expect(bullets.length).toBe(new Set(bullets.map((b) => b.trim())).size)
    expect(bullets.length).toBeLessThanOrEqual(3)
  })

  it('self-heals a draft already corrupted in the queue (8 plain-text orphans)', () => {
    const corrupted = [
      FM.replace(/Australia/g, 'UK'), BODY.replace(/Australia/g, 'UK'),
      '## Related guides', '',
      // Delinked + comma-mangled + adverbial-prefixed, exactly as reported live.
      '- UK Immigration Hub, CaseWorks Guides',
      '- In this case, YouSafe Consultancy, Immigration Services',
      '- UK Immigration Hub, CaseWorks Guides',
      '- YouSafe Consultancy, Immigration Services',
      '- UK Immigration Hub, CaseWorks Guides',
      '- YouSafe Consultancy, Immigration Services',
      '- UK Immigration Hub, CaseWorks Guides',
      '- YouSafe Consultancy, Immigration Services',
      DISCLAIMER,
    ].join('\n')

    expect(orphanCount(corrupted)).toBe(8)
    const first = applyDeterministicRepairs({
      content: corrupted, primaryKeyword: 'uk student visa fee increase',
      region: 'UK', indexable: true, contentType: 'article',
    })
    expect(orphanCount(first.content)).toBe(0)
    expect(first.applied.some((a) => a.startsWith('estate_labels_relinked'))).toBe(true)
    expect(first.content).toContain('[UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)')
    // Duplicates collapse instead of shipping an eight-item padded list.
    const bullets = relatedSection(first.content).split('\n').filter((l) => /^\s*[-*+]\s+\S/.test(l))
    expect(bullets.length).toBe(2)

    // Idempotent: a second run changes nothing about reachability.
    const second = applyDeterministicRepairs({
      content: first.content, primaryKeyword: 'uk student visa fee increase',
      region: 'UK', indexable: true, contentType: 'article',
    })
    expect(orphanCount(second.content)).toBe(0)
  })

  it('never prefixes an adverbial onto a link-only reference item', () => {
    const linkBullets = Array.from({ length: 9 }, () =>
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
    ).join('\n')
    const draft = [FM, BODY, '## Related guides', '', linkBullets, DISCLAIMER].join('\n')

    const { content } = repair(draft)
    for (const opener of ['In this case,', 'In practice,', 'As a result,', 'On review,', 'For applicants,']) {
      expect(content).not.toContain(`- ${opener} [`)
    }
    expect(orphanCount(content)).toBe(0)
  })

  it('still strips genuinely hallucinated estate links', () => {
    const draft = [FM, BODY,
      'See the [made up page](https://legal.yousafeconsultancy.com/au/this-page-does-not-exist) for details.',
      '', '## Related guides', '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      DISCLAIMER].join('\n')

    const { content } = repair(draft)
    expect(content).not.toContain('/au/this-page-does-not-exist')
    expect(content).toContain('made up page')
    // ...while the verified anchor survives.
    expect(content).toContain('](https://legal.yousafeconsultancy.com/au/)')
  })

  it('every verified anchor label round-trips through the repair chain', () => {
    for (const [region, anchors] of Object.entries(ESTATE_ANCHOR_LINKS)) {
      const draft = [FM, BODY, '## Related guides', '',
        ...anchors.map((a) => `- [${a.label}](${a.url})`), DISCLAIMER].join('\n')
      const { content } = applyDeterministicRepairs({
        content: draft, primaryKeyword: 'student visa fee increase',
        region, indexable: true, contentType: 'article',
      })
      expect(orphanCount(content)).toBe(0)
      for (const anchor of anchors) expect(content).toContain(`](${anchor.url})`)
    }
  })

  it('live-defect regression: unmatched plain-text orphans HOLD and stay blockers (no AI, no deletion)', () => {
    // 2026-08-31 live queue: an AU guide scored human 100/100 yet stayed
    // blocked because two plain-text guide titles matched no verified anchor.
    // The deterministic chain must NOT silently delete them either — removal is
    // now held for the editor so `unlinked_related_guide` keeps blocking with
    // the evidence intact. The pass only ever re-links unique matches.
    const draft = [
      FM, BODY,
      '## Related guides', '',
      '- [Australia Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/au/)',
      '- Something the estate never published and cannot verify',
      '- Student Fees Explained (no live page anywhere)',
      DISCLAIMER,
    ].join('\n')
    expect(orphanCount(draft)).toBe(2)
    const { content, applied } = applyDeterministicRepairs({
      content: draft, title: 'Australia Student Visa Fee Increase 2026',
      primaryKeyword: 'australia student visa fee increase',
      region: 'AU', indexable: true, contentType: 'article',
    })
    // Unmatched evidence is preserved (not deleted) and still blocks.
    expect(orphanCount(content)).toBe(2)
    expect(content).toContain('Something the estate never published')
    expect(content).toContain('Student Fees Explained')
    expect(applied.some((a) => a.startsWith('unlinked_guide_entries_removed'))).toBe(false)
    // The verified link and the Sources citation survive untouched.
    expect(content).toContain('](https://legal.yousafeconsultancy.com/au/)')
    expect(content).toContain('](https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges)')
    // Idempotent — a second run re-links the match but does not re-add or
    // drop entries; the unmatched evidence is still there and still blocks.
    const second = applyDeterministicRepairs({
      content, title: 'Australia Student Visa Fee Increase 2026',
      primaryKeyword: 'australia student visa fee increase',
      region: 'AU', indexable: true, contentType: 'article',
    })
    expect(orphanCount(second.content)).toBe(2)
    expect(second.content).toContain('Something the estate never published')
    expect(second.content).toContain('Student Fees Explained')
    expect(second.content).toContain('](https://legal.yousafeconsultancy.com/au/)')
  })
})
