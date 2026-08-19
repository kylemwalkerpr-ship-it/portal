import {
  applyCitationPolicy,
  articleHasOfficialCitation,
  buildCitationContext,
  pickOfficialCitations,
} from '@/lib/seoFactory/citationPolicy'

describe('citationPolicy — factory-wide contract', () => {
  const housing = buildCitationContext({
    region: 'US',
    topic: 'Stockton student housing',
    primaryKeyword: 'stockton housing',
    keywords: ['rent', 'landlord'],
  })
  const opt = buildCitationContext({
    region: 'US',
    topic: 'F-1 OPT employment',
    primaryKeyword: 'opt',
    keywords: ['i-765'],
  })

  it('treats same-region USCIS as an official citation on a housing brief', () => {
    const draft = 'See [USCIS](https://www.uscis.gov/working-in-the-united-states).'
    expect(articleHasOfficialCitation(draft, housing)).toBe(true)
  })

  it('does not treat a competitor as an official citation', () => {
    expect(articleHasOfficialCitation('See [Boundless](https://www.boundless.com/opt).', opt)).toBe(false)
  })

  it('injects at most two on-topic official URLs when none exist', () => {
    const { content, applied } = applyCitationPolicy('# Housing\n\nRent a room.', housing)
    expect(applied).toContain('official_citations')
    expect(content).toMatch(/hud\.gov/)
    expect((content.match(/https?:\/\/\S+/g) || []).length).toBeLessThanOrEqual(2)
  })

  it('does not inject more citations when a valid official URL is already present', () => {
    const draft = 'File OPT on [USCIS](https://www.uscis.gov/i-765).'
    const { content, applied } = applyCitationPolicy(draft, opt)
    expect(applied).toEqual([])
    expect(content).toBe(draft)
  })

  it('picks housing authorities for a housing brief, not a random visa homepage first', () => {
    const picks = pickOfficialCitations(housing, 2)
    expect(picks.length).toBeGreaterThan(0)
    expect(picks[0].url).toMatch(/hud\.gov/)
  })

  it('picks the issuing board for exam topics instead of a generic immigration homepage', () => {
    const nclex = buildCitationContext({
      region: 'US',
      topic: 'NCLEX preparation help',
      primaryKeyword: 'nclex',
      keywords: ['rn exam'],
    })
    const ielts = buildCitationContext({
      region: 'UK',
      topic: 'IELTS for UKVI',
      primaryKeyword: 'ielts',
    })
    expect(pickOfficialCitations(nclex, 1)[0].url).toMatch(/ncsbn\.org/)
    expect(pickOfficialCitations(ielts, 1)[0].url).toMatch(/ielts/)
    expect(articleHasOfficialCitation('See [NCSBN](https://www.ncsbn.org/exams/nclex).', nclex)).toBe(true)
    expect(articleHasOfficialCitation('See [IELTS](https://ielts.org/).', ielts)).toBe(true)
  })
})
