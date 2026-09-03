/**
 * Regression: `unlinked_related_guide` must be clearable deterministically when
 * — and only when — a plain-text Related guides label matches EXACTLY ONE
 * verified live estate URL. Ambiguous and no-match entries remain blocked; no
 * URL is ever invented; headings/bullets/numbering/citations/all already-linked
 * items are preserved.
 */
import {
  normalizeGuideLabel,
  relinkPlainTextRelatedGuides,
  resolveVerifiedEstateAnchors,
  type VerifiedRelatedGuideAnchor,
} from '../lib/seoFactory/relatedGuideLinks'
import { auditReferenceReachability } from '../lib/seoFactory/contentQualityGate'
import { ESTATE_ANCHOR_LINKS } from '../lib/seoFactory/linkAudit'

const ANCHORS: VerifiedRelatedGuideAnchor[] = [
  { label: 'UK Immigration Hub — CaseWorks Guides', url: 'https://legal.yousafeconsultancy.com/uk/' },
  { label: 'YouSafe Consultancy — Immigration Services', url: 'https://yousafeconsultancy.com/' },
]

const DOC = `# UK visa guide

## Related guides

$BULLET

## Sources

- [GOV.UK guidance](https://www.gov.uk/uk-family-visas)
`

function withBullet(bullet: string): string {
  return DOC.replace('$BULLET', bullet)
}

/** Only the Related guides section (up to the next `##` heading). */
function relatedGuidesSection(content: string): string {
  const at = content.search(/^##\s+related guides?\s*$/im)
  if (at < 0) return ''
  const rest = content.slice(at)
  const next = rest.search(/\n##\s+Sources/)
  return next < 0 ? rest : rest.slice(0, next)
}

function orphanCount(content: string): number {
  const finding = auditReferenceReachability(content).find((f) => f.code === 'unlinked_related_guide')
  if (!finding) return 0
  return Number(finding.message.match(/lists (\d+)/)?.[1] ?? 0)
}

describe('normalizeGuideLabel', () => {
  it('collapses em dash / comma mangling and emphasis to one canonical key', () => {
    expect(normalizeGuideLabel('UK Immigration Hub — CaseWorks Guides')).toBe(
      'uk immigration hub caseworks guides',
    )
    expect(normalizeGuideLabel('UK Immigration Hub, CaseWorks Guides')).toBe(
      'uk immigration hub caseworks guides',
    )
    expect(normalizeGuideLabel('**YouSafe Consultancy** — Immigration Services')).toBe(
      'yousafe consultancy immigration services',
    )
  })
})

describe('relinkPlainTextRelatedGuides — deterministic verifier', () => {
  it('fuzzy-matches F-1 OPT related-guide titles onto the documented OPT page', () => {
    const out = relinkPlainTextRelatedGuides(
      withBullet('- F-1 OPT: Application, Timeline & EAD'),
      resolveVerifiedEstateAnchors(null),
    )
    expect(out.relinked).toBe(1)
    expect(out.content).toMatch(/\]\(https:\/\/legal\.yousafeconsultancy\.com\/us\/f1-opt\/?\)/)
    expect(orphanCount(out.content)).toBe(0)
  })

  it('a uniquely matching plain-text entry becomes a verified Markdown link and clears the blocker', () => {
    const out = relinkPlainTextRelatedGuides(
      withBullet('- UK Immigration Hub, CaseWorks Guides'),
      ANCHORS,
    )
    expect(out.relinked).toBe(1)
    expect(out.content).toContain('- [UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)')
    expect(orphanCount(out.content)).toBe(0)
  })

  it('tolerates the adverbial prefix the sentence-rhythm pass glued on', () => {
    const out = relinkPlainTextRelatedGuides(
      withBullet('- In this case, YouSafe Consultancy, Immigration Services'),
      ANCHORS,
    )
    expect(out.relinked).toBe(1)
    expect(out.content).toContain('- [YouSafe Consultancy — Immigration Services](https://yousafeconsultancy.com/)')
    expect(orphanCount(out.content)).toBe(0)
  })

  it('only matches inside reference-style sections — prose + numbered lists preserved', () => {
    const doc = `# Title

See the UK guide for details.

1. first step
2. second step

## Related guides

- UK Immigration Hub, CaseWorks Guides
`
    const out = relinkPlainTextRelatedGuides(doc, ANCHORS)
    // Prose line untouched; numbered sources unaffected (not a reference section).
    expect(out.content).toContain('See the UK guide for details.')
    expect(out.content).toContain('1. first step')
    expect(out.relinked).toBe(1)
    expect(out.content).toContain('- [UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)')
  })

  it('ambiguous label -> no URL invented, entry stays a blocker', () => {
    const ambiguous: VerifiedRelatedGuideAnchor[] = [
      { label: 'Immigration Services', url: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'Immigration Services', url: 'https://yousafeconsultancy.com/' },
    ]
    const out = relinkPlainTextRelatedGuides(withBullet('- Immigration Services'), ambiguous)
    expect(out.relinked).toBe(0)
    expect(out.ambiguous).toBe(1)
    expect(out.content).toContain('- Immigration Services')
    expect(relatedGuidesSection(out.content).match(/^- Immigration Services$/m)).not.toBeNull()
    expect(relatedGuidesSection(out.content).match(/^- \[[^\]]+\]\([^)]+\)$/m)).toBeNull()
    expect(orphanCount(out.content)).toBe(1)
  })

  it('no-match label -> stays a blocker, nothing is manufactured', () => {
    const out = relinkPlainTextRelatedGuides(withBullet('- Administrative Review Letter Template UK'), ANCHORS)
    expect(out.relinked).toBe(0)
    expect(out.unmatched).toBe(1)
    expect(out.removed).toBe(0)
    expect(out.content).toContain('- Administrative Review Letter Template UK')
    expect(relatedGuidesSection(out.content).match(/^- Administrative Review Letter Template UK$/m)).not.toBeNull()
    expect(relatedGuidesSection(out.content).match(/^- \[[^\]]+\]\([^)]+\)$/m)).toBeNull()
    expect(orphanCount(out.content)).toBe(1)
  })

  it('removeUnmatched deletes no-match entries deterministically (playbook: delete entry when no live guide exists)', () => {
    const out = relinkPlainTextRelatedGuides(
      withBullet('- Administrative Review Letter Template UK'),
      ANCHORS,
      true,
    )
    expect(out.relinked).toBe(0)
    expect(out.unmatched).toBe(1)
    expect(out.removed).toBe(1)
    expect(out.content).not.toContain('- Administrative Review Letter Template UK')
    expect(orphanCount(out.content)).toBe(0)
    // Sources and non-reference sections survive untouched.
    expect(out.content).toContain('- [GOV.UK guidance](https://www.gov.uk/uk-family-visas)')
  })

  it('removeUnmatched deletes ambiguous entries and never invents a destination', () => {
    const ambiguous: VerifiedRelatedGuideAnchor[] = [
      { label: 'Immigration Services', url: 'https://legal.yousafeconsultancy.com/us/' },
      { label: 'Immigration Services', url: 'https://yousafeconsultancy.com/' },
    ]
    const out = relinkPlainTextRelatedGuides(withBullet('- Immigration Services'), ambiguous, true)
    expect(out.ambiguous).toBe(1)
    expect(out.removed).toBe(1)
    expect(out.content).not.toContain('- Immigration Services')
    expect(orphanCount(out.content)).toBe(0)
  })

  it('removeUnmatched honors already-linked and bare-URL entries', () => {
    const doc = `## Related guides

- [UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)
- https://www.gov.uk/uk-family-visas
- A no-match orphan
`
    const out = relinkPlainTextRelatedGuides(doc, ANCHORS, true)
    expect(out.removed).toBe(1)
    expect(out.content).toContain('](https://legal.yousafeconsultancy.com/uk/)')
    expect(out.content).toContain('https://www.gov.uk/uk-family-visas')
    expect(out.content).not.toContain('A no-match orphan')
  })

  it('already-linked and bare-URL entries are never touched', () => {
    const doc = `## Related guides

- [UK Immigration Hub — CaseWorks Guides](https://legal.yousafeconsultancy.com/uk/)
- https://www.gov.uk/uk-family-visas

## Sources

- A guide that is only named: UK Immigration Hub, CaseWorks Guides
`
    const out = relinkPlainTextRelatedGuides(doc, ANCHORS)
    expect(out.relinked).toBe(0)
    // Link intact, bare URL untouched (its own blocker is bare_url_not_hyperlinked),
    // and the "Sources" bullet is not a related-guide section.
    expect(out.content).toContain('](https://legal.yousafeconsultancy.com/uk/)')
    expect(out.content).toContain('https://www.gov.uk/uk-family-visas')
    expect(out.content).toContain('A guide that is only named: UK Immigration Hub, CaseWorks Guides')
  })

  it('matches all reference-section heading spellings the gate flags', () => {
    for (const heading of ['## Related reading', '## Related resources', '## Further reading', '## See also', '## Related guide']) {
      const doc = `${heading}\n\n- UK Immigration Hub, CaseWorks Guides`
      const out = relinkPlainTextRelatedGuides(doc, ANCHORS)
      expect(out.relinked).toBe(1)
      expect(out.content).toContain('](https://legal.yousafeconsultancy.com/uk/)')
    }
  })
})

