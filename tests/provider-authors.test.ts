import {
  authorPackFromProvider,
  citedProvidersPromptBlock,
  citedProvidersPublic,
  classifyTopicFields,
  credentialLineFor,
  experienceScopeFor,
  isMarketplaceServiceUrl,
  marketplaceServiceLinks,
  matchProvidersToTopic,
  mergeMarketplaceServiceLinks,
  overlappingTokens,
  providerGigUrl,
  providerProfileUrl,
  regionFromPlace,
  tokenize,
  type CitableProvider,
} from '@/lib/seoFactory/providerAuthors'
import { validateAuthorPack } from '@/lib/seoFactory/authorPack'
import { buildFactorySystemPrompt } from '@/lib/seoFactory/prompts'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

function attorney(partial: Partial<CitableProvider> & { name: string; profileId: string }): CitableProvider {
  const seed: CitableProvider = {
    profileId: partial.profileId,
    role: 'attorney',
    name: partial.name,
    username: partial.username ?? 'jane-doe',
    credentialType: partial.credentialType ?? 'Licensed attorney',
    barNumber: partial.barNumber ?? '123456',
    showBarNumber: partial.showBarNumber ?? false,
    barState: partial.barState ?? 'NY',
    yearsExperience: partial.yearsExperience ?? 8,
    tagline: partial.tagline ?? 'US immigration petitions',
    practiceAreas: partial.practiceAreas ?? ['immigration', 'visas'],
    specialties: partial.specialties ?? ['H-1B', 'family petitions'],
    jurisdictions: partial.jurisdictions ?? ['US', 'United States'],
    profileUrl: '',
    gigs: partial.gigs ?? [
      { slug: 'h1b-petition-review', title: 'H-1B petition review', category: 'work visa', jurisdiction: 'US' },
      { slug: 'generic-consult', title: 'General consult', category: 'consult', jurisdiction: 'US' },
    ],
    ...partial,
  }
  seed.profileUrl = partial.profileUrl || providerProfileUrl(seed)
  return seed
}

function consultant(partial: Partial<CitableProvider> & { name: string; profileId: string }): CitableProvider {
  const seed: CitableProvider = {
    profileId: partial.profileId,
    role: 'consultant',
    name: partial.name,
    username: partial.username ?? 'priya-admissions',
    credentialType: 'Verified consultant',
    barNumber: null,
    showBarNumber: false,
    barState: null,
    yearsExperience: 6,
    tagline: 'UK university admissions',
    practiceAreas: ['admissions', 'SOP'],
    specialties: ['study', 'university'],
    jurisdictions: ['UK'],
    profileUrl: '',
    gigs: [
      { slug: 'uk-sop-review', title: 'UK statement of purpose review', category: 'admissions', jurisdiction: 'UK' },
    ],
    ...partial,
  }
  seed.profileUrl = partial.profileUrl || providerProfileUrl(seed)
  return seed
}

