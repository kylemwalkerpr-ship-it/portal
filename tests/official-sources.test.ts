import {
  CURATED_OFFICIAL_SOURCES,
  isAuthorityHost,
  isCitationRelevant,
  isContextualAuthority,
  isCreamSource,
  isReputablePublication,
  shouldKeepExternalHref,
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

  it('treats the issuing body as cream only when the article is about that discipline', () => {
    const nclex = { region: 'US', topic: 'NCLEX preparation help 2026', keywords: ['nclex', 'rn exam'] }
    const ielts = { region: 'UK', topic: 'IELTS for UKVI', keywords: ['ielts'] }
    const visa = { region: 'US', topic: 'f-1 visa interview', keywords: ['f-1', 'visa'] }

    expect(isCreamSource('https://www.ncsbn.org/exams/nclex', nclex)).toBe(true)
    expect(isContextualAuthority('https://www.ncsbn.org/public-files/2023_RN_Test_Plan.pdf', nclex)).toBe(true)
    expect(isCreamSource('https://www.ncsbn.org/exams/nclex', visa)).toBe(false)
    expect(isCreamSource('https://ielts.org/for-test-takers', ielts)).toBe(true)
    expect(isCreamSource('https://ielts.org/', visa)).toBe(false)
    expect(isCreamSource('https://www.boundless.com/nclex', nclex)).toBe(false)
    expect(isCreamSource('https://www.nclex.com/', nclex)).toBe(true)
    expect(sourcesForBrief(nclex)[0].url).toMatch(/ncsbn\.org/)
  })

  it('allows reputable newsrooms and still rejects consultants', () => {
    const visa = { region: 'US', topic: 'f-1 visa interview', keywords: ['f-1'] }
    expect(isCreamSource('https://www.nytimes.com/2026/08/01/us/opt-rule.html', visa)).toBe(true)
    expect(isReputablePublication('https://www.reuters.com/world/us/immigration')).toBe(true)
    expect(shouldKeepExternalHref('https://www.bbc.com/news/uk', { region: 'UK', topic: 'skilled worker visa' })).toBe(true)
    expect(isCreamSource('https://www.boundless.com/blog', visa)).toBe(false)
    expect(isCreamSource('https://en.wikipedia.org/wiki/F-1_visa', visa)).toBe(false)
  })

  it('ranks the matching board first for later exam and licensing topics', () => {
    expect(sourcesForBrief({ region: 'UK', topic: 'IELTS for UKVI', keywords: ['ielts'] })[0].url).toMatch(/ielts/)
    expect(sourcesForBrief({ region: 'UK', topic: 'GMC registration for IMGs', keywords: ['gmc'] })[0].url).toMatch(/gmc-uk/)
    expect(sourcesForBrief({ region: 'US', topic: 'USMLE Step 1', keywords: ['usmle'] })[0].url).toMatch(/usmle/)
    expect(sourcesForBrief({ region: 'US', topic: 'WES credential evaluation', keywords: ['wes'] })[0].url).toMatch(/wes\.org/)
    expect(sourcesForBrief({ region: 'CA', topic: 'CELPIP for express entry', keywords: ['celpip'] })[0].url).toMatch(/celpip/)
    expect(sourcesForBrief({ region: 'AU', topic: 'AHPRA nursing registration', keywords: ['ahpra'] })[0].url).toMatch(/ahpra/)
  })

  it('does not treat those boards as cream on an unrelated visa article', () => {
    const visa = { region: 'US', topic: 'f-1 visa interview', keywords: ['f-1', 'visa'] }
    expect(isCreamSource('https://ielts.org/', visa)).toBe(false)
    expect(isCreamSource('https://www.gmc-uk.org/', visa)).toBe(false)
    expect(isCreamSource('https://www.usmle.org/', visa)).toBe(false)
    expect(isCreamSource('https://www.wes.org/', visa)).toBe(false)
    expect(isCreamSource('https://www.celpip.ca/', visa)).toBe(false)
  })

  it('treats an unlisted institutional .org as cream when a distinctive topic token is in the URL', () => {
    const naplex = { region: 'US', topic: 'NAPLEX score transfer', keywords: ['naplex'] }
    expect(isContextualAuthority('https://www.example-board.org/naplex-bulletin', naplex)).toBe(true)
    expect(isCreamSource('https://www.example-board.org/naplex-bulletin', naplex)).toBe(true)
    expect(isCreamSource('https://www.example-board.org/naplex-bulletin', {
      region: 'US',
      topic: 'f-1 visa interview',
      keywords: ['opt'],
    })).toBe(false)
  })
})
