/**
 * Regression tests for two reported content-studio failures:
 *
 * 1. FORMAT — the Table of Contents (and inline markdown generally) shipped as
 *    raw markdown text on the live page. renderTarget.markdownToJsx escaped
 *    everything; it now renders inline links/bold/code, passes <details>
 *    collapsibles through, handles h4+ headings, and the pipeline rebuilds the
 *    TOC deterministically so anchors always resolve.
 *
 * 2. GATE — an article could audit at 100/100 yet ship refused on a missing
 *    disclaimer, because audit.ts used its own looser disclaimer regex and
 *    suppressed the gate's missing_disclaimer blocker. The audit now uses the
 *    exact same DISCLAIMER_RE, and the remediation loop applies deterministic
 *    repairs so the blocker clears on the next run.
 */
import { renderTargetFile } from '@/lib/seoFactory/renderTarget'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'
import { auditContent } from '@/lib/seoFactory/audit'
import {
  evaluateContentQuality,
  assertQualityGate,
} from '@/lib/seoFactory/contentQualityGate'
import {
  applyDeterministicRepairs,
  buildTableOfContents,
  normalizeReaderStructure,
} from '@/lib/seoFactory/editorialScaffold'

function plan(partial: Partial<OwnerPlan> & Pick<OwnerPlan, 'host' | 'repo' | 'filePath' | 'canonicalUrl'>): OwnerPlan {
  return {
    matched: null,
    matchScore: 0,
    indexable: true,
    action: 'build',
    intentClass: 'procedural',
    contentType: 'legal_guide',
    warnings: [],
    blockers: [],
    ymy: partial.host === 'legal',
    routingSource: 'standing_rules',
    ...partial,
  }
}

// ── Fixture with the exact TOC shape from the reported bug ────────────────
const bodyWithToc = `# N-400 naturalization guide

## In 60 seconds
- Check your continuous presence before you file
- Gather identity and tax documents early
- File only when every item matches the official instructions

## Table of contents
- [Eligibility requirements for Form N-400](#eligibility-requirements-for-form-n-400)
- [Continuous presence and physical presence rules](#continuous-presence-and-physical-presence-rules)
- [Documents required for your N-400 filing](#documents-required-for-your-n-400-filing)
- [Step-by-step filing process](#step-by-step-filing-process)
- [The naturalization interview and civics test](#the-naturalization-interview-and-civics-test)
- [Common reasons for N-400 delays and denials](#common-reasons-for-n-400-delays-and-denials)
- [FAQ](#faq)
- [Sources](#sources)

## Eligibility requirements for Form N-400
You must meet the continuous residence and good moral character tests.

## Continuous presence and physical presence rules
Count the days carefully before filing.

## Documents required for your N-400 filing
Gather the checklist below before you start.

## Step-by-step filing process
Follow the numbered steps on the official form instructions.

## The naturalization interview and civics test
Prepare with the official study materials.

## Common reasons for N-400 delays and denials
Most delays trace to missing evidence or name mismatches.

## FAQ
### Can I file if I travel often?
Keep every trip under six months to preserve continuous presence.

### How long can I stay outside the US during naturalization?
Extended trips may break the continuous residence requirement, so count your days carefully before filing.

### Do I need to take the civics test?
Most applicants must pass the civics and English tests unless an age-and-time-in-status exemption applies.

### What is the continuous presence requirement?
You must show five years of continuous residence in the United States before you file Form N-400.

## Sources
- https://www.uscis.gov/citizenship

**Disclaimer:** This page is educational and editorial only. It is **not legal advice**.
`

// Pad to long-form so the TOC gate applies. Every sentence starts with a
// UNIQUE token so sentence-start repetition never trips the quality gate.
function pad(content: string): string {
  let out = content + '\n\n'
  for (let i = 0; i < 500; i++) {
    out += `detail${i} rounds out the checklist with a concrete filing note. `
    if (i % 6 === 5) out += '\n\n'
  }
  return out
}

const n400Plan = plan({
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/us/n400-guide/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/us/n400-guide/',
})

function render(body: string) {
  return renderTargetFile({
    plan: n400Plan,
    content: body,
    title: 'N-400 naturalization guide',
    region: 'US',
    contentType: 'legal_guide',
    primaryKeyword: 'n 400 eligibility requirements',
    indexable: true,
    canonicalUrl: n400Plan.canonicalUrl,
  }).fileContent
}

