/**
 * Brief region-coherence regression tests.
 *
 * Guards against the mixed-region brief failure: a single-country topic
 * (e.g. an AU article) must never receive cross-region keywords (US/CA/UK),
 * H2 outline sections, or keyword placements — no matter what the AI model
 * echoes back. The deterministic filters in researchDemand.ts are the
 * backstop; these tests pin their behaviour.
 */
import {
  detectRegionFromText,
  filterKeywordsByRegion,
  filterOutlineByRegion,
  inferOpportunityRegion,
  isEstateWideRegion,
  keywordRegion,
  queryBelongsToRegion,
  REGION_KNOWLEDGE_TOKENS,
  strategicKeywordBelongsToRegion,
} from '../lib/seoEngine/researchDemand'

describe('keywordRegion', () => {
  it('classifies region-specific keywords', () => {
    expect(keywordRegion('f-1 visa')).toBe('US')
    expect(keywordRegion('canada study permit')).toBe('CA')
    expect(keywordRegion('express entry canada cic')).toBe('CA')
    expect(keywordRegion('uk graduate visa')).toBe('UK')
    expect(keywordRegion('subclass 189')).toBe('AU')
    expect(keywordRegion('australia student visa fee')).toBe('AU')
    expect(keywordRegion('485 graduate visa')).toBe('AU')
  })

  it('leaves generic immigration terms unclassified', () => {
    expect(keywordRegion('student visa')).toBeNull()
    expect(keywordRegion('visa processing times')).toBeNull()
    expect(keywordRegion('how to apply for a visa')).toBeNull()
  })
})

describe('filterKeywordsByRegion', () => {
  it('drops cross-region keywords from a US set', () => {
    const { kept, dropped } = filterKeywordsByRegion(
      ['f-1 visa', 'canada study permit', 'uk graduate visa', 'subclass 189', 'uscis processing times'],
      'US',
    )
    expect(kept).toEqual(['f-1 visa', 'uscis processing times'])
    expect(dropped).toEqual(['canada study permit', 'uk graduate visa', 'subclass 189'])
  })

  it('keeps generic terms regardless of region', () => {
    const { kept, dropped } = filterKeywordsByRegion(['visa interview tips', 'documents checklist'], 'AU')
    expect(kept).toEqual(['visa interview tips', 'documents checklist'])
    expect(dropped).toEqual([])
  })

  it('keeps terms matching the selected region', () => {
    const { kept, dropped } = filterKeywordsByRegion(
      ['subclass 500 eligibility requirements', 'australia student visa fee'],
      'AU',
    )
    expect(kept).toHaveLength(2)
    expect(dropped).toHaveLength(0)
  })
})

describe('filterOutlineByRegion', () => {
  it('strips foreign-country H2 sections from the outline', () => {
    const { kept, dropped } = filterOutlineByRegion(
      [
        'F-1 Visa Application Process',
        'Canada Express Entry Timeline',
        'UK Graduate Route Overview',
        'Work Rights on an F-1 Visa',
        'FAQ',
      ],
      'US',
    )
    expect(kept).toEqual(['F-1 Visa Application Process', 'Work Rights on an F-1 Visa', 'FAQ'])
    expect(dropped).toEqual(['Canada Express Entry Timeline', 'UK Graduate Route Overview'])
  })
})

describe('detectRegionFromText', () => {
  it('auto-detects from an explicit country name', () => {
    expect(detectRegionFromText('Australia student visa fee')?.region).toBe('AU')
    expect(detectRegionFromText('Canada study permit guide')?.region).toBe('CA')
    expect(detectRegionFromText('UK graduate visa timeline')?.region).toBe('UK')
    expect(detectRegionFromText('US EB-3 skilled worker green card')?.region).toBe('US')
  })

  it('is confident on ≥2 programme-marker hits', () => {
    const d = detectRegionFromText('subclass 189 vs subclass 491 points test')
    expect(d?.region).toBe('AU')
    expect(d?.confident).toBe(true)
  })

  it('is confident on a strong single programme marker', () => {
    const d = detectRegionFromText('study permit')
    expect(d?.region).toBe('CA')
    expect(d?.confident).toBe(true)
  })

  it('is weak (not confident) on a single generic marker', () => {
    const d = detectRegionFromText('work permit')
    expect(d?.region).toBe('CA')
    expect(d?.confident).toBe(false)
  })

  it('returns null when nothing points at a region', () => {
    expect(detectRegionFromText('how to write a motivation letter')).toBeNull()
    expect(detectRegionFromText('')).toBeNull()
  })
})