describe('provider author matching', () => {
  it('overlappingTokens treats visa/visas as a hit', () => {
    expect(overlappingTokens(tokenize('h-1b visa requirements'), tokenize('immigration visas'))).toContain('visa')
    expect(overlappingTokens(tokenize('h-1b visa requirements'), tokenize('H-1B family petitions'))).toContain('h1b')
  })

  it('never publishes a bar number when show_bar_number is false', () => {
    const line = credentialLineFor({
      role: 'attorney',
      credentialType: 'Licensed attorney',
      barNumber: '999888',
      showBarNumber: false,
      barState: 'CA',
    })
    expect(line).toContain('Licensed attorney')
    expect(line).toContain('CA')
    expect(line).not.toMatch(/999888/)
    expect(line).not.toMatch(/bar /)
  })

  it('never appends bar/registration identifiers even when showBarNumber is true', () => {
    const line = credentialLineFor({
      role: 'attorney',
      credentialType: 'Solicitor',
      barNumber: 'SRA-441',
      showBarNumber: true,
      barState: 'England & Wales',
    })
    // SEO author output is not the controlled bio-card; identifiers stay out.
    expect(line).toBe('Solicitor · England & Wales')
    expect(line).not.toMatch(/SRA-441/)
    expect(line).not.toMatch(/bar /i)
  })

  it('picks the US immigration attorney over a UK solicitor for a US H-1B guide', () => {
    const us = attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale' })
    const uk = attorney({
      profileId: 'a-uk',
      name: 'Alex Harper',
      username: 'alex-harper',
      jurisdictions: ['UK', 'England & Wales'],
      practiceAreas: ['immigration'],
      specialties: ['skilled worker'],
      barState: 'England & Wales',
      gigs: [{ slug: 'uk-skilled-worker', title: 'UK skilled worker advice', category: 'work visa', jurisdiction: 'UK' }],
    })
    const cited = matchProvidersToTopic([uk, us], {
      region: 'US',
      topic: 'H-1B visa requirements',
      primaryKeyword: 'h-1b visa',
      contentType: 'legal_guide',
    })
    expect(cited[0]?.name).toBe('Jordan Hale')
    expect(cited[0]?.matchReasons.some((r) => /US/.test(r) || /expertise/.test(r))).toBe(true)
    expect(cited[0]?.servicePages[0]?.url).toBe(providerGigUrl('h1b-petition-review'))
  })

  it('prefers an admissions consultant on a study-abroad topic', () => {
    const lawyer = attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale' })
    const advisor = consultant({ profileId: 'c-uk', name: 'Priya Shah', username: 'priya-shah' })
    const cited = matchProvidersToTopic([lawyer, advisor], {
      region: 'UK',
      topic: 'statement of purpose for UK university admissions',
      primaryKeyword: 'uk university sop',
      contentType: 'article',
    })
    expect(cited[0]?.name).toBe('Priya Shah')
    expect(cited[0]?.role).toBe('consultant')
  })

  it('does not cite a mismatched attorney on a non-YMYL blog', () => {
    const tax = attorney({
      profileId: 'a-tax',
      name: 'Sam Tax',
      username: 'sam-tax',
      practiceAreas: ['tax'],
      specialties: ['corporate tax'],
      jurisdictions: ['DE'],
      tagline: 'Delaware corporate tax',
      gigs: [],
    })
    const cited = matchProvidersToTopic([tax], {
      region: 'US',
      topic: 'packing list for a weekend trip',
      primaryKeyword: 'weekend packing list',
      contentType: 'blog_post',
    })
    expect(cited).toEqual([])
  })

  it('YMYL fallback still cites a licensed attorney when expertise is thin', () => {
    const generic = attorney({
      profileId: 'a-us',
      name: 'Jordan Hale',
      username: 'jordan-hale',
      practiceAreas: ['litigation'],
      specialties: ['civil'],
      jurisdictions: [],
      tagline: 'Civil litigator',
      gigs: [],
    })
    const cited = matchProvidersToTopic([generic], {
      region: 'US',
      topic: 'I-130 affidavit of support',
      primaryKeyword: 'i-130 affidavit',
      contentType: 'legal_guide',
    })
    expect(cited[0]?.name).toBe('Jordan Hale')
    expect(cited[0]?.matchReasons.join(' ')).toMatch(/YMYL fallback|practises in US|triangulat|nearest related|same field|same specialty/)
  })
})

