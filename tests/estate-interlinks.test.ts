import { rankEstateInterlinks } from '@/lib/seoFactory/estateInterlinks'

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
})
