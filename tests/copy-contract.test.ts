/**
 * Writer/brief copy-quality contract.
 *
 * Locks: no mill 1-token keyword fragments, one In 60 seconds block,
 * topic-aware heading fallback (no generic legal kit on CRS calculators),
 * and author overlap that cannot match on token smash (express, entry, canada).
 */
import {
  keywordContractForDraft,
  rejectFragmentKeyword,
  resolveKeywordContract,
  sanitizeBriefOutline,
} from '@/lib/seoFactory/keywordContract'
import { mergeBriefKeywords, partitionKeywords } from '@/lib/seoEngine/planner'
import {
  buildFactorySystemPrompt,
  factoryHeadingFallback,
  stripDuplicateIn60SecondsHeadings,
} from '@/lib/seoFactory/prompts'
import {
  expertiseOverlapPhrases,
  matchProvidersToTopic,
  providerProfileUrl,
  type CitableProvider,
} from '@/lib/seoFactory/providerAuthors'
import type { OwnerPlan } from '@/lib/seoFactory/ownership'

const PRIMARY = 'express entry canada crs calculator'

const legalPlan: OwnerPlan = {
  matched: null,
  matchScore: 0,
  host: 'legal',
  repo: 'caseworks',
  filePath: 'app/ca/express-entry-crs-calculator/page.tsx',
  canonicalUrl: 'https://legal.yousafeconsultancy.com/ca/express-entry-crs-calculator/',
  indexable: true,
  action: 'create',
  intentClass: 'legal_guide',
  contentType: 'legal_guide',
  warnings: [],
  blockers: [],
  ymy: true,
  routingSource: 'registry_host',
} as OwnerPlan

function attorney(partial: Partial<CitableProvider> & { name: string; profileId: string }): CitableProvider {
  const seed: CitableProvider = {
    profileId: partial.profileId,
    role: 'attorney',
    name: partial.name,
    username: partial.username ?? 'pat-lee',
    credentialType: partial.credentialType ?? 'Licensed attorney',
    barNumber: partial.barNumber ?? '123456',
    showBarNumber: false,
    barState: partial.barState ?? 'ON',
    yearsExperience: partial.yearsExperience ?? 8,
    tagline: partial.tagline ?? '',
    practiceAreas: partial.practiceAreas ?? [],
    specialties: partial.specialties ?? [],
    jurisdictions: partial.jurisdictions ?? ['CA'],
    profileUrl: '',
    gigs: partial.gigs ?? [],
    ...partial,
  }
  seed.profileUrl = partial.profileUrl || providerProfileUrl(seed)
  return seed
}

describe('rejectFragmentKeyword — named-program mill fragments', () => {
  it('drops a 1-token subset of a multi-word primary', () => {
    expect(rejectFragmentKeyword('express', PRIMARY)).toBe(true)
    expect(rejectFragmentKeyword('entry', PRIMARY)).toBe(true)
    expect(rejectFragmentKeyword('canada', PRIMARY)).toBe(true)
    expect(rejectFragmentKeyword('crs', PRIMARY)).toBe(true)
  })

  it('keeps the named program phrase express entry', () => {
    expect(rejectFragmentKeyword('express entry', PRIMARY)).toBe(false)
    expect(rejectFragmentKeyword('crs calculator', PRIMARY)).toBe(false)
  })

  it('drops mill mashups like express requirements', () => {
    expect(rejectFragmentKeyword('express requirements', PRIMARY)).toBe(true)
    expect(rejectFragmentKeyword('express entry requirements', PRIMARY)).toBe(false)
  })

  it('drops generic windows and incomplete named-program shorts', () => {
    expect(rejectFragmentKeyword('processing time', 'australia student visa processing time')).toBe(true)
    expect(rejectFragmentKeyword('australia student', 'australia student visa processing time')).toBe(true)
    expect(rejectFragmentKeyword('student visa', 'australia student visa processing time')).toBe(false)
    expect(rejectFragmentKeyword('card timeline', 'green card timeline')).toBe(true)
    expect(rejectFragmentKeyword('green card', 'green card timeline')).toBe(false)
  })
})

