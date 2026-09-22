import fs from 'node:fs'
import path from 'node:path'

import {
  P11_AUDIT_CONTRACT_VERSION,
  classifyCitationUrl,
  normalizeCitationUrl,
  selectStrategicAuditTargets,
  summarizeProviderAttempts,
  type GeoProviderAttempt,
} from '@/lib/seoEngine/geoVisibilityTruth'
import { isAuthoritativeOwnershipRow, isAuSubclass485, isUsFormI485, type OwnershipRow } from '@/lib/seoFactory/ownership'
import { aggregateEngineAudits, parseAuditResponse, type EngineAudit } from '@/lib/seoEngine/llmVisibility'

const registryPath = path.join(process.cwd(), 'data/seo/ownership-registry.json')
const registryJson = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as { rows?: OwnershipRow[] } | OwnershipRow[]
const rows: OwnershipRow[] = Array.isArray(registryJson) ? registryJson : registryJson.rows || []

function targetFor(id: number) {
  const selected = selectStrategicAuditTargets(rows.filter((row) => row.id === id), 1)
  expect(selected).toHaveLength(1)
  return selected[0]
}

function attempt(overrides: Partial<GeoProviderAttempt> = {}): GeoProviderAttempt {
  return {
    provider: 'grok',
    model: 'grok-4.6',
    status: 'success',
    failureReason: null,
    rawCitedUrls: [],
    normalizedCitedUrls: [],
    citationClassifications: [],
    competitorCitedUrls: [],
    flags: [],
    ...overrides,
  }
}

