import {
  HOST_PUBLIC,
  isAuthoritativeOwnershipRow,
  type OwnershipRow,
} from '@/lib/seoFactory/ownership'

export const P11_AUDIT_CONTRACT_VERSION = 'p11-geo-v1' as const
export const P11_PROMPT_ID = 'p11-geo-citation-audit' as const
export const P11_PROMPT_VERSION = '2026-09-22.1' as const

export type GeoAuditStatus =
  | 'success'
  | 'provider_unavailable'
  | 'provider_failure'
  | 'parse_failure'
  | 'blocked'
  | 'unknown'

export type CitationClassification =
  | 'current_authoritative_owner'
  | 'current_support_page'
  | 'wrong_current_owner'
  | 'current_estate_other'
  | 'retired_estate_url'
  | 'unknown_estate_url'
  | 'competitor'
  | 'invalid'

export interface StrategicAuditTarget {
  ownershipRowId: number
  query: string
  queryFamily: string
  strategicIntent: string
  readerIntent: string
  jurisdiction: 'US' | 'CA' | 'UK' | 'AU' | 'GLOBAL' | 'UNKNOWN'
  authoritativeOwnerUrl: string
  ownerHost: string
  supportingUrls: string[]
}

export interface ClassifiedCitation {
  rawUrl: string
  normalizedUrl: string | null
  classification: CitationClassification
  matchedOwnershipRowId: number | null
}

export interface GeoProviderAttempt {
  provider: string
  model: string | null
  status: GeoAuditStatus
  failureReason: string | null
  rawCitedUrls: string[]
  normalizedCitedUrls: string[]
  citationClassifications: ClassifiedCitation[]
  competitorCitedUrls: string[]
  flags: string[]
}

export interface GeoCoverageSummary {
  attempted: number
  successful: number
  providerUnavailable: number
  providerFailure: number
  parseFailure: number
  blocked: number
  unknown: number
  citedSuccessful: number
  successfulWithAuthoritativeCitation: number
  successfulWithOtherCurrentYouSafeCitation: number
  successfulWithWrongOrRetiredYouSafeCitation: number
  successfulWithCompetitorCitation: number
  successfulWithNoExtractableCitation: number
  distinctCurrentYouSafeUrls: string[]
  distinctCompetitorDomains: string[]
  shareOfVoice: number | null
}

const CURRENT_PUBLIC_HOSTS = new Set([
  ...Object.values(HOST_PUBLIC).map((base) => new URL(base).hostname.toLowerCase()),
  'www.yousafeconsultancy.com',
  // Portal is a legitimate current authenticated/app surface, but never the
  // authoritative public Marketplace canonical.
  'portal.yousafeconsultancy.com',
])


function hostnameOf(normalizedUrl: string): string {
  return new URL(normalizedUrl).hostname.toLowerCase()
}

function canonicalHostname(hostname: string): string {
  return hostname.toLowerCase() === 'www.yousafeconsultancy.com'
    ? 'yousafeconsultancy.com'
    : hostname.toLowerCase()
}

function normalizedForComparison(value: string): string | null {
  const normalized = normalizeCitationUrl(value)
  if (!normalized) return null
  const url = new URL(normalized)
  url.hostname = canonicalHostname(url.hostname)
  return url.toString()
}

export function normalizeCitationUrl(value: string): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hostname = url.hostname.toLowerCase()
    url.hash = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/')
    if (!url.pathname) url.pathname = '/'
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|gclid$|fbclid$|msclkid$)/i.test(key)) url.searchParams.delete(key)
    }
    url.searchParams.sort()
    return url.toString()
  } catch {
    return null
  }
}

function jurisdictionFromOwnerUrl(ownerUrl: string, ownerHost: string): StrategicAuditTarget['jurisdiction'] {
  try {
    const path = new URL(ownerUrl).pathname.toLowerCase()
    if (/^\/us(?:\/|$)/.test(path)) return 'US'
    if (/^\/ca(?:\/|$)/.test(path)) return 'CA'
    if (/^\/uk(?:\/|$)/.test(path)) return 'UK'
    if (/^\/au(?:\/|$)/.test(path)) return 'AU'
  } catch {
    return 'UNKNOWN'
  }
  if (ownerHost === 'usa') return 'US'
  if (ownerHost === 'ca') return 'CA'
  if (ownerHost === 'uk') return 'UK'
  if (ownerHost === 'au') return 'AU'
  if (ownerHost === 'apex' || ownerHost === 'market') return 'GLOBAL'
  return 'UNKNOWN'
}