describe('keyword contract drops mill fragments', () => {
  it('contract drops express when primary is express entry canada crs calculator', () => {
    const contract = keywordContractForDraft({
      primaryKeyword: PRIMARY,
      requiredShortKeywords: ['express', 'express entry', 'express requirements', 'crs calculator', 'canada crs'],
      requiredLongTailKeywords: [
        'express entry canada crs calculator',
        'how to use a crs calculator',
        'express entry comprehensive ranking score',
        'crs calculator for express entry',
      ],
    })
    expect(contract.requiredShortKeywords).not.toContain('express')
    expect(contract.requiredShortKeywords).not.toContain('express requirements')
    expect(contract.requiredShortKeywords).toContain('express entry')
  })

  it('resolveKeywordContract also drops the fragment', () => {
    const contract = resolveKeywordContract({
      primaryKeyword: PRIMARY,
      requiredShortKeywords: ['express', 'express entry', 'crs calculator', 'canada pr', 'score tool'],
      requiredLongTailKeywords: [
        'express entry canada crs calculator',
        'how crs scoring works in canada',
        'express entry draws versus approval',
        'crs calculator inputs and proof',
      ],
    })
    expect(contract.requiredShortKeywords.some((t) => t === 'express')).toBe(false)
    expect(contract.requiredShortKeywords).toContain('express entry')
  })

  it('partitionKeywords / mergeBriefKeywords never emit the 1-token fragment', () => {
    const partitioned = partitionKeywords(['express', 'express entry', 'express requirements'], PRIMARY)
    expect(partitioned.short).not.toContain('express')
    expect(partitioned.short).toContain('express entry')
    const merged = mergeBriefKeywords({
      modelShort: ['express', 'express entry', 'express requirements'],
      modelLong: ['how to calculate crs for express entry'],
      primaryTerm: PRIMARY,
    })
    expect(merged.short).not.toContain('express')
    expect(merged.short).toContain('express entry')
  })
})