describe('jurisdiction and field triangulation', () => {
  it('maps bar-state jurisdictions like NY/NJ onto the US region', () => {
    expect(regionFromPlace('NY')).toBe('us')
    expect(regionFromPlace('New Jersey')).toBe('us')
    expect(regionFromPlace('England & Wales')).toBe('uk')
    expect(regionFromPlace('Ontario')).toBe('ca')
    expect(regionFromPlace('CA', { barState: true })).toBe('us')
    expect(regionFromPlace('CA', { siblings: ['NY', 'NJ'] })).toBe('us')
    expect(regionFromPlace('ca')).toBe('ca')
    expect(classifyTopicFields('I-130 affidavit of support')[0]?.subcategoryId).toBe('family-sponsorship')
    expect(classifyTopicFields('H-1B visa requirements')[0]?.subcategoryId).toBe('work-permits')
  })

  it('cites a NY immigration attorney on an I-130 blog even without a 1:1 form match', () => {
    const ny = attorney({
      profileId: 'a-ny',
      name: 'Jordan Hale',
      username: 'jordan-hale',
      practiceAreas: ['immigration'],
      specialties: ['family petitions'],
      jurisdictions: ['NY', 'NJ'],
      tagline: 'Family-based immigration',
      gigs: [{ slug: 'family-petition-review', title: 'Family petition review', category: 'immigration', jurisdiction: 'us' }],
    })
    const cited = matchProvidersToTopic([ny], {
      region: 'US',
      topic: 'I-130 affidavit of support',
      primaryKeyword: 'i-130 affidavit',
      contentType: 'blog_post',
    })
    expect(cited).toHaveLength(1)
    expect(cited[0]?.name).toBe('Jordan Hale')
    expect(cited[0]?.matchReasons.join(' ')).toMatch(/US|same field|same specialty|family|immigration/i)
  })

  it('prefers a settlement consultant over a tax attorney for a newcomer banking blog', () => {
    const tax = attorney({
      profileId: 'a-tax',
      name: 'Sam Tax',
      username: 'sam-tax',
      practiceAreas: ['tax'],
      specialties: ['corporate tax'],
      jurisdictions: ['DE'],
      tagline: 'Delaware corporate tax',
      gigs: [],
    })
    const banker = consultant({
      profileId: 'c-settle',
      name: 'Priya Shah',
      username: 'priya-shah',
      practiceAreas: ['settlement'],
      specialties: ['banking', 'newcomer setup'],
      jurisdictions: ['US'],
      tagline: 'Newcomer banking and SIN/SSN setup',
      gigs: [{ slug: 'newcomer-bank-setup', title: 'Open a US bank account as a newcomer', category: 'settlement', jurisdiction: 'us' }],
    })
    const cited = matchProvidersToTopic([tax, banker], {
      region: 'US',
      topic: 'how to open a bank account in the US as a newcomer',
      primaryKeyword: 'open bank account usa immigrant',
      contentType: 'blog_post',
    })
    expect(cited[0]?.name).toBe('Priya Shah')
    expect(cited[0]?.role).toBe('consultant')
  })

  it('triangulates a work-permit attorney onto an H-1B guide when no H-1B specialist exists', () => {
    const work = attorney({
      profileId: 'a-work',
      name: 'Jordan Hale',
      username: 'jordan-hale',
      practiceAreas: ['immigration'],
      specialties: ['work permits'],
      jurisdictions: ['NY'],
      tagline: 'Employment-based immigration',
      gigs: [{ slug: 'work-permit-review', title: 'Work permit document review', category: 'work-permits', jurisdiction: 'us' }],
    })
    const cited = matchProvidersToTopic([work], {
      region: 'US',
      topic: 'H-1B specialty occupation petition timeline',
      primaryKeyword: 'h-1b petition timeline',
      contentType: 'legal_guide',
    })
    expect(cited[0]?.name).toBe('Jordan Hale')
    expect(cited.some((p) => p.name === 'Jordan Hale')).toBe(true)
  })

  it('still returns a provider when the only panel member is adjacent, not 1:1', () => {
    const education = consultant({
      profileId: 'c-edu',
      name: 'Priya Shah',
      username: 'priya-shah',
      practiceAreas: ['admissions'],
      specialties: ['university'],
      jurisdictions: ['UK'],
      tagline: 'UK university admissions',
    })
    const cited = matchProvidersToTopic([education], {
      region: 'UK',
      topic: 'UK student visa CAS letter checklist',
      primaryKeyword: 'uk student visa cas',
      contentType: 'blog_post',
    })
    expect(cited[0]?.name).toBe('Priya Shah')
    expect(cited[0]?.matchReasons.join(' ')).toMatch(/related|same field|study|admissions|triangulat|UK/i)
  })
})

