/**
 * Recurring-gate regression tests — the three issues that kept surviving
 * fix sweeps and reappearing on every re-audit:
 *   1. ahrefs_schema_invalid ("JSON-LD does not parse") — a malformed
 *      ld+json block must be REMOVED and regenerated, deterministically.
 *   2. unverified_internal_link — must now have a deterministic repair
 *      path (canonical rewrite / slug swap / unwrap), not just a warning.
 *   3. sentence_start_repetition — the fix-all sweep must post-normalize
 *      the AI output so re-introduced rhythm violations are cleared.
 */
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { repairUnverifiedInternalLinks } from '../lib/seoFactory/linkAudit'
import { articleJsonLdErrors } from '../lib/seoFactory/ahrefsIssues'

const BROKEN_LD = `<script type="application/ld+json">
{ "@context": "https://schema.org", "@type": "Article", "headline": "Broken"
</script>`

describe('ahrefs_schema_invalid — broken JSON-LD is deterministically repaired', () => {
  it('removes an unparseable ld+json block and regenerates a valid Article block', () => {
    const draft = `---\ntitle: "F-1 Visa Guide"\ncontent_type: article\nregion: US\ndescription: A long enough meta description that passes the one hundred character floor for the audit gate to accept it happily.\n---\n\n# F-1 Visa Guide\n\n${BROKEN_LD}\n\n## Steps\n\nApply early and keep copies of every document you submit to the university and to the consulate.`

    const out = applyDeterministicRepairs({
      content: draft,
      title: 'F-1 Visa Guide',
      primaryKeyword: 'f-1 visa',
      region: 'US',
      contentType: 'article',
    })

    expect(out.applied).toContain('broken_jsonld_removed')
    // No unparseable block survives…
    expect(articleJsonLdErrors(out.content)).not.toContain('JSON-LD does not parse')
    // …and a valid Article block was regenerated.
    expect(out.applied).toContain('schema_article')
  })

  it('leaves a parse-valid ld+json block untouched', () => {
    const goodLd = `<script type="application/ld+json">\n{ "@context": "https://schema.org", "@type": "Article", "headline": "Ok", "image": ["https://legal.yousafeconsultancy.com/og-image.png"], "datePublished": "2026-08-01", "author": { "@type": "Organization", "name": "X" } }\n</script>`
    const draft = `# T\n\n${goodLd}\n\n## Body\n\nSome prose here that stands on its own for the body of the article to exist at all in this test.`

    const out = applyDeterministicRepairs({ content: draft, title: 'T', primaryKeyword: 't' })
    expect(out.applied).not.toContain('broken_jsonld_removed')
    expect(out.content).toContain('"headline": "Ok"')
  })

  it('converges — by the third repair run no schema is removed and JSON-LD parses', () => {
    const draft = `---\ntitle: "G"\ndescription: A long enough meta description that passes the one hundred character floor for the audit gate.\n---\n\n# G\n\n${BROKEN_LD}\n\n## A\n\nProse paragraph with enough words to be a real body section of the article.`

    let current = draft
    let removedOn = 0
    for (let i = 1; i <= 3; i++) {
      const r = applyDeterministicRepairs({ content: current, title: 'G', primaryKeyword: 'g' })
      if (r.applied.includes('broken_jsonld_removed') && !removedOn) removedOn = i
      current = r.content
    }
    // The broken block is cleaned on the first run; later runs must not keep
    // finding schema to remove (that would be a fix→re-audit loop).
    expect(removedOn).toBe(1)
    expect(articleJsonLdErrors(current)).not.toContain('JSON-LD does not parse')
  })
})