describe('resolveVerifiedEstateAnchors — verify-before-relink', () => {
  it('keeps documented static anchors and adds live sitemap pages as slug labels', () => {
    const urls = new Set(['https://legal.yousafeconsultancy.com/us/f1-opt/'])
    const anchors = resolveVerifiedEstateAnchors(urls)
    const urlsPresent = anchors.map((a) => a.url)
    expect(urlsPresent).toContain('https://legal.yousafeconsultancy.com/uk/')
    expect(urlsPresent).toContain('https://yousafeconsultancy.com/')
    expect(urlsPresent.some((u) => /f1-opt/i.test(u))).toBe(true)
  })

  it('falls back to the documented static anchors when the live set is empty', () => {
    expect(resolveVerifiedEstateAnchors(new Set())).toEqual(Object.values(ESTATE_ANCHOR_LINKS).flat())
    expect(resolveVerifiedEstateAnchors([])).toEqual(Object.values(ESTATE_ANCHOR_LINKS).flat())
    expect(resolveVerifiedEstateAnchors(null)).toEqual(Object.values(ESTATE_ANCHOR_LINKS).flat())
  })

  it('only relinks to URLs the verified set proves (end to end)', () => {
    const verified = resolveVerifiedEstateAnchors(new Set(['https://legal.yousafeconsultancy.com/uk/']))
    const out = relinkPlainTextRelatedGuides(
      withBullet('- UK Immigration Hub, CaseWorks Guides'),
      verified,
    )
    expect(out.relinked).toBe(1)
    expect(out.content).toContain('](https://legal.yousafeconsultancy.com/uk/)')
  })
})