export function strategicAuditTargetFromRow(row: OwnershipRow): StrategicAuditTarget | null {
  if (!isAuthoritativeOwnershipRow(row)) return null
  return {
    ownershipRowId: row.id,
    query: String(row.primary_keyword || '').trim(),
    queryFamily: String(row.primary_keyword || '').trim(),
    strategicIntent: String(row.primary_keyword || '').trim(),
    readerIntent: String(row.intent_class || '').trim(),
    jurisdiction: jurisdictionFromOwnerUrl(row.owner_url, row.owner_host),
    authoritativeOwnerUrl: row.owner_url,
    ownerHost: row.owner_host,
    supportingUrls: Array.isArray(row.supporting_urls) ? row.supporting_urls.map(String).filter(Boolean) : [],
  }
}

const BASELINE_FAMILY_MATCHERS: ReadonlyArray<(value: string) => boolean> = [
  (value) => /\bf-?1\b|\bopt\b|stem opt/i.test(value),
  (value) => /spousal sponsorship|family sponsorship/i.test(value),
  (value) => /\b485\b|subclass 485/i.test(value),
  (value) => /\buk\b.*\b(student|graduate|skilled worker|depend(?:ant|ent)s?)\b/i.test(value),
  (value) => /express entry/i.test(value),
]

/**
 * Deterministic, ownership-first baseline. Required strategic families are
 * represented first when the registry contains an authoritative row, then the
 * remaining slots are filled by stable registry id order. No planner/knowledge
 * or generated keyword list participates in this selection.
 */
export function resolveStrategicAuditTarget(
  query: string,
  rows: OwnershipRow[],
): StrategicAuditTarget | null {
  const key = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!key) return null
  const row = rows.find((candidate) =>
    isAuthoritativeOwnershipRow(candidate)
    && String(candidate.primary_keyword || '').trim().toLowerCase().replace(/\s+/g, ' ') === key
  )
  return row ? strategicAuditTargetFromRow(row) : null
}

export function selectStrategicAuditTargets(rows: OwnershipRow[], limit: number): StrategicAuditTarget[] {
  const cap = Math.max(0, Math.floor(Number(limit) || 0))
  if (!cap) return []
  const authoritative = rows
    .filter(isAuthoritativeOwnershipRow)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
  const selected: OwnershipRow[] = []
  const seen = new Set<number>()

  for (const matches of BASELINE_FAMILY_MATCHERS) {
    if (selected.length >= cap) break
    const hit = authoritative.find((row) => !seen.has(row.id) && matches(row.primary_keyword))
    if (!hit) continue
    selected.push(hit)
    seen.add(hit.id)
  }

  for (const row of authoritative) {
    if (selected.length >= cap) break
    if (seen.has(row.id)) continue
    selected.push(row)
    seen.add(row.id)
  }

  return selected
    .map(strategicAuditTargetFromRow)
    .filter((target): target is StrategicAuditTarget => Boolean(target))
}

function isKnownRetiredPublicUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  const path = url.pathname.replace(/\/{2,}/g, '/').toLowerCase()
  if (host === 'portal.yousafeconsultancy.com' && /^\/marketplace(?:\/|$)/.test(path)) return true
  if (host === 'market.yousafeconsultancy.com' && /^\/marketplace(?:\/|$)/.test(path)) return true
  return false
}

function isEstateRootHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'yousafeconsultancy.com' || host.endsWith('.yousafeconsultancy.com')
}