describe('heading fallback is topic-aware', () => {
  it('CRS calculator fallback does not include generic Application process as required kit', () => {
    const lines = factoryHeadingFallback('legal_guide', PRIMARY)
    const text = lines.join('\n')
    expect(text).toMatch(/how scoring works/i)
    expect(text).toMatch(/inputs and proof/i)
    expect(text).toMatch(/factor groups/i)
    expect(text).toMatch(/labelled hypothetical/i)
    expect(text).toMatch(/draws versus approval/i)
    expect(text).not.toMatch(/Application process/i)
    expect(text).not.toMatch(/overview, eligibility\/requirements, application process/)
  })

  it('blogs still skip the legal-kit headings', () => {
    const text = factoryHeadingFallback('blog_post', PRIMARY).join('\n')
    expect(text).toMatch(/purpose-led H2/)
    expect(text).toMatch(/Do NOT force the legal-guide kit/)
  })

  it('system prompt for a CRS calculator uses the scoring fallback, not Application process', () => {
    const prompt = buildFactorySystemPrompt({
      plan: legalPlan,
      contentType: 'legal_guide',
      minWords: 2200,
      primaryKeyword: PRIMARY,
      interlinkAllowlist: [],
    })
    expect(prompt).toMatch(/how scoring works/i)
    expect(prompt).not.toMatch(/Cover these topics as H2 sections \(##\): overview, eligibility\/requirements, application process/)
  })
})

describe('author overlap is phrase-or-program, not token smash', () => {
  it('does not match on [express, entry, canada] alone', () => {
    expect(expertiseOverlapPhrases(PRIMARY, 'express, entry, canada')).toEqual([])
    expect(expertiseOverlapPhrases(PRIMARY, 'express · entry · canada')).toEqual([])

    const smashed = attorney({
      profileId: 'a-smash',
      name: 'Token Smash',
      username: 'token-smash',
      practiceAreas: ['express', 'entry', 'canada'],
      specialties: ['express', 'entry', 'canada'],
      tagline: 'express, entry, canada',
      jurisdictions: ['CA'],
      gigs: [],
    })
    const cited = matchProvidersToTopic([smashed], {
      region: 'CA',
      topic: PRIMARY,
      primaryKeyword: PRIMARY,
      contentType: 'legal_guide',
    })
    const reasons = cited[0]?.matchReasons || []
    expect(reasons.some((r) => /expertise overlap: express, entry, canada/.test(r))).toBe(false)
    expect(reasons.some((r) => /^expertise overlap:/.test(r) && /\bexpress\b/.test(r) && !/express entry/.test(r))).toBe(false)
  })

  it('matches a real express entry phrase', () => {
    expect(expertiseOverlapPhrases(PRIMARY, 'express entry and CRS draws')).toContain('express entry')
    const specialist = attorney({
      profileId: 'a-ee',
      name: 'Pat Lee',
      username: 'pat-lee',
      practiceAreas: ['express entry'],
      specialties: ['CRS', 'permanent residence'],
      tagline: 'Canadian Express Entry and CRS',
      jurisdictions: ['CA', 'Ontario'],
      gigs: [{ slug: 'express-entry-review', title: 'Express Entry profile review', category: 'pr-immigration', jurisdiction: 'ca' }],
    })
    const cited = matchProvidersToTopic([specialist], {
      region: 'CA',
      topic: PRIMARY,
      primaryKeyword: PRIMARY,
      contentType: 'legal_guide',
    })
    expect(cited[0]?.name).toBe('Pat Lee')
    expect(cited[0]?.matchReasons.some((r) => /expertise overlap:/.test(r) && /express entry/i.test(r))).toBe(true)
  })
})

describe('In 60 seconds is one 3–5 bullet block, not a 150–180 word twin', () => {
  it('prompt/builder does not contain 150–180 words for In 60 seconds', () => {
    const prompt = buildFactorySystemPrompt({
      plan: legalPlan,
      contentType: 'legal_guide',
      minWords: 2200,
      primaryKeyword: PRIMARY,
      interlinkAllowlist: [],
    })
    expect(prompt).toMatch(/## In 60 seconds \(3–5 bullets\)/)
    expect(prompt).not.toMatch(/150–180 words/)
    expect(prompt).not.toMatch(/150-180 words/)
    expect(prompt).toMatch(/licensed practitioner/)
    expect(prompt).toMatch(/no keyword stuffing/)
    expect(prompt).toMatch(/no duplicate sections/)
  })

  it('sanitizeBriefOutline collapses a second In 60 seconds heading', () => {
    const outline = sanitizeBriefOutline([
      'In 60 seconds',
      'In 60 seconds (150–180 words)',
      'How scoring works',
      'FAQ',
    ])
    const sixties = outline.filter((h) => /in 60 seconds/i.test(h))
    expect(sixties).toEqual(['In 60 seconds'])
  })

  it('stripDuplicateIn60SecondsHeadings drops a second H2 and normalizes parentheticals', () => {
    const raw = [
      '# CRS calculator',
      '',
      '## In 60 seconds',
      '- One',
      '- Two',
      '- Three',
      '',
      '## How scoring works',
      'Body.',
      '',
      '## In 60 seconds (150–180 words)',
      'A long prose capsule that must not ship.',
      '',
      '## FAQ',
      'Q?',
    ].join('\n')
    const out = stripDuplicateIn60SecondsHeadings(raw)
    expect(out.match(/^## In 60 seconds$/gim) || []).toHaveLength(1)
    expect(out).not.toMatch(/In 60 seconds \(150/)
    expect(out).toContain('## How scoring works')
    expect(out).toContain('## FAQ')
  })
})