describe('renderTarget — inline markdown + TOC rendering', () => {
  it('renders TOC links as anchors, never raw markdown', () => {
    const fileContent = render(bodyWithToc)
    // No literal markdown link syntax in the rendered page
    expect(fileContent).not.toContain('[Eligibility requirements for Form N-400](#')
    // Links become anchors pointing at the heading ids
    expect(fileContent).toContain(
      '<a href="#eligibility-requirements-for-form-n-400">Eligibility requirements for Form N-400</a>',
    )
    expect(fileContent).toContain('<h2 id="eligibility-requirements-for-form-n-400">')
  })

  it('renders bold, inline code, and external links', () => {
    const content = bodyWithToc.replace(
      '## Eligibility requirements for Form N-400',
      '## Eligibility requirements for Form N-400\n\nYou need **continuous residence** and a valid `I-90` number. See [USCIS](https://www.uscis.gov).',
    )
    const fileContent = render(content)
    expect(fileContent).toContain('<strong>continuous residence</strong>')
    expect(fileContent).toContain('<code>I-90</code>')
    expect(fileContent).toContain('https://www.uscis.gov')
    expect(fileContent).toContain('target="_blank"')
  })

  it('passes <details>/<summary> collapsible sections through as JSX', () => {
    const content = bodyWithToc.replace(
      '## Sources',
      '## Sources\n\n<details>\n<summary>Full fee breakdown</summary>\n- $640 filing fee\n- $85 biometrics fee\n</details>\n',
    )
    const fileContent = render(content)
    expect(fileContent).toContain('<details>')
    expect(fileContent).toContain('<summary>Full fee breakdown</summary>')
    expect(fileContent).toContain('</details>')
  })

  it('renders h4+ headings instead of leaking them into paragraphs', () => {
    const content = bodyWithToc.replace(
      '## Documents required for your N-400 filing',
      '## Documents required for your N-400 filing\n\n#### Passport and travel history\nKeep your passport and every I-94 record.',
    )
    const fileContent = render(content)
    expect(fileContent).toContain('<h4 id="passport-and-travel-history">Passport and travel history</h4>')
    expect(fileContent).not.toContain('#### ')
  })
})

describe('deterministic reader TOC (editorialScaffold)', () => {
  it('builds anchor links matching heading slugs', () => {
    const toc = buildTableOfContents(bodyWithToc)
    expect(toc).toContain('## Table of contents')
    expect(toc).toContain(
      '- [Eligibility requirements for Form N-400](#eligibility-requirements-for-form-n-400)',
    )
    expect(toc).toContain('- [FAQ](#faq)')
    expect(toc).not.toContain('- [In 60 seconds]')
  })

  it('inserts a TOC for long-form when the model forgot one', () => {
    const cleaned = normalizeReaderStructure(pad(bodyWithToc))
    expect(cleaned).toContain('## Table of contents')
    expect(cleaned).toContain('#eligibility-requirements-for-form-n-400')
  })

  it('normalizes a broken AI TOC to resolvable anchors', () => {
    const broken = bodyWithToc.replace(
      '- [Eligibility requirements for Form N-400](#eligibility-requirements-for-form-n-400)',
      '- [Eligibility requirements for Form N-400](#eligibility-requirements)',
    )
    const out = normalizeReaderStructure(broken)
    expect(out).toContain(
      '- [Eligibility requirements for Form N-400](#eligibility-requirements-for-form-n-400)',
    )
    expect(out).not.toContain('(#eligibility-requirements)')
  })
})

describe('audit internal_links detector — any estate host counts', () => {
  // 2026-08-13 fix: the detector only matched `](/` and `yousafeconsultancy.com`.
  // caseworks.com links (and future estate subdomains) were invisible to the
  // INTERNAL_LINKS check. Now every estate host counts via countEstateLinks.
  const body = (links: string) => [
    '# Guide',
    '',
    '## In 60 seconds',
    '- A quick answer block.',
    '',
    '## Eligibility',
    'You need a valid passport. ' + 'Eligibility details. '.repeat(30),
    '',
    '## Documents',
    'Passport and proof of funds. ' + 'More documents. '.repeat(30),
    '',
    '## FAQ',
    '- **Q1?** A1.',
    '- **Q2?** A2.',
    '',
    links,
    '',
    'This is educational only, not legal advice.',
  ].join('\n')

  it('clears with two caseworks.com links (previously ignored)', () => {
    const content = body('- [H1B](https://caseworks.com/us/h1b/)\n- [OPT](https://caseworks.com/us/f1-opt/)')
    const audit = auditContent({ content, contentType: 'article', primaryKeyword: 'guide', indexable: true })
    expect(audit.warnings.some((w) => w.code === 'internal_links')).toBe(false)
  })

  it('clears with portal. + legal. subdomain links', () => {
    const content = body('- [Portal](https://portal.yousafeconsultancy.com/attorneys)\n- [Legal](https://legal.yousafeconsultancy.com/us/student-visas/)')
    const audit = auditContent({ content, contentType: 'article', primaryKeyword: 'guide', indexable: true })
    expect(audit.warnings.some((w) => w.code === 'internal_links')).toBe(false)
  })

  it('still flags fewer than two estate links', () => {
    const content = body('- [One link only](https://legal.yousafeconsultancy.com/us/)')
    const audit = auditContent({ content, contentType: 'article', primaryKeyword: 'guide', indexable: true })
    expect(audit.warnings.some((w) => w.code === 'internal_links')).toBe(true)
  })
})