export function classifyCitationUrl(
  rawUrl: string,
  target: StrategicAuditTarget,
  registryRows: OwnershipRow[],
): ClassifiedCitation {
  const normalizedUrl = normalizeCitationUrl(rawUrl)
  if (!normalizedUrl) {
    return { rawUrl, normalizedUrl: null, classification: 'invalid', matchedOwnershipRowId: null }
  }

  const parsed = new URL(normalizedUrl)
  const host = parsed.hostname.toLowerCase()
  if (isKnownRetiredPublicUrl(parsed)) {
    return { rawUrl, normalizedUrl, classification: 'retired_estate_url', matchedOwnershipRowId: null }
  }

  const comparable = normalizedForComparison(normalizedUrl)
  const ownerComparable = normalizedForComparison(target.authoritativeOwnerUrl)
  if (comparable && ownerComparable && comparable === ownerComparable) {
    return {
      rawUrl,
      normalizedUrl,
      classification: 'current_authoritative_owner',
      matchedOwnershipRowId: target.ownershipRowId,
    }
  }

  const supportComparables = new Set(target.supportingUrls.map(normalizedForComparison).filter(Boolean))
  if (comparable && supportComparables.has(comparable)) {
    return { rawUrl, normalizedUrl, classification: 'current_support_page', matchedOwnershipRowId: null }
  }

  if (comparable) {
    const wrongOwner = registryRows.find((row) => {
      if (!isAuthoritativeOwnershipRow(row) || row.id === target.ownershipRowId) return false
      return normalizedForComparison(row.owner_url) === comparable
    })
    if (wrongOwner) {
      return {
        rawUrl,
        normalizedUrl,
        classification: 'wrong_current_owner',
        matchedOwnershipRowId: wrongOwner.id,
      }
    }
  }

  if (CURRENT_PUBLIC_HOSTS.has(host)) {
    return { rawUrl, normalizedUrl, classification: 'current_estate_other', matchedOwnershipRowId: null }
  }
  if (isEstateRootHost(host)) {
    return { rawUrl, normalizedUrl, classification: 'unknown_estate_url', matchedOwnershipRowId: null }
  }
  return { rawUrl, normalizedUrl, classification: 'competitor', matchedOwnershipRowId: null }
}

function hasClassification(attempt: GeoProviderAttempt, classes: CitationClassification[]): boolean {
  return attempt.citationClassifications.some((citation) => classes.includes(citation.classification))
}

function competitorDomain(url: string): string | null {
  try {
    return canonicalHostname(new URL(url).hostname)
  } catch {
    return null
  }
}

export function summarizeProviderAttempts(attempts: GeoProviderAttempt[]): GeoCoverageSummary {
  const successfulAttempts = attempts.filter((attempt) => attempt.status === 'success')
  const isPositiveCurrentCitation = (attempt: GeoProviderAttempt) =>
    hasClassification(attempt, [
      'current_authoritative_owner',
      'current_support_page',
      'current_estate_other',
    ])

  const currentUrls = new Set<string>()
  const competitorDomains = new Set<string>()
  for (const attempt of successfulAttempts) {
    for (const citation of attempt.citationClassifications) {
      if (
        citation.normalizedUrl &&
        [
          'current_authoritative_owner',
          'current_support_page',
          'wrong_current_owner',
          'current_estate_other',
        ].includes(citation.classification)
      ) {
        currentUrls.add(citation.normalizedUrl)
      }
      if (citation.classification === 'competitor' && citation.normalizedUrl) {
        const domain = competitorDomain(citation.normalizedUrl)
        if (domain) competitorDomains.add(domain)
      }
    }
    for (const url of attempt.competitorCitedUrls) {
      const domain = competitorDomain(url)
      if (domain) competitorDomains.add(domain)
    }
  }

  const citedSuccessful = successfulAttempts.filter(isPositiveCurrentCitation).length
  const successful = successfulAttempts.length
  return {
    attempted: attempts.length,
    successful,
    providerUnavailable: attempts.filter((attempt) => attempt.status === 'provider_unavailable').length,
    providerFailure: attempts.filter((attempt) => attempt.status === 'provider_failure').length,
    parseFailure: attempts.filter((attempt) => attempt.status === 'parse_failure').length,
    blocked: attempts.filter((attempt) => attempt.status === 'blocked').length,
    unknown: attempts.filter((attempt) => attempt.status === 'unknown').length,
    citedSuccessful,
    successfulWithAuthoritativeCitation: successfulAttempts.filter((attempt) =>
      hasClassification(attempt, ['current_authoritative_owner']),
    ).length,
    successfulWithOtherCurrentYouSafeCitation: successfulAttempts.filter((attempt) =>
      hasClassification(attempt, ['current_support_page', 'current_estate_other']),
    ).length,
    successfulWithWrongOrRetiredYouSafeCitation: successfulAttempts.filter((attempt) =>
      hasClassification(attempt, ['wrong_current_owner', 'retired_estate_url']),
    ).length,
    successfulWithCompetitorCitation: successfulAttempts.filter((attempt) =>
      hasClassification(attempt, ['competitor']),
    ).length,
    successfulWithNoExtractableCitation: successfulAttempts.filter((attempt) =>
      attempt.citationClassifications.every((citation) => citation.classification === 'invalid'),
    ).length,
    distinctCurrentYouSafeUrls: [...currentUrls].sort(),
    distinctCompetitorDomains: [...competitorDomains].sort(),
    shareOfVoice: successful ? citedSuccessful / successful : null,
  }
}
