import { factsWerePreserved } from '@/lib/seoFactory/cohesionCritique'
import {
  isRetrievalGatedCitationAllowed,
  isCycleProtectedUrl,
} from '@/lib/seoFactory/citationRetrievalGate'
import { pickOfficialCitations } from '@/lib/seoFactory/citationPolicy'
import { auditLinksSync } from '@/lib/seoFactory/linkAudit'
import { collectDenoiseSpans } from '@/lib/seoFactory/maskedDenoise'
import { evaluateProseGeometry } from '@/lib/seoFactory/proseGeometry'
import { stripReaderFacingCodeFences } from '@/lib/seoFactory/readerFacingMarkdown'
import { normalizeEditorDocument } from '@/lib/seoFactory/formatContract'

const CRS_CONTEXT = {
  region: 'CA',
  topic: 'Express Entry Canada CRS calculator',
  keywords: ['CRS score', 'Comprehensive Ranking System'],
}

describe('editorial retrieval hardening', () => {
  it('rejects generic global authority homepages unless the brief actually retrieves their subject', () => {
    expect(isRetrievalGatedCitationAllowed('https://www.unhcr.org/', CRS_CONTEXT)).toBe(false)
    expect(isRetrievalGatedCitationAllowed('https://www.ilo.org/', CRS_CONTEXT)).toBe(false)
    expect(isRetrievalGatedCitationAllowed('https://www.oecd.org/', CRS_CONTEXT)).toBe(false)

    expect(
      isRetrievalGatedCitationAllowed('https://www.unhcr.org/', {
        region: 'CA',
        topic: 'Refugee resettlement and asylum in Canada',
        keywords: ['UNHCR', 'forced displacement'],
      }),
    ).toBe(true)

    expect(
      isRetrievalGatedCitationAllowed('https://www.ilo.org/', {
        region: 'CA',
        topic: 'Labour standards and workers rights in Canada',
        keywords: ['employment standards'],
      }),
    ).toBe(true)
  })

  it('keeps claim-specific deep URLs protected while disposable generic homepages may be dropped', () => {
    const ircc = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/comprehensive-ranking-system.html'
    const unhcr = 'https://www.unhcr.org/'

    expect(isCycleProtectedUrl(ircc)).toBe(true)
    expect(isCycleProtectedUrl(unhcr)).toBe(false)

    const original = `Applicants may receive 67 points. See [IRCC](${ircc}) and [UNHCR](${unhcr}).`
    const withoutGenericHomepage = `Applicants may receive 67 points. See [IRCC](${ircc}).`
    expect(factsWerePreserved(original, withoutGenericHomepage).ok).toBe(true)

    const withoutIrcc = 'Applicants may receive 67 points.'
    expect(factsWerePreserved(original, withoutIrcc).ok).toBe(false)

    const withoutNumber = `Applicants may receive points. See [IRCC](${ircc}).`
    expect(factsWerePreserved(original, withoutNumber).ok).toBe(false)
  })

  it('flags an irrelevant generic homepage in the link audit when the brief context is explicit', () => {
    const content = 'See [UNHCR](https://www.unhcr.org/) for more information.'
    const rejected = auditLinksSync(content, undefined, undefined, CRS_CONTEXT)
    expect(rejected.some((f) => f.code === 'irrelevant_external_link')).toBe(true)

    const refugeeContext = {
      region: 'CA',
      topic: 'Refugee resettlement and asylum in Canada',
      keywords: ['UNHCR'],
    }
    const allowed = auditLinksSync(content, undefined, undefined, refugeeContext)
    expect(allowed.some((f) => f.code === 'irrelevant_external_link')).toBe(false)
  })

  it('does not select unrelated global homepages as official citations for a CRS brief', () => {
    const urls = pickOfficialCitations(CRS_CONTEXT, 8).map((s) => s.url)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.some((u) => /unhcr\.org|iom\.int|ilo\.org|oecd\.org|who\.int/i.test(u))).toBe(false)
  })
})

describe('reader-facing editorial cleanup', () => {
  it('unwraps prose markdown fences and drops code/schema fences', () => {
    const input = [
      '```markdown',
      '# CRS guide',
      '',
      'This section explains how a CRS score changes when profile factors change. It also shows what to verify before relying on the total.',
      '```',
      '',
      '```json',
      '{"@context":"https://schema.org","@type":"Article"}',
      '```',
    ].join('\n')

    const cleaned = stripReaderFacingCodeFences(input)
    expect(cleaned.unwrapped).toBe(1)
    expect(cleaned.dropped).toBe(1)
    expect(cleaned.content).toContain('# CRS guide')
    expect(cleaned.content).not.toContain('```')
    expect(cleaned.content).not.toContain('"@context"')
  })

  it('wires reader-fence cleanup and named Marketplace anchors through the central normalizer', () => {
    const input = [
      '---',
      'title: CRS Guide',
      'content_type: guide',
      'region: CA',
      '---',
      '# CRS Guide',
      '',
      '```markdown',
      '## Provider help',
      '',
      'For tailored help, review [https://market.yousafeconsultancy.com/providers/ann-mccoy](https://market.yousafeconsultancy.com/providers/ann-mccoy). This provider listing can be opened without exposing the raw address as reader-facing label text.',
      '```',
    ].join('\n')

    const normalized = normalizeEditorDocument(input)
    expect(normalized.content).not.toContain('```')
    expect(normalized.content).toContain('[Ann McCoy](https://market.yousafeconsultancy.com/providers/ann-mccoy)')
    expect(normalized.fixed.some((x) => x.startsWith('reader_code_fences_removed'))).toBe(true)
    expect(normalized.fixed.some((x) => x.startsWith('marketplace_anchors_named'))).toBe(true)
  })
})

describe('stuffed primary opener repair targeting', () => {
  it('detects keyword-stuffed H2 openers and targets the paragraph for mid-strength denoise', () => {
    const content = [
      '---',
      'primaryKeyword: express entry canada crs calculator',
      'content_type: guide',
      'region: CA',
      '---',
      '# Express Entry Canada CRS Calculator Guide',
      '',
      '## How the score works',
      '',
      'The express entry canada crs calculator is a tool that explains the score used for ranking profiles. Applicants should verify each factor against the official rules before acting on the result.',
      '',
      '## What to check next',
      '',
      'Age, language results, education and work history can affect the total. Check the inputs before comparing the score with an invitation round.',
    ].join('\n')

    const geometry = evaluateProseGeometry(content, { contentType: 'guide', indexable: true })
    const finding = geometry.findings.find((f) => f.code === 'stuffed_primary_opener')
    expect(finding).toBeDefined()

    const spans = collectDenoiseSpans(content, geometry.findings)
    const span = spans.find((s) => s.code.includes('stuffed_primary_opener'))
    expect(span).toBeDefined()
    expect(span?.t).toBe('mid')
    expect(span?.original).toContain('The express entry canada crs calculator is a tool')
  })
})
