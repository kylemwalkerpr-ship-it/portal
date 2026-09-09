/**
 * Factory-glued marketplace hosts must not be treated as live URLs.
 *
 * Live defect: extractHttpUrls swallowed camelCase prose after .com:
 *   https://market.yousafeconsultancy.Inthiscasecom/gigs/…
 *   https://market.yousafeconsultancy.Asaresultcom/gigs/…
 *   https://market.yousafeconsultancy.Onreviewcom/gigs/…
 * Ship then held on unreachable_external_link of a hostname the extractor invented.
 */
import { extractHttpUrls, sanitizeExtractedUrl, unglueDocumentUrls } from '@/lib/seoFactory/citationPolicy'
import { auditLinksSync, extractLinks, isProtectedMarketplaceUrl } from '@/lib/seoFactory/linkAudit'

const GLUED = {
  inthiscase:
    'https://market.yousafeconsultancy.Inthiscasecom/gigs/review-canada-cec-pr-eligibility-review',
  asaresult:
    'https://market.yousafeconsultancy.Asaresultcom/gigs/review-canada-lmia-work-permit-work-authorization-roadmap',
  onreview:
    'https://market.yousafeconsultancy.Onreviewcom/gigs/review-canada-lmia-work-permit-petition-strategy',
} as const

describe('sanitizeExtractedUrl', () => {
  it('splits glued Inthiscase camelCase off the marketplace host', () => {
    const r = sanitizeExtractedUrl(GLUED.inthiscase)
    expect(r.url).toBe(
      'https://market.yousafeconsultancy.com/gigs/review-canada-cec-pr-eligibility-review',
    )
    expect(r.leftover).toMatch(/Inthiscase/)
    expect(new URL(r.url!).hostname).toBe('market.yousafeconsultancy.com')
  })

  it('recovers Asaresult / Onreview glued TLDs and leaves a valid marketplace URL', () => {
    const a = sanitizeExtractedUrl(GLUED.asaresult)
    const o = sanitizeExtractedUrl(GLUED.onreview)
    expect(a.url).toBe(
      'https://market.yousafeconsultancy.com/gigs/review-canada-lmia-work-permit-work-authorization-roadmap',
    )
    expect(o.url).toBe(
      'https://market.yousafeconsultancy.com/gigs/review-canada-lmia-work-permit-petition-strategy',
    )
    expect(a.leftover).toMatch(/Asaresult/)
    expect(o.leftover).toMatch(/Onreview/)
  })

  it('leaves a clean marketplace URL untouched', () => {
    const clean = 'https://market.yousafeconsultancy.com/gigs/review-canada-cec-pr-eligibility-review'
    const r = sanitizeExtractedUrl(clean)
    expect(r.url).toBe(clean)
    expect(r.leftover).toBe('')
  })
})

describe('extractHttpUrls glued hosts', () => {
  it('returns market.yousafeconsultancy.com hosts for the three glued strings', () => {
    const urls = extractHttpUrls(Object.values(GLUED).join('\n'))
    expect(urls).toHaveLength(3)
    for (const u of urls) {
      expect(new URL(u).hostname).toBe('market.yousafeconsultancy.com')
      expect(u).toMatch(/^https:\/\/market\.yousafeconsultancy\.com\/gigs\//)
    }
  })
})

describe('unglueDocumentUrls', () => {
  it('rewrites glued hosts inside markdown hrefs', () => {
    const md = Object.values(GLUED)
      .map((u, i) => `- [Gig ${i}](${u})`)
      .join('\n')
    const { content, changed } = unglueDocumentUrls(md)
    expect(changed).toBe(3)
    expect(content).not.toMatch(/Inthiscasecom|Asaresultcom|Onreviewcom/)
    expect(content).toContain('https://market.yousafeconsultancy.com/gigs/')
  })
})

describe('linkAudit uses the sanitized marketplace URL', () => {
  it('does not hold the glued form as untrusted / malformed / placeholder', () => {
    const body = Object.values(GLUED)
      .map((u) => `See the reviewer gig at ${u}.`)
      .join('\n')
    const links = extractLinks(body)
    expect(links.every((l) => new URL(l.url).hostname === 'market.yousafeconsultancy.com')).toBe(true)
    expect(links.every((l) => isProtectedMarketplaceUrl(l.url))).toBe(true)

    const findings = auditLinksSync(body)
    expect(findings.some((f) => /Inthiscasecom|Asaresultcom|Onreviewcom/i.test(f.url))).toBe(false)
    expect(findings.filter((f) => f.severity === 'blocker')).toEqual([])
    expect(findings.some((f) => f.code === 'unreachable_external_link')).toBe(false)
  })
})
