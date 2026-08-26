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
  keywordRegion,
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

  it('is weak (not confident) on a single generic marker', () => {
    const d = detectRegionFromText('study permit')
    expect(d?.region).toBe('CA')
    expect(d?.confident).toBe(false)
  })

  it('returns null when nothing points at a region', () => {
    expect(detectRegionFromText('how to write a motivation letter')).toBeNull()
    expect(detectRegionFromText('')).toBeNull()
  })
})