describe('author pack and prompt block', () => {
  it('authorPackFromProvider carries the marketplace profile URL and recorded credential only', () => {
    const cited = matchProvidersToTopic(
      [attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale', showBarNumber: true, barNumber: 'SECRET-99' })],
      { region: 'US', topic: 'H-1B visa', primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
    )
    expect(cited[0]).toBeTruthy()
    const pack = authorPackFromProvider(cited[0]!)
    expect(pack.name).toBe('Jordan Hale')
    expect(pack.marketplaceUrl).toBe('https://market.yousafeconsultancy.com/providers/jordan-hale')
    expect(pack.providerType).toBe('attorney')
    // SECRET-99 must never leak into SEO author surfaces even when opted in.
    expect(pack.credential).not.toMatch(/SECRET-99/)
    const prompt = citedProvidersPromptBlock(cited)
    expect(prompt).not.toMatch(/SECRET-99/)
    const pub = citedProvidersPublic(cited)
    expect(JSON.stringify(pub)).not.toMatch(/SECRET-99/)
    expect(pub[0]).not.toHaveProperty('barNumber')
    expect(validateAuthorPack(pack, { contentType: 'legal_guide', ymyl: true })).toEqual([])
    expect(experienceScopeFor(cited[0]!)).toMatch(/immigration/i)
  })

  it('SECRET-99 never appears in AuthorPack.credential, prompt block, or public citation when showBarNumber true', () => {
    const cited = matchProvidersToTopic(
      [attorney({
        profileId: 'a-secret',
        name: 'Secret Counsel',
        username: 'secret-counsel',
        credentialType: 'Solicitor',
        barNumber: 'SECRET-99',
        showBarNumber: true,
        barState: 'England & Wales',
        jurisdictions: ['UK', 'England & Wales'],
        practiceAreas: ['immigration'],
        specialties: ['skilled worker'],
        gigs: [{ slug: 'uk-skilled-worker', title: 'UK skilled worker advice', category: 'work visa', jurisdiction: 'UK' }],
      })],
      { region: 'UK', topic: 'UK skilled worker visa', primaryKeyword: 'uk skilled worker', contentType: 'legal_guide' },
    )
    expect(cited[0]).toBeTruthy()
    const pack = authorPackFromProvider(cited[0]!)
    expect(pack.credential).toBe('Solicitor · England & Wales')
    expect(pack.credential).not.toMatch(/SECRET-99/)
    expect(citedProvidersPromptBlock(cited)).not.toMatch(/SECRET-99/)
    expect(JSON.stringify(citedProvidersPublic(cited))).not.toMatch(/SECRET-99/)
  })

  it('prompt block lists profile + service URLs and forbids invented people', () => {
    const cited = matchProvidersToTopic(
      [attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale' })],
      { region: 'US', topic: 'H-1B visa', primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
    )
    const block = citedProvidersPromptBlock(cited)
    expect(block).toContain('Jordan Hale')
    expect(block).toContain('https://market.yousafeconsultancy.com/providers/jordan-hale')
    expect(block).toContain('https://market.yousafeconsultancy.com/gigs/h1b-petition-review')
    expect(block).toContain('never invent YouSafe Editorial Team')
    expect(block).toMatch(/Do not invent additional people/)
    expect(citedProvidersPromptBlock([])).toMatch(/Do not invent a named author/)
  })

  it('marketplace service links merge without duplicates and survive public serialization', () => {
    const cited = matchProvidersToTopic(
      [attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale' })],
      { region: 'US', topic: 'H-1B visa', primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
    )
    const links = marketplaceServiceLinks(cited)
    expect(links.some((l) => l.url.includes('/providers/jordan-hale'))).toBe(true)
    expect(links.some((l) => l.url.includes('/gigs/h1b-petition-review'))).toBe(true)
    const merged = mergeMarketplaceServiceLinks(
      [{ label: 'H-1B petition review', url: links.find((l) => l.url.includes('/gigs/'))!.url }],
      links,
    )
    expect(merged.filter((l) => l.url.includes('/gigs/h1b-petition-review'))).toHaveLength(1)
    const pub = citedProvidersPublic(cited)
    expect(pub[0]).toMatchObject({ name: 'Jordan Hale', role: 'attorney' })
    expect(pub[0]).not.toHaveProperty('barNumber')
  })

  it('recognises canonical marketplace service URLs only', () => {
    expect(isMarketplaceServiceUrl('https://market.yousafeconsultancy.com/providers/jordan-hale')).toBe(true)
    expect(isMarketplaceServiceUrl('https://market.yousafeconsultancy.com/gigs/h1b-petition-review')).toBe(true)
    expect(isMarketplaceServiceUrl('https://legal.yousafeconsultancy.com/us/h1b-visa/')).toBe(false)
    expect(isMarketplaceServiceUrl('https://example.com/providers/fake')).toBe(false)
  })
})

describe('writer prompt cites the matched attorney', () => {
  const plan = {
    matched: null,
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/h1b-visa/page.tsx',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/h1b-visa/',
    indexable: true,
    action: 'create',
    intentClass: 'informational',
    contentType: 'legal_guide',
    blockers: [],
    routingSource: 'registry',
  } as unknown as OwnerPlan

  it('injects the marketplace citation block into the factory system prompt', () => {
    const cited = matchProvidersToTopic(
      [attorney({ profileId: 'a-us', name: 'Jordan Hale', username: 'jordan-hale' })],
      { region: 'US', topic: 'H-1B visa', primaryKeyword: 'h-1b visa', contentType: 'legal_guide' },
    )
    const prompt = buildFactorySystemPrompt({
      plan,
      contentType: 'legal_guide',
      minWords: 1200,
      citedProviders: cited,
      interlinkAllowlist: marketplaceServiceLinks(cited),
    })
    expect(prompt).toContain('YMYL AUTHOR / MARKETPLACE CITATION')
    expect(prompt).toContain('Jordan Hale')
    expect(prompt).toContain('https://market.yousafeconsultancy.com/providers/jordan-hale')
    expect(prompt).toContain('https://market.yousafeconsultancy.com/gigs/h1b-petition-review')
    expect(prompt).toMatch(/never invent YouSafe Editorial Team/)
    expect(prompt).toContain('Jordan Hale — Licensed attorney')
  })
})