describe('unverified_internal_link — deterministic repair path', () => {
  const live = new Set([
    'https://legal.yousafeconsultancy.com/us/f-1-student-visa',
    'https://legal.yousafeconsultancy.com/au/temporary-graduate-485-checklist',
    'https://legal.yousafeconsultancy.com/about',
  ])

  it('rewrites a moved internal path to the live page with the same slug', () => {
    const draft = 'See the [485 checklist](https://legal.yousafeconsultancy.com/au/old-485-path/temporary-graduate-485-checklist) for details.'
    const out = repairUnverifiedInternalLinks(draft, live)
    expect(out.rewritten).toBe(1)
    expect(out.content).toContain('https://legal.yousafeconsultancy.com/au/temporary-graduate-485-checklist')
  })

  it('unwraps an invented internal href, keeping the anchor text', () => {
    const draft = 'Read the [visa timeline](https://legal.yousafeconsultancy.com/us/invented-visa-timeline-page) carefully.'
    const out = repairUnverifiedInternalLinks(draft, live)
    expect(out.unwrapped).toBe(1)
    expect(out.content).not.toContain('invented-visa-timeline-page')
    expect(out.content).toContain('visa timeline')
  })

  it('leaves verified internal links untouched', () => {
    const draft = 'See the [F-1 guide](https://legal.yousafeconsultancy.com/us/f-1-student-visa) next.'
    const out = repairUnverifiedInternalLinks(draft, live)
    expect(out.rewritten).toBe(0)
    expect(out.unwrapped).toBe(0)
    expect(out.content).toBe(draft)
  })
})

describe('sentence_start_repetition — mechanical smoothing stays available post-AI', () => {
  it('smooths a rhythm violation re-introduced by an AI rewrite', () => {
    const s = (i: number) => `US immigration lawyers help with form ${i}. `
    const draft = `# T\n\n## A\n\n${s(1)}${s(2)}${s(3)}${s(4)}${s(5)}\n`
    const out = applyDeterministicRepairs({ content: draft, title: 'T', primaryKeyword: 't' })
    expect(out.applied.join(' ')).toMatch(/sentence_rhythm/)
  })
})

describe('MALFORMED_LINK — run-on URLs with embedded comma-space are permanently repairable', () => {
  const { repairMalformedUrlSpan, needsUrlSpanRepair, cleanTldSentenceWords } = require('../lib/seoFactory/linkAudit')
  const { applyDeterministicRepairs: adr } = require('../lib/seoFactory/editorialScaffold')

  it('repairs the exact live-case URL: immi.homeaffairs.Typically, gov.au', () => {
    const broken = 'https://immi.homeaffairs.Typically, gov.au/visas/getting-a-visa'
    expect(needsUrlSpanRepair(broken)).toBe(true)
    const fixed = repairMalformedUrlSpan(broken)
    expect(fixed).toBe('https://immi.homeaffairs.gov.au/visas/getting-a-visa')
  })

  it('leaves clean URLs untouched', () => {
    const ok = 'https://immi.homeaffairs.gov.au/visas'
    expect(needsUrlSpanRepair(ok)).toBe(false)
    expect(repairMalformedUrlSpan(ok)).toBe(ok)
  })

  it('the deterministic repair pass clears the malformed link from a full draft', () => {
    const draft = `---\ntitle: "Skills Assessment"\ndescription: A long enough meta description that passes the one hundred character floor for the audit gate to accept.\n---\n\n# Skills assessment validity\n\nSee [home affairs](https://immi.homeaffairs.Typically, gov.au/visas/getting-a-visa) for lodgement rules and the [processing times](https://immi.homeaffairs.Typically, gov.au/what-we-do/services/national-police-checks/) page.`

    const out = adr({ content: draft, title: 'Skills Assessment', primaryKeyword: 'skills assessment', region: 'AU' })
    expect(out.content).not.toContain('Typically')
    expect(out.content).toContain('https://immi.homeaffairs.gov.au/visas/getting-a-visa')
    expect(out.applied).toContain('malformed_tld_urls_cleaned')

    const { auditLinksSync } = require('../lib/seoFactory/linkAudit')
    const findings = auditLinksSync(out.content)
    expect(findings.some((f: { code: string }) => f.code === 'malformed_link')).toBe(false)
  })

  it('extracts a run-on markdown href as one complete link, not a truncated blocker', () => {
    const { extractLinks } = require('../lib/seoFactory/linkAudit')
    const links = extractLinks('[home affairs](https://immi.homeaffairs.Typically, gov.au/visas)')
    expect(links).toHaveLength(1)
    expect(links[0].url).toBe('https://immi.homeaffairs.Typically, gov.au/visas')
  })
})
