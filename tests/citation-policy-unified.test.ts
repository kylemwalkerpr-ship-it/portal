/**
 * Unified citation-policy regression tests.
 *
 * The brief stage and the reviewer stage must enforce the SAME policy:
 *  - relevant + alive sources are citable, biased toward formal authorities
 *  - random unknown blogs / low-authority hosts are gated out
 * Before this contract, the brief hard-gated through isCreamSource
 * ("crème de la crème only") while the reviewer was lenient, so briefs
 * shipped with "SOURCES TO CITE (0 SPECIFIED)" and citation-starved drafts.
 */
import {
  isCitableSource,
  isCreamSource,
  STRONG_CITATION_RELEVANCE,
  type CitationContext,
} from '../lib/seoFactory/officialSources'

const AU_STUDENT_CTX: CitationContext = {
  region: 'AU',
  topic: 'Australia student visa subclass 500 document checklist',
  keywords: ['subclass 500', 'australia student visa', 'document checklist'],
  body: 'Applying for the Australia student visa subclass 500 requires the document checklist, English test scores, and Overseas Student Health Cover. NAATI accredited translations are required for documents not in English.',
}

const US_F1_CTX: CitationContext = {
  region: 'US',
  topic: 'F-1 visa application guide',
  keywords: ['f-1 visa', 'uscis', 'student visa interview'],
  body: 'The F-1 visa application process covers the I-20 form, SEVIS fee, and the visa interview at a US consulate.',
}

describe('isCitableSource (unified brief + reviewer policy)', () => {
  it('always admits cream authorities (government, schools, intergov)', () => {
    expect(isCitableSource('https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500', AU_STUDENT_CTX)).toBe(true)
    expect(isCitableSource('https://www.uscis.gov/working-in-the-united-states/students', US_F1_CTX)).toBe(true)
    expect(isCitableSource('https://educationusa.state.gov/', US_F1_CTX)).toBe(true)
  })

  it('admits on-topic institutional pages (.org / .edu) even when not cream', () => {
    // A relevant .org page that is not on any authority list.
    const ctx: CitationContext = {
      ...AU_STUDENT_CTX,
      topic: 'overseas student health cover OSHC comparison',
      keywords: ['oshc', 'health cover'],
      body: 'Overseas Student Health Cover (OSHC) is mandatory for the subclass 500 visa. Compare OSHC providers and waiting periods.',
    }
    expect(isCitableSource('https://www.privatehealth.gov.au/oshc/', ctx)).toBe(true)
  })

  it('admits strongly on-topic non-institutional authorities (e.g. NAATI on .com.au)', () => {
    expect(isCitableSource('https://naati.com.au/', AU_STUDENT_CTX)).toBe(true)
  })

  it('gates random low-authority blogs and content mills', () => {
    expect(isCitableSource('https://www.boundless.com/blog/f1-visa-tips', US_F1_CTX)).toBe(false)
    expect(isCitableSource('https://visajourney.com/forums/topic/1234', US_F1_CTX)).toBe(false)
    expect(isCitableSource('https://medium.com/@someone/f1-visa-tips-2026', US_F1_CTX)).toBe(false)
    expect(isCitableSource('https://en.wikipedia.org/wiki/F-1_visa', US_F1_CTX)).toBe(false)
  })

  it('gates weakly-relevant non-institutional hosts even when not blocklisted', () => {
    // An unknown .com with only loose topical overlap must NOT pass.
    const weakCtx: CitationContext = {
      region: 'US',
      topic: 'F-1 visa interview preparation',
      keywords: ['f-1 visa interview'],
      body: 'Prepare for the F-1 visa interview with these tips on consular officer questions.',
    }
    expect(isCitableSource('https://some-random-site.com/immigration-things', weakCtx)).toBe(false)
  })

  it('requires context for non-cream hosts (no context = formal sources only)', () => {
    // With no ctx, only cream passes — the formal bias.
    expect(isCitableSource('https://www.uscis.gov/', undefined)).toBe(true)
    expect(isCitableSource('https://naati.com.au/', undefined)).toBe(false)
  })

  it('keeps isCreamSource as the formal-bias tier (unchanged behaviour)', () => {
    expect(isCreamSource('https://www.uscis.gov/', US_F1_CTX)).toBe(true)
    expect(isCreamSource('https://www.boundless.com/f1-opt', US_F1_CTX)).toBe(false)
  })

  it('exports the strong-relevance bar above the normal floor', () => {
    expect(STRONG_CITATION_RELEVANCE).toBeGreaterThan(3)
  })
})
