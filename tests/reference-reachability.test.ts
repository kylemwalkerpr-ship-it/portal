/**
 * Reference reachability — a reader must be able to REACH every guide and
 * source an article names.
 *
 * Product requirement: "related guides in an article must always have a
 * hyperlink to that guide so that users can reach said guides. Hyperlinks must
 * always have a link to them as well, not just leaving them in the sources
 * part."
 *
 * Two failure modes were shipping silently before these gates existed:
 *   1. `## Related guides` bullets listing guide titles as bare text.
 *   2. Sources entries where the URL sat as plain text, so it never became a
 *      clickable anchor in MDX or in the caseworks JSX renderer.
 */
import { auditReferenceReachability, evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'
import { hyperlinkBareUrls } from '../lib/seoFactory/editorialScaffold'

const codes = (md: string) => auditReferenceReachability(md).map((f) => f.code)

describe('auditReferenceReachability — related guides must be links', () => {
  it('flags related-guide entries listed as plain text', () => {
    const md = [
      '# UK Dependent Visa Guide',
      '',
      '## Related guides',
      '',
      '- UK Spouse Visa Guide',
      '- Financial Requirement Guide',
      '',
    ].join('\n')
    const found = auditReferenceReachability(md)
    const finding = found.find((f) => f.code === 'unlinked_related_guide')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('blocker')
    // The message must name the offending entries so a human can act.
    expect(finding!.message).toContain('UK Spouse Visa Guide')
  })

  it('accepts markdown and HTML linked entries', () => {
    const md = [
      '# G',
      '',
      '## Related guides',
      '',
      '- [UK Spouse Visa Guide](https://legal.yousafeconsultancy.com/uk/spouse-visa)',
      '- <a href="https://legal.yousafeconsultancy.com/uk/financial-requirement">Financial Requirement</a>',
      '',
    ].join('\n')
    expect(codes(md)).not.toContain('unlinked_related_guide')
  })

  it('covers the other related-section headings writers actually use', () => {
    for (const heading of ['Further reading', 'See also', 'Related resources', 'Related reading']) {
      const md = `# G\n\n## ${heading}\n\n- Some Other Guide\n`
      expect(codes(md)).toContain('unlinked_related_guide')
    }
  })

  it('does not flag prose paragraphs inside a related section', () => {
    const md = '# G\n\n## Related guides\n\nThese guides continue the journey.\n\n- [A guide](https://legal.yousafeconsultancy.com/uk/a)\n'
    expect(codes(md)).not.toContain('unlinked_related_guide')
  })

  it('reports a bare URL in a related section once, as bare_url_not_hyperlinked', () => {
    const md = '# G\n\n## Related guides\n\n- https://legal.yousafeconsultancy.com/uk/x\n'
    const found = codes(md)
    expect(found).toContain('bare_url_not_hyperlinked')
    // Never double-reported — one problem, one finding.
    expect(found).not.toContain('unlinked_related_guide')
  })
})

describe('auditReferenceReachability — URLs must be hyperlinked', () => {
  it('flags a bare URL in the Sources section', () => {
    const md = [
      '# G',
      '',
      '## Sources',
      '',
      '- GOV.UK family visa guidance: https://www.gov.uk/family-visa',
      '',
    ].join('\n')
    const finding = auditReferenceReachability(md).find((f) => f.code === 'bare_url_not_hyperlinked')
    expect(finding).toBeDefined()
    expect(finding!.severity).toBe('blocker')
  })

  it('ignores URLs in code fences, inline code, front matter, and hrefs', () => {
    const md = [
      '---',
      'canonical: https://legal.yousafeconsultancy.com/uk/x',
      '---',
      '',
      '# G',
      '',
      'Use `https://api.example.com/v1` as the base.',
      '',
      '```',
      'curl https://raw.example.com/x',
      '```',
      '',
      '- [Linked](https://www.gov.uk/family-visa)',
      '- <a href="https://immi.homeaffairs.gov.au/visas">AU visas</a>',
      '',
    ].join('\n')
    expect(codes(md)).not.toContain('bare_url_not_hyperlinked')
  })
})

describe('hyperlinkBareUrls — deterministic repair', () => {
  it('reuses the label already on the line as anchor text', () => {
    const { content, changed } = hyperlinkBareUrls('- GOV.UK family visa guidance: https://www.gov.uk/family-visa\n')
    expect(changed).toBe(1)
    expect(content.trim()).toBe('- [GOV.UK family visa guidance](https://www.gov.uk/family-visa)')
  })

  it('derives a readable label when the line has none', () => {
    const { content } = hyperlinkBareUrls('- https://www.uscis.gov/green-card\n')
    expect(content.trim()).toBe('- [USCIS — Green Card](https://www.uscis.gov/green-card)')
  })

  it('keeps trailing sentence punctuation outside the link', () => {
    const { content } = hyperlinkBareUrls('See the rules at https://www.gov.uk/browse/visas-immigration.\n')
    expect(content).toContain('](https://www.gov.uk/browse/visas-immigration)')
    expect(content.trimEnd().endsWith('.')).toBe(true)
  })

  it('never rewrites masked regions', () => {
    const md = [
      '---',
      'canonical: https://legal.yousafeconsultancy.com/uk/x',
      '---',
      '',
      'Inline `https://api.example.com/v1` stays.',
      '',
      '```',
      'https://raw.example.com/x',
      '```',
      '',
      '[Linked](https://www.gov.uk/family-visa)',
      '<a href="https://immi.homeaffairs.gov.au/visas">AU</a>',
      '',
    ].join('\n')
    const { content, changed } = hyperlinkBareUrls(md)
    expect(changed).toBe(0)
    expect(content).toBe(md)
  })

  it('is idempotent and clears the gate it repairs', () => {
    const md = [
      '# G',
      '',
      '## Sources',
      '',
      '- Home Office fee table https://www.gov.uk/government/publications/fees',
      '- https://www.uscis.gov/green-card',
      '',
    ].join('\n')
    const first = hyperlinkBareUrls(md)
    expect(first.changed).toBeGreaterThan(0)
    expect(codes(first.content)).not.toContain('bare_url_not_hyperlinked')
    const second = hyperlinkBareUrls(first.content)
    expect(second.changed).toBe(0)
    expect(second.content).toBe(first.content)
  })
})

describe('full gate integration', () => {
  const article = (related: string, sources: string) => [
    '---',
    'title: UK Dependent Visa Guide 2026',
    'description: How partners and children join a UK sponsor, with fees and timelines explained.',
    '---',
    '',
    '# UK Dependent Visa Guide 2026',
    '',
    '## In 60 seconds',
    '',
    '- The UK dependent visa lets partners join a sponsor lawfully.',
    '- You must show the relationship is genuine and subsisting.',
    '- Fees change annually, so confirm the current table first.',
    '',
    '## Eligibility',
    '',
    'You apply online and pay the fee before booking biometrics.',
    'This guidance is educational only and is not legal advice.',
    '',
    '## FAQ',
    '',
    '### Who qualifies?',
    'Partners and children under 18 qualify when the sponsor meets the rules.',
    '',
    '### How long does it take?',
    'Processing normally takes about three weeks after biometrics.',
    '',
    '### What does it cost?',
    'Fees change each year, so check the official fee table before applying.',
    '',
    '### Can I work?',
    'Most dependent visa holders may work without extra permission.',
    '',
    '## Sources',
    '',
    sources,
    '',
    '## Related guides',
    '',
    related,
    '',
  ].join('\n')

  it('blocks unlinked references through evaluateContentQuality', () => {
    const result = evaluateContentQuality({
      content: article('- UK Spouse Visa Guide', '- GOV.UK family visa guidance: https://www.gov.uk/family-visa'),
      primaryKeyword: 'uk dependent visa',
      region: 'uk',
      indexable: true,
    })
    const blockers = result.blockers.map((b) => b.code)
    expect(blockers).toContain('unlinked_related_guide')
    expect(blockers).toContain('bare_url_not_hyperlinked')
  })

  it('passes when every reference is a real link', () => {
    const result = evaluateContentQuality({
      content: article(
        '- [UK Spouse Visa Guide](https://legal.yousafeconsultancy.com/uk/spouse-visa)',
        '- [GOV.UK family visa guidance](https://www.gov.uk/family-visa)',
      ),
      primaryKeyword: 'uk dependent visa',
      region: 'uk',
      indexable: true,
    })
    const blockers = result.blockers.map((b) => b.code)
    expect(blockers).not.toContain('unlinked_related_guide')
    expect(blockers).not.toContain('bare_url_not_hyperlinked')
  })
})
