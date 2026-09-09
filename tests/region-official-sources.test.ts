/**
 * Region inference + official-source isolation for Content Studio briefs.
 *
 * Guards the Express Entry Canada CRS Calculator failure: auto-handoff must
 * key CA (not default US) and IRCC URLs must never be padded with USCIS.
 */
import { detectRegionFromText, resolveBriefRegion } from '@/lib/seoEngine/researchDemand'
import {
  applyEvidenceRegionFloor,
  hostRegions,
  isInRegionCitation,
  sourcesForBrief,
} from '@/lib/seoFactory/officialSources'

const USCIS = 'https://www.uscis.gov/working-in-the-united-states'
const IRCC_EXPRESS_ENTRY = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry.html'
const IRCC_CRS = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/comprehensive-ranking-system.html'
const IRCC_ROUNDS = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations.html'

describe('detectRegionFromText', () => {
  it('keys Express Entry Canada CRS Calculator to CA, confident (country name wins)', () => {
    const d = detectRegionFromText('Express Entry Canada CRS Calculator')
    expect(d?.region).toBe('CA')
    expect(d?.confident).toBe(true)
  })

  it('keys Express Entry CRS calculator to CA, confident (express entry marker)', () => {
    const d = detectRegionFromText('Express Entry CRS calculator')
    expect(d?.region).toBe('CA')
    expect(d?.confident).toBe(true)
  })

  it('treats other strong single markers as confident', () => {
    expect(detectRegionFromText('ircc processing times')).toEqual(expect.objectContaining({ region: 'CA', confident: true }))
    expect(detectRegionFromText('study permit')).toEqual(expect.objectContaining({ region: 'CA', confident: true }))
    expect(detectRegionFromText('pgwp eligibility')).toEqual(expect.objectContaining({ region: 'CA', confident: true }))
    expect(detectRegionFromText('ukvi student visa')).toEqual(expect.objectContaining({ region: 'UK', confident: true }))
    expect(detectRegionFromText('home affairs visa listing')).toEqual(expect.objectContaining({ region: 'AU', confident: true }))
    expect(detectRegionFromText('485 visa timeline')).toEqual(expect.objectContaining({ region: 'AU', confident: true }))
    expect(detectRegionFromText('subclass 189')).toEqual(expect.objectContaining({ region: 'AU', confident: true }))
  })
})

describe('resolveBriefRegion', () => {
  it('uses a confident detection even when body.region is the default US', () => {
    const resolved = resolveBriefRegion('US', 'Express Entry Canada CRS Calculator')
    expect(resolved.region).toBe('CA')
    expect(resolved.regionAutoSelected).toBe(true)
  })

  it('keeps an explicit body region when detection is not confident', () => {
    const resolved = resolveBriefRegion('US', 'work permit')
    expect(resolved.region).toBe('US')
    expect(resolved.regionAutoSelected).toBe(false)
  })

  it('lets the topic win when both body and detection are confident', () => {
    const resolved = resolveBriefRegion('UK', 'Express Entry CRS calculator')
    expect(resolved.region).toBe('CA')
    expect(resolved.regionAutoSelected).toBe(true)
  })
})

describe('isInRegionCitation / hostRegions', () => {
  it('does not treat USCIS as in-region for CA', () => {
    expect(isInRegionCitation(USCIS, 'CA')).toBe(false)
    expect(hostRegions(USCIS)).toEqual(['US'])
  })

  it('treats IRCC canada.ca URLs as in-region for CA', () => {
    expect(isInRegionCitation(IRCC_EXPRESS_ENTRY, 'CA')).toBe(true)
    expect(isInRegionCitation(IRCC_CRS, 'CA')).toBe(true)
    expect(hostRegions(IRCC_EXPRESS_ENTRY)).toEqual(['CA'])
  })

  it('keeps immigration department hosts exclusive to their country', () => {
    expect(isInRegionCitation('https://travel.state.gov/content/travel/en/us-visas/study.html', 'CA')).toBe(false)
    expect(isInRegionCitation('https://studyinthestates.dhs.gov/', 'UK')).toBe(false)
    expect(isInRegionCitation('https://www.gov.uk/student-visa', 'CA')).toBe(false)
    expect(isInRegionCitation('https://immi.homeaffairs.gov.au/', 'CA')).toBe(false)
    expect(isInRegionCitation(IRCC_EXPRESS_ENTRY, 'US')).toBe(false)
  })
})

describe('applyEvidenceRegionFloor', () => {
  it('does not keep USCIS when region is CA', () => {
    const out = applyEvidenceRegionFloor([
      `USCIS — ${USCIS}`,
      'State Dept — https://travel.state.gov/content/travel/en/us-visas/study.html',
      'SEVP — https://studyinthestates.dhs.gov/',
      `IRCC — ${IRCC_EXPRESS_ENTRY}`,
    ], 'CA')
    expect(out.lines.join(' ')).not.toMatch(/uscis|state\.gov|dhs\.gov/i)
    expect(out.lines.join(' ')).toMatch(/canada\.ca/)
    expect(out.fallbackUsed).toBe(false)
  })

  it('does not pad a CA brief with only-USCIS lines', () => {
    const out = applyEvidenceRegionFloor([
      `USCIS — ${USCIS}`,
      'State Dept — https://travel.state.gov/content/travel/en/us-visas/study.html',
      'SEVP — https://studyinthestates.dhs.gov/',
    ], 'CA')
    expect(out.lines.join(' ')).not.toMatch(/uscis|state\.gov|dhs\.gov/i)
    expect(out.fallbackUsed).toBe(false)
  })
})

describe('sourcesForBrief', () => {
  it('includes an IRCC URL, not USCIS, for an Express Entry CRS brief', () => {
    const ranked = sourcesForBrief({ region: 'CA', topic: 'express entry crs' })
    const blob = ranked.map((s) => s.url).join('\n')
    expect(blob).toMatch(/canada\.ca\/en\/immigration-refugees-citizenship/)
    expect(blob).not.toMatch(/uscis\.gov/i)
    expect(ranked.some((s) =>
      s.url === IRCC_EXPRESS_ENTRY || s.url === IRCC_CRS || s.url === IRCC_ROUNDS,
    )).toBe(true)
  })
})
