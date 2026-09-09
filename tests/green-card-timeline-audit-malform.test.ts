/**
 * Live regression: job 2ce5b201 "Green Card Timeline: 2026 US Petition Checklist"
 * (2026-09-09). Audit & Fix all held forever on bare_url_not_hyperlinked +
 * duplicate_h2 because the deterministic repairs *created* both leftovers:
 *
 *   1. sentence rhythm glued "In this case / As a result / On review" onto
 *      marketplace `.com` hosts and into FAQ JSON-LD (`?` splits).
 *   2. concrete_example appended a second `## Worked Example` (Maria) after
 *      H2 dedupe, so the duplicate could never be removed on the same pass.
 *   3. the bare-URL gate treated a sanitized recovery of a mangled href as
 *      an unlinked URL, so Fix all looped 3 deterministic rounds at the
 *      same hash and stopped on budget_exhausted.
 */
import { applyDeterministicRepairs, stripRhythmGlueFromJsonLd } from '@/lib/seoFactory/editorialScaffold'
import { auditReferenceReachability } from '@/lib/seoFactory/contentQualityGate'
import { unglueDocumentUrls, sanitizeExtractedUrl } from '@/lib/seoFactory/citationPolicy'
import { extractLinks } from '@/lib/seoFactory/linkAudit'

const MANGLED = {
  inthiscase:
    'https://market.yousafeconsultancy.Inthiscasecom/gigs/review-us-eb-immigrant-petition-pathway-strategy',
  asaresult:
    'https://market.yousafeconsultancy.Asaresultcom/gigs/review-us-immigration-petition-review-risk-memo',
  onreview:
    'https://market.yousafeconsultancy.Onreviewcom/gigs/review-us-citizenship-application-filing-review',
} as const

const CLEAN = {
  inthiscase:
    'https://market.yousafeconsultancy.com/gigs/review-us-eb-immigrant-petition-pathway-strategy',
  asaresult:
    'https://market.yousafeconsultancy.com/gigs/review-us-immigration-petition-review-risk-memo',
  onreview:
    'https://market.yousafeconsultancy.com/gigs/review-us-citizenship-application-filing-review',
} as const

function liveLikeDraft(opts?: { alreadyHasExample?: boolean; glueJson?: boolean }): string {
  const faqJson = opts?.glueJson === false
    ? '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Who may start a family or employment petition?","acceptedAnswer":{"@type":"Answer","text":"A qualifying relative or employer must have a real relationship or job."}}]}'
    : '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Who may start a family or employment petition?In this case, ","acceptedAnswer":{"@type":"Answer","text":"A qualifying relative or employer must have a real relationship or job.In this case, "}},{"@type":"Question","name":"Which documents should you gather first?As a result, ","acceptedAnswer":{"@type":"Answer","text":"Start with passport identity pages.As a result, "}},{"@type":"Question","name":"Can you work while a case is pending?On review, ","acceptedAnswer":{"@type":"Answer","text":"Work depends on current status or a separate EAD.On review, "}}]}'

  const example = [
    '## Worked Example',
    '',
    '**Worked example:** concurrent family adjustment packet order (no named person).',
    '',
    '1. Confirm the petitioner is a U.S. citizen spouse and the beneficiary may adjust.',
    '2. Complete Form I-130 with marriage certificate and bona fides.',
    '3. Complete Form I-485 with I-94, photos, and I-693 sealed medical.',
  ].join('\n')

  const maria = [
    '## Worked Example',
    '',
    '**Scenario:** Maria, an applicant, needs to understand the requirements. She gathers all required documents, checks the official processing times, and submits her application with complete evidence.',
    '',
    '**Result:** By following the steps above, Maria avoids common delays and receives a timely decision. For example, having her documents translated and notarized ahead of time saved her several weeks of back-and-forth.',
  ].join('\n')

  const pad = Array.from({ length: 40 }, (_, i) =>
    `USCIS clocks receipt, biometrics, interview, and visa-bulletin movement for stage ${i + 1}. Officers still decide each file on the evidence in it.`,
  ).join('\n\n')

  return [
    '---',
    'title: "Green Card Timeline: 2026 US Petition Checklist"',
    'primaryKeyword: green card timeline',
    'region: us',
    '---',
    '',
    '# Green Card Timeline: 2026 US Petition Checklist',
    '',
    'USCIS clocks a lawful-permanent-resident case in stages, not one promise.',
    '',
    '## When to use counsel and next filing steps',
    '',
    `**EB map:** [I will map your US EB immigrant petition pathway](${MANGLED.inthiscase})`,
    '',
    `**Risk memo:** [I will prepare your US immigration petition risk memo](${MANGLED.asaresult})`,
    '',
    `Later naturalization is a separate N-400 file: [I will review your US N-400 naturalization file](${MANGLED.onreview}).`,
    '',
    pad,
    '',
    example,
    '',
    '<script type="application/ld+json">',
    faqJson,
    '</script>',
    '',
    opts?.alreadyHasExample === false ? '' : maria,
  ].join('\n')
}