describe('P11 GEO visibility truth contract', () => {
  it('uses the versioned P11 contract and only authoritative confirmed keep/expand/merge rows', () => {
    expect(P11_AUDIT_CONTRACT_VERSION).toBe('p11-geo-v1')
    expect(rows).toHaveLength(76)
    expect(rows.filter(isAuthoritativeOwnershipRow)).toHaveLength(67)

    const selected = selectStrategicAuditTargets(rows, 15)
    expect(selected).toHaveLength(15)
    for (const target of selected) {
      const row = rows.find((candidate) => candidate.id === target.ownershipRowId)
      expect(row && isAuthoritativeOwnershipRow(row)).toBe(true)
      expect(target.authoritativeOwnerUrl).toBe(row?.owner_url)
      expect(target.queryFamily).toBe(row?.primary_keyword)
      expect(target.strategicIntent).toBe(row?.primary_keyword)
    }
  })

  it('stratifies the bounded baseline across the required strategic families when eligible', () => {
    const selected = selectStrategicAuditTargets(rows, 10)
    const terms = selected.map((target) => target.queryFamily.toLowerCase())
    expect(terms.some((term) => /f-1|\bopt\b|stem opt/.test(term))).toBe(true)
    expect(terms.some((term) => /spousal sponsorship|family sponsorship/.test(term))).toBe(true)
    expect(terms.some((term) => /485/.test(term))).toBe(true)
    expect(terms.some((term) => /uk .*student|uk .*graduate|uk .*skilled worker|uk .*depend/.test(term))).toBe(true)
    expect(terms.some((term) => /express entry/.test(term))).toBe(true)
  })

  it('inherits the existing I-485 vs Australia subclass 485 collision guard instead of inventing a second mapper', () => {
    expect(isUsFormI485('US Form I-485 adjustment of status')).toBe(true)
    expect(isAuSubclass485('US Form I-485 adjustment of status')).toBe(false)
    expect(isUsFormI485('Australia subclass 485 graduate visa')).toBe(false)
    expect(isAuSubclass485('Australia subclass 485 graduate visa')).toBe(true)

    const australia = targetFor(76)
    expect(australia.jurisdiction).toBe('AU')
    expect(australia.authoritativeOwnerUrl).toContain('/au/temporary-graduate-485-checklist/')
  })

  it('normalizes citation URLs without losing the raw URL evidence', () => {
    expect(normalizeCitationUrl(' HTTPS://LEGAL.YOUSAFECONSULTANCY.COM//ca/express-entry-document-checklist-2026/?utm_source=x#faq ')).toBe(
      'https://legal.yousafeconsultancy.com/ca/express-entry-document-checklist-2026/',
    )
    expect(normalizeCitationUrl('not a url')).toBeNull()
  })

  it('classifies the exact owner, support page, wrong owner, current other estate, retired public URL, unknown estate and competitor distinctly', () => {
    const target = targetFor(28)

    expect(classifyCitationUrl(target.authoritativeOwnerUrl, target, rows).classification).toBe('current_authoritative_owner')
    expect(classifyCitationUrl(target.supportingUrls[0], target, rows).classification).toBe('current_support_page')
    expect(classifyCitationUrl(rows.find((row) => row.id === 1)!.owner_url, target, rows).classification).toBe('wrong_current_owner')
    expect(classifyCitationUrl('https://portal.yousafeconsultancy.com/dashboard', target, rows).classification).toBe('current_estate_other')
    expect(classifyCitationUrl('https://portal.yousafeconsultancy.com/marketplace/categories/immigration', target, rows).classification).toBe('retired_estate_url')
    expect(classifyCitationUrl('https://future.yousafeconsultancy.com/example', target, rows).classification).toBe('unknown_estate_url')
    expect(classifyCitationUrl('https://www.canada.ca/en/services/immigration-citizenship.html', target, rows).classification).toBe('competitor')
  })

  it('counts only success attempts in citation share while keeping every failure class visible', () => {
    const target = targetFor(28)
    const owner = classifyCitationUrl(target.authoritativeOwnerUrl, target, rows)
    const competitor = classifyCitationUrl('https://www.canada.ca/express-entry', target, rows)

    const summary = summarizeProviderAttempts([
      attempt({ provider: 'grok', citationClassifications: [owner], rawCitedUrls: [owner.rawUrl], normalizedCitedUrls: [owner.normalizedUrl!] }),
      attempt({ provider: 'deepseek-v41-flash', model: 'deepseek-flash', citationClassifications: [competitor], competitorCitedUrls: [competitor.normalizedUrl!] }),
      attempt({ provider: 'missing', model: null, status: 'provider_unavailable', failureReason: 'not configured' }),
      attempt({ provider: 'down', model: null, status: 'provider_failure', failureReason: 'timeout' }),
      attempt({ provider: 'bad-json', model: 'x', status: 'parse_failure', failureReason: 'malformed structured response', rawCitedUrls: ['https://example.com/recovered'] }),
    ])

    expect(summary.attempted).toBe(5)
    expect(summary.successful).toBe(2)
    expect(summary.providerUnavailable).toBe(1)
    expect(summary.providerFailure).toBe(1)
    expect(summary.parseFailure).toBe(1)
    expect(summary.successfulWithAuthoritativeCitation).toBe(1)
    expect(summary.successfulWithCompetitorCitation).toBe(1)
    expect(summary.successfulWithNoExtractableCitation).toBe(0)
    expect(summary.citedSuccessful).toBe(1)
    expect(summary.shareOfVoice).toBe(0.5)
  })

  it('returns null share when zero attempts succeeded instead of manufacturing 0%', () => {
    const summary = summarizeProviderAttempts([
      attempt({ status: 'provider_unavailable', model: null }),
      attempt({ status: 'provider_failure', model: null }),
      attempt({ status: 'parse_failure' }),
    ])
    expect(summary.successful).toBe(0)
    expect(summary.citedSuccessful).toBe(0)
    expect(summary.shareOfVoice).toBeNull()
  })

  it('marks regex-recovered malformed output as parse_failure evidence rather than a successful audit', () => {
    const parsed = parseAuditResponse(
      'Useful prose, but not the required JSON. Source: https://legal.yousafeconsultancy.com/ca/express-entry-document-checklist-2026/',
    )
    expect(parsed.extractionStatus).toBe('parse_failure')
    expect(parsed.sources).toHaveLength(1)
    expect(parsed.sources[0].isEstate).toBe(true)
  })

  it('excludes parse_failure attempts from aggregate citation math even when a recoverable estate URL exists', () => {
    const malformed: EngineAudit = {
      engine: 'grok',
      model: 'grok-4.6',
      ok: false,
      status: 'parse_failure',
      failureReason: 'structured citation response could not be parsed',
      cited: false,
      citedUrls: ['https://legal.yousafeconsultancy.com/ca/express-entry-document-checklist-2026/'],
      competitorDomains: [],
      answerFormat: null,
      snippet: 'recoverable evidence only',
      confidence: 0.5,
      flags: ['malformed_json'],
    }
    const success: EngineAudit = {
      engine: 'deepseek-v41-flash',
      model: 'deepseek-flash',
      ok: true,
      status: 'success',
      failureReason: null,
      cited: false,
      citedUrls: [],
      competitorDomains: ['canada.ca'],
      answerFormat: 'direct_answer',
      snippet: 'structured response',
      confidence: 0.8,
      flags: [],
    }
    const result = aggregateEngineAudits('express entry document checklist', [malformed, success])
    expect(result.measurementState).toBe('measured')
    expect(result.shareOfVoice).toBe(0)
    expect(result.citedUrls).toEqual([])
    expect(result.competitorDomains).toEqual(['canada.ca'])
  })

})
