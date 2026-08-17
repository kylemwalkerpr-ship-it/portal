import {
  CURATED_OFFICIAL_SOURCES,
  isAuthorityHost,
  isCitationRelevant,
  isCreamSource,
  isLowValueHost,
  isOfficialSchoolPage,
  scoreUrlRelevance,
  sourcesForBrief,
  sourcesForRegion,
} from '@/lib/seoFactory/officialSources'

describe('officialSources · crème-de-la-crème allowlist', () => {
  it('treats immigration and government departments as authorities', () => {
    expect(isAuthorityHost('https://www.uscis.gov/working-in-the-united-states')).toBe(true)
    expect(isAuthorityHost('https://www.gov.uk/student-visa')).toBe(true)
    expect(isAuthorityHost('https://www.canada.ca/en/immigration-refugees-citizenship.html')).toBe(true)
    expect(isAuthorityHost('https://immi.homeaffairs.gov.au/')).toBe(true)
    expect(isAuthorityHost('https://www.hud.gov/topics/rental_assistance')).toBe(true)
    expect(isAuthorityHost('https://www.ukcisa.org.uk/')).toBe(true)
    expect(isAuthorityHost('https://www.iom.int/')).toBe(true)
  })

  it('allows official school pages and rejects campus blogs', () => {
    expect(isOfficialSchoolPage('https://admissions.stanford.edu/international')).toBe(true)
    expect(isAuthorityHost('https://www.ox.ac.uk/admissions/undergraduate')).toBe(true)
    expect(isOfficialSchoolPage('https://blog.harvard.edu/students/housing')).toBe(false)
    expect(isAuthorityHost('https://news.mit.edu/2024/visa')).toBe(false)
    expect(isAuthorityHost('https://www.stanford.edu/news/international-students')).toBe(false)
  })

  it('rejects consultants, news, Wikipedia, social, and shorteners', () => {
    expect(isCreamSource('https://www.boundless.com/f1-opt')).toBe(false)
    expect(isAuthorityHost('https://www.nytimes.com/immigration')).toBe(false)
    expect(isAuthorityHost('https://en.wikipedia.org/wiki/Optional_Practical_Training')).toBe(false)
    expect(isLowValueHost('https://bit.ly/abc')).toBe(true)
    expect(isLowValueHost('https://www.reddit.com/r/immigration')).toBe(true)
    expect(isLowValueHost('https://en.wikipedia.org/wiki/F-1_visa')).toBe(true)
  })

  it('ranks housing sources above USCIS on a housing brief', () => {
    const ranked = sourcesForBrief({ region: 'US', topic: 'Stockton student housing', keywords: ['rent', 'landlord'] })
    expect(ranked[0].url).toMatch(/hud\.gov/)
    expect(isCitationRelevant('https://www.hud.gov/', { region: 'US', topic: 'Stockton student housing' })).toBe(true)
    expect(isCitationRelevant(
      'https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/students-and-employment',
      { region: 'US', topic: 'Stockton student housing', keywords: ['rent'] },
    )).toBe(true)
  })

  it('ranks USCIS / SEVP above HUD on a student-visa brief', () => {
    const ranked = sourcesForBrief({ region: 'US', topic: 'F-1 OPT employment', keywords: ['opt', 'uscis'] })
    expect(ranked[0].url).toMatch(/uscis\.gov|studyinthestates|ice\.gov/)
    expect(scoreUrlRelevance('https://www.hud.gov/', { region: 'US', topic: 'F-1 OPT employment' })).toBeLessThan(3)
    expect(isCitationRelevant('https://www.hud.gov/', { region: 'US', topic: 'F-1 OPT employment' })).toBe(false)
  })

  it('does not mix regions', () => {
    const uk = sourcesForBrief({ region: 'UK', topic: 'Student visa' })
    expect(uk.every((s) => s.regions.includes('UK') || s.regions.includes('ALL'))).toBe(true)
    expect(uk.some((s) => s.url.includes('gov.uk'))).toBe(true)
  })

  it('keeps a non-empty regional bank', () => {
    expect(sourcesForRegion('US').length).toBeGreaterThan(5)
    expect(CURATED_OFFICIAL_SOURCES.length).toBeGreaterThan(40)
  })
})
