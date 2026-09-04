import { rankEstateInterlinks } from '@/lib/seoFactory/estateInterlinks'
import { preferRegionInterlinks } from '@/lib/seoFactory/studioInterlinks'

describe('canonical estate interlink ranking', () => {
  const candidates = [
    { url: 'https://au.yousafeconsultancy.com/student-visa-fees/', title: 'Australia Student Visa Fees and Charges', path: '/student-visa-fees/', indexable: true, inSitemap: true, inboundLinks: 8 },
    { url: 'https://legal.yousafeconsultancy.com/au/student-visa-documents/', title: 'Australia Student Visa Document Checklist', path: '/au/student-visa-documents/', indexable: true, inSitemap: true, inboundLinks: 5 },
    { url: 'https://portal.yousafeconsultancy.com/pricing', title: 'Pricing & Plans', path: '/pricing', indexable: true, inSitemap: true, inboundLinks: 90 },
    { url: 'https://ca.yousafeconsultancy.com/student-permit-fees/', title: 'Canada Student Permit Fees', path: '/student-permit-fees/', indexable: true, inSitemap: true, inboundLinks: 20 },
    { url: 'https://au.yousafeconsultancy.com/old-fees/', title: 'Old Australia Student Visa Fees', path: '/old-fees/', indexable: false, inSitemap: false },
  ]

  it('prefers same-region topical and journey links over generic/high-link pages', () => {
    const ranked = rankEstateInterlinks(candidates, {
      topic: 'Australia student visa fee increase',
      keywords: ['Australia student visa fees', 'visa application cost'],
      region: 'AU',
      h2Outline: ['Student visa fee changes', 'Documents and application steps'],
    }, 4)
    expect(ranked[0].url).toContain('student-visa-fees')
    expect(ranked.map((item) => item.url)).not.toContain('https://portal.yousafeconsultancy.com/pricing')
    expect(ranked.map((item) => item.url)).not.toContain('https://ca.yousafeconsultancy.com/student-permit-fees/')
    expect(ranked.map((item) => item.url)).not.toContain('https://au.yousafeconsultancy.com/old-fees/')
    expect(ranked.some((item) => item.role === 'next-step')).toBe(true)
  })

  it('never recommends the page linking to itself', () => {
    const ranked = rankEstateInterlinks(candidates, {
      topic: 'Australia student visa fees', region: 'AU',
      sourceUrl: 'https://au.yousafeconsultancy.com/student-visa-fees/',
    })
    expect(ranked.map((item) => item.url)).not.toContain('https://au.yousafeconsultancy.com/student-visa-fees/')
  })

  it('drops CA/US estate suggestions for an AU brief when AU pages exist', () => {
    const ranked = rankEstateInterlinks([
      ...candidates,
      { url: 'https://legal.yousafeconsultancy.com/au/estate-planning/', title: 'Australia Estate Planning Guide', path: '/au/estate-planning/', indexable: true, inSitemap: true, inboundLinks: 12 },
      { url: 'https://legal.yousafeconsultancy.com/us/estate-planning/', title: 'US Estate Planning Guide', path: '/us/estate-planning/', indexable: true, inSitemap: true, inboundLinks: 40 },
      { url: 'https://legal.yousafeconsultancy.com/ca/estate-planning/', title: 'Canada Estate Planning Guide', path: '/ca/estate-planning/', indexable: true, inSitemap: true, inboundLinks: 30 },
    ], {
      topic: 'Australia estate planning for international students',
      keywords: ['estate planning', 'australia will'],
      region: 'AU',
    }, 4)
    expect(ranked.every((item) => !/\/us\/|\/ca\//.test(item.url))).toBe(true)
  })
})

describe('preferRegionInterlinks', () => {
  it('keeps AU hosts and only falls back to CA/US when AU pool is empty', () => {
    const mixed = preferRegionInterlinks([
      { label: 'AU student visa', url: 'https://legal.yousafeconsultancy.com/au/student-visa/' },
      { label: 'CA estate', url: 'https://legal.yousafeconsultancy.com/ca/estate-planning/' },
      { label: 'US estate', url: 'https://legal.yousafeconsultancy.com/us/estate-planning/' },
    ], 'AU', 2)
    expect(mixed.fallbackUsed).toBe(false)
    expect(mixed.kept.map((i) => i.url).join(' ')).not.toMatch(/\/ca\/|\/us\//)

    const fallback = preferRegionInterlinks([
      { label: 'CA estate', url: 'https://legal.yousafeconsultancy.com/ca/estate-planning/' },
      { label: 'US estate', url: 'https://legal.yousafeconsultancy.com/us/estate-planning/' },
    ], 'AU', 2)
    expect(fallback.fallbackUsed).toBe(true)
    expect(fallback.kept).toHaveLength(2)
  })
})