describe('audit vs ship gate — disclaimer agreement', () => {
  it('audit can no longer score 100 while the gate blocks on missing disclaimer', () => {
    // Body with no disclaimer at all (the reported scenario: 100/100 human
    // score, but ship refused).
    const noDisclaimer = pad(bodyWithToc.replace(/\n\n\*\*Disclaimer:[\s\S]*$/m, ''))
    const audit = auditContent({
      content: noDisclaimer,
      contentType: 'legal_guide',
      primaryKeyword: 'n 400 eligibility requirements',
      indexable: true,
    })
    // The audit must surface the same disclaimer blocker the gate throws.
    expect(audit.blockers.some((b) => b.code === 'disclaimer')).toBe(true)
    // And the gate must refuse.
    expect(() =>
      assertQualityGate({
        content: noDisclaimer,
        contentType: 'legal_guide',
        primaryKeyword: 'n 400 eligibility requirements',
        indexable: true,
      }),
    ).toThrow(/missing_disclaimer|disclaimer/i)
  })

  it('a loose word like "editorial" alone does not count as a disclaimer', () => {
    const sneaky = pad(
      bodyWithToc.replace(/\n\n\*\*Disclaimer:[\s\S]*$/m, '') +
        '\n\nThis is an editorial overview of the filing rules.',
    )
    const audit = auditContent({
      content: sneaky,
      contentType: 'legal_guide',
      primaryKeyword: 'n 400 eligibility requirements',
      indexable: true,
    })
    expect(audit.blockers.some((b) => b.code === 'disclaimer')).toBe(true)
  })
})

describe('deterministic repair loop — blockers clear on the next run', () => {
  it('applyDeterministicRepairs appends the disclaimer and clears the blocker', () => {
    const noDisclaimer = pad(bodyWithToc.replace(/\n\n\*\*Disclaimer:[\s\S]*$/m, ''))
    const repaired = applyDeterministicRepairs({
      content: noDisclaimer,
      title: 'N-400 naturalization guide',
      primaryKeyword: 'n 400 eligibility requirements',
      region: 'US',
    })
    expect(repaired.applied).toContain('disclaimer')
    expect(repaired.content).toMatch(/not legal advice/i)

    const gate = evaluateContentQuality({
      content: repaired.content,
      contentType: 'legal_guide',
      primaryKeyword: 'n 400 eligibility requirements',
      indexable: true,
    })
    expect(gate.blockers.some((b) => b.code === 'missing_disclaimer')).toBe(false)
    // The whole gate can now pass (content is long + structured)
    expect(() =>
      assertQualityGate({
        content: repaired.content,
        contentType: 'legal_guide',
        primaryKeyword: 'n 400 eligibility requirements',
        indexable: true,
      }),
    ).not.toThrow()
  })

  it('is idempotent — a clean draft gets no disclaimer repair', () => {
    const clean = pad(bodyWithToc)
    const repaired = applyDeterministicRepairs({
      content: clean,
      title: 'N-400 naturalization guide',
      primaryKeyword: 'n 400 eligibility requirements',
      region: 'US',
    })
    expect(repaired.applied).not.toContain('disclaimer')
  })
})

describe('schema_faq — missing FAQPage JSON-LD blocks indexable long-form', () => {
  const KEYWORD = 'n 400 eligibility requirements'

  it('is a BLOCKER (not a warning) for an indexable long-form page with no FAQPage JSON-LD', () => {
    const audit = auditContent({
      content: pad(bodyWithToc),
      contentType: 'legal_guide',
      primaryKeyword: KEYWORD,
      indexable: true,
    })
    const faq = audit.blockers.find((b) => b.code === 'schema_faq')
    expect(faq).toBeDefined()
    expect(faq!.fix).toMatch(/schema|FAQ/i)
    expect(audit.warnings.some((w) => w.code === 'schema_faq')).toBe(false)
  })

  it('stays a WARNING (never a blocker) for non-indexable content', () => {
    const audit = auditContent({
      content: pad(bodyWithToc),
      contentType: 'legal_guide',
      primaryKeyword: KEYWORD,
      indexable: false,
    })
    expect(audit.blockers.some((b) => b.code === 'schema_faq')).toBe(false)
    expect(audit.warnings.some((w) => w.code === 'schema_faq')).toBe(true)
  })

  it('keeps the marketplace_gig exemption — a gig with no schema passes the check', () => {
    const audit = auditContent({
      content: pad(bodyWithToc),
      contentType: 'marketplace_gig',
      primaryKeyword: KEYWORD,
      indexable: true,
    })
    expect(audit.blockers.some((b) => b.code === 'schema_faq')).toBe(false)
    expect(audit.warnings.some((w) => w.code === 'schema_faq')).toBe(false)
  })

  it('clears after the deterministic repair injects FAQPage JSON-LD', () => {
    const repaired = applyDeterministicRepairs({
      content: pad(bodyWithToc),
      title: 'N-400 naturalization guide',
      primaryKeyword: KEYWORD,
      region: 'US',
    })
    expect(repaired.content).toMatch(/"@type"\s*:\s*"FAQPage"/)
    const audit = auditContent({
      content: repaired.content,
      contentType: 'legal_guide',
      primaryKeyword: KEYWORD,
      indexable: true,
    })
    expect(audit.blockers.some((b) => b.code === 'schema_faq')).toBe(false)
    expect(audit.warnings.some((w) => w.code === 'schema_faq')).toBe(false)
  })
})