describe('Green Card Timeline live Audit/Fix malformation', () => {
  it('recovers the three glued marketplace hosts', () => {
    expect(sanitizeExtractedUrl(MANGLED.inthiscase).url).toBe(CLEAN.inthiscase)
    expect(sanitizeExtractedUrl(MANGLED.asaresult).url).toBe(CLEAN.asaresult)
    expect(sanitizeExtractedUrl(MANGLED.onreview).url).toBe(CLEAN.onreview)
  })

  it('does not flag a mangled markdown href as a bare URL', () => {
    const md = `See [risk memo](${MANGLED.asaresult}) and [N-400](${MANGLED.onreview}).\n`
    const links = extractLinks(md)
    expect(links.every((l) => l.fromHref === true)).toBe(true)
    expect(links.map((l) => l.url).sort()).toEqual([CLEAN.asaresult, CLEAN.onreview].sort())
    const findings = auditReferenceReachability(md)
    expect(findings.some((f) => f.code === 'bare_url_not_hyperlinked')).toBe(false)
  })

  it('strips rhythm adverbials from FAQ JSON-LD and leaves parseable JSON', () => {
    const glued = liveLikeDraft({ glueJson: true })
    const { content, changed } = stripRhythmGlueFromJsonLd(glued)
    expect(changed).toBeGreaterThan(0)
    expect(content).not.toMatch(/petition\?In this case/)
    expect(content).not.toMatch(/pending\?On review/)
    const block = content.match(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/i)?.[1] || ''
    expect(() => JSON.parse(block)).not.toThrow()
    const parsed = JSON.parse(block) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
    expect(parsed.mainEntity[0].name).toBe('Who may start a family or employment petition?')
    expect(parsed.mainEntity[0].acceptedAnswer.text).not.toMatch(/In this case/)
  })

  it('unglues href hosts in a stored draft', () => {
    const { content, changed } = unglueDocumentUrls(liveLikeDraft())
    expect(changed).toBeGreaterThanOrEqual(3)
    expect(content).not.toMatch(/Inthiscasecom|Asaresultcom|Onreviewcom/)
    expect(content).toContain(CLEAN.inthiscase)
    expect(content).toContain(CLEAN.asaresult)
    expect(content).toContain(CLEAN.onreview)
  })

  it('one Audit & Fix pass unglues hosts, drops Maria, and clears the bare-URL blocker', () => {
    const draft = liveLikeDraft({ alreadyHasExample: true, glueJson: true })
    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'Green Card Timeline: 2026 US Petition Checklist',
      primaryKeyword: 'green card timeline',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })

    expect(content).not.toMatch(/Inthiscasecom|Asaresultcom|Onreviewcom/)
    expect(content).toContain(CLEAN.inthiscase)
    expect(content).toContain(CLEAN.asaresult)
    expect(content).toContain(CLEAN.onreview)

    const h2 = [...content.matchAll(/^## Worked Example\s*$/gim)]
    expect(h2).toHaveLength(1)
    expect(content).not.toMatch(/\bMaria\b/)

    const faq = content.match(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []
    for (const block of faq) {
      const raw = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>\s*$/i, '')
      if (!/"@type"\s*:\s*"FAQPage"/.test(raw)) continue
      const parsed = JSON.parse(raw) as { mainEntity?: Array<{ name?: string; acceptedAnswer?: { text?: string } }> }
      for (const q of parsed.mainEntity || []) {
        expect(q.name || '').not.toMatch(/In this case|As a result|On review/)
        expect(q.acceptedAnswer?.text || '').not.toMatch(/In this case|As a result|On review/)
      }
    }

    const reach = auditReferenceReachability(content)
    expect(reach.some((f) => f.code === 'bare_url_not_hyperlinked')).toBe(false)

    expect(applied.some((a) =>
      a === 'glued_hosts_unglued'
      || a === 'jsonld_rhythm_glue_stripped'
      || a.startsWith('duplicate_heading_sections_removed')
      || a === 'malformed_tld_urls_cleaned',
    )).toBe(true)
  })

  it('does not inject a second Worked Example when one already exists', () => {
    const draft = liveLikeDraft({ alreadyHasExample: false, glueJson: false })
    expect(draft.match(/^## Worked Example\s*$/gim) || []).toHaveLength(1)
    const { content, applied } = applyDeterministicRepairs({
      content: draft,
      title: 'Green Card Timeline: 2026 US Petition Checklist',
      primaryKeyword: 'green card timeline',
      region: 'US',
      indexable: true,
      contentType: 'legal_guide',
    })
    expect(applied).not.toContain('concrete_example')
    expect(content.match(/^## Worked Example\s*$/gim) || []).toHaveLength(1)
    expect(content).not.toMatch(/\bMaria\b/)
  })
})