describe('Discover country scan (Refresh intel)', () => {
  it('treats ALL and COMPARE as estate-wide', () => {
    expect(isEstateWideRegion('ALL')).toBe(true)
    expect(isEstateWideRegion('COMPARE')).toBe(true)
    expect(isEstateWideRegion('CA')).toBe(false)
  })

  it('keeps foreign-country GSC queries off a single-country scan', () => {
    expect(queryBelongsToRegion('express entry crs calculator', 'US')).toBe(false)
    expect(queryBelongsToRegion('express entry crs calculator', 'CA')).toBe(true)
    expect(queryBelongsToRegion('h-1b lottery 2026', 'CA')).toBe(false)
    expect(queryBelongsToRegion('h-1b lottery 2026', 'US')).toBe(true)
    expect(queryBelongsToRegion('uk skilled worker salary threshold', 'UK')).toBe(true)
    expect(queryBelongsToRegion('subclass 189 points test', 'AU')).toBe(true)
    expect(queryBelongsToRegion('subclass 189 points test', 'UK')).toBe(false)
  })

  it('keeps generic demand on every country and everything on ALL', () => {
    expect(queryBelongsToRegion('visa interview tips', 'AU')).toBe(true)
    expect(queryBelongsToRegion('visa interview tips', 'US')).toBe(true)
    expect(queryBelongsToRegion('express entry crs calculator', 'ALL')).toBe(true)
    expect(queryBelongsToRegion('h-1b lottery 2026', 'ALL')).toBe(true)
  })

  it('stamps confident country onto the opportunity even on an ALL scan', () => {
    expect(inferOpportunityRegion('Canada study permit cap 2026', 'ALL')).toBe('CA')
    expect(inferOpportunityRegion('F-1 duration of status', 'ALL')).toBe('US')
    expect(inferOpportunityRegion('UK skilled worker visa salary', 'CA')).toBe('UK')
    expect(inferOpportunityRegion('visa interview tips', 'AU')).toBe('AU')
  })

  it('filters the strategy corpus by cluster country so CA is not US leftovers', () => {
    expect(strategicKeywordBelongsToRegion('Canada study permit cap 2026 India Nigeria', 'canada-sp-pgwp', 'CA')).toBe(true)
    expect(strategicKeywordBelongsToRegion('F-1 duration of status proposed change 2026', 'us-f1-opt', 'CA')).toBe(false)
    expect(strategicKeywordBelongsToRegion('UK skilled worker visa salary threshold 2026', 'uk-work', 'UK')).toBe(true)
    expect(strategicKeywordBelongsToRegion('F-1 student health insurance USA Canada UK comparison 2026', 'compare', 'CA')).toBe(false)
    expect(strategicKeywordBelongsToRegion('Canada study permit cap 2026 India Nigeria', 'canada-sp-pgwp', 'ALL')).toBe(true)
  })

  it('expands 2-letter scan codes into knowledge tokens longer than 3 chars', () => {
    for (const code of ['US', 'CA', 'UK', 'AU'] as const) {
      const tokens = REGION_KNOWLEDGE_TOKENS[code].split(/\s+/).filter((t) => t.length > 3)
      expect(tokens.length).toBeGreaterThan(2)
    }
    expect(REGION_KNOWLEDGE_TOKENS.ALL).toBe('')
  })
})
