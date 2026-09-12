import {
  buildEnrichmentBrief,
  isUniversityEntityCompatible,
} from '@/lib/seoFactory/crossDomainEnrich'

function page(overrides: Record<string, unknown>) {
  return {
    url: 'https://example.com/',
    host: 'usa',
    title: 'Example',
    status: 200,
    indexable: true,
    content: '# Example\n\n## Student housing\nHousing guidance for international students.',
    ...overrides,
  } as any
}

describe('SEO Factory university entity consistency', () => {
  const auburn = page({
    url: 'https://usa.yousafeconsultancy.com/universities/auburn-university/',
    host: 'usa',
    title: 'Auburn University Housing: 2026 Campus Guide',
    content: [
      '# Auburn University Housing: 2026 Campus Guide',
      '## Housing costs and documents',
      'International students should compare campus housing, rent, documents, and F-1 requirements.',
    ].join('\n\n'),
  })

  const pacific = page({
    url: 'https://usa.yousafeconsultancy.com/universities/university-of-the-pacific-housing/',
    host: 'usa',
    title: 'FY27 STK Housing Rates at University of the Pacific',
    content: [
      '# FY27 STK Housing Rates at University of the Pacific',
      '## Housing costs and documents',
      'International students should compare campus housing, rent, documents, and F-1 requirements.',
    ].join('\n\n'),
  })

  const genericHousingRights = page({
    url: 'https://legal.yousafeconsultancy.com/us/housing-discrimination-international-student-rights/',
    host: 'legal',
    title: 'Housing Discrimination: International Student Rights',
    content: [
      '# Housing Discrimination: International Student Rights',
      '## Housing rights and documents',
      'International students should understand campus housing, rent, documents, and housing rights.',
    ].join('\n\n'),
  })

  it('rejects a different institution on an institution-specific university page', () => {
    expect(isUniversityEntityCompatible(auburn, pacific)).toBe(false)
  })

  it('keeps generic legal and student resources eligible', () => {
    expect(isUniversityEntityCompatible(auburn, genericHousingRights)).toBe(true)
  })

  it('allows different institutions when the source is explicitly comparative', () => {
    const comparison = page({
      ...auburn,
      url: 'https://usa.yousafeconsultancy.com/universities/auburn-university-vs-university-of-the-pacific/',
      title: 'Auburn University vs University of the Pacific for International Students',
      content: '# Auburn University vs University of the Pacific for International Students\n\n## Housing comparison\nCompare housing and F-1 requirements.',
    })

    expect(isUniversityEntityCompatible(comparison, pacific)).toBe(true)
  })

  it('applies the entity guard before enrichment scoring', async () => {
    const brief = await buildEnrichmentBrief(
      auburn,
      [auburn, pacific, genericHousingRights],
      [],
    )

    expect(brief.links.some((link) => link.url === pacific.url)).toBe(false)
    expect(brief.links.some((link) => link.url === genericHousingRights.url)).toBe(true)
  })
})
