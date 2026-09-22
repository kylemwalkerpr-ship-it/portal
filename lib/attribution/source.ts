/**
 * P10 source/consent/cluster classification — pure, deterministic, testable.
 *
 * Design rules:
 *  - Nothing is inferred from a missing signal. No referrer, no campaign and no
 *    durable product truth means the answer is `unknown`/`null`, not a guess.
 *  - Landing host/path are CONTEXT, never acquisition evidence. They prove where
 *    a visitor landed, not how they arrived: a missing referrer can be caused by
 *    privacy settings, a `Referrer-Policy` header or browser behaviour, so it can
 *    never prove typed/bookmark/direct navigation. `direct` therefore stays in
 *    the vocabulary as a RESERVED explicit-source value and is never derived from
 *    missing evidence.
 *  - Only the referring HOST is ever retained. Full referrer URLs can carry
 *    personal or search-query data, so they are never stored.
 *  - The estate host list is imported from the existing GA4 linker contract, so
 *    there is exactly one estate-domain list rather than a second analytics estate.
 */
import { GA4_LINKER_DOMAINS } from '@/lib/analytics/ga4'
import {
  ATTRIBUTION_MAX_CAMPAIGN_VALUE_LENGTH,
  ATTRIBUTION_MAX_PATH_LENGTH,
  ATTRIBUTION_SOURCE_CLASSES,
  P10_PILOT,
  type AnalyticsConsent,
  type AttributionSourceClass,
  type P10Cluster,
} from './contract'

/** Query parameters that identify a paid/social campaign. Kept next to the source model. */
export const CAMPAIGN_QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'dclid',
  'fbclid',
  'msclkid',
  'ttclid',
  'twclid',
  'yclid',
  'epik',
  'mc_cid',
  'mc_eid',
] as const

/** Click-identifier parameters that mean "this was a paid click" without utm_*. */
const CLICK_ID_KEYS = new Set(['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'ttclid', 'twclid', 'yclid', 'epik'])

/** Search engines whose referrer means organic search. Suffix-matched on the host. */
const SEARCH_ENGINE_HOSTS: readonly [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/i, 'google'],
  [/(^|\.)bing\.com$/i, 'bing'],
  [/(^|\.)duckduckgo\.com$/i, 'duckduckgo'],
  [/(^|\.)search\.yahoo\.com$/i, 'yahoo'],
  [/(^|\.)yahoo\.com$/i, 'yahoo'],
  [/(^|\.)ecosia\.org$/i, 'ecosia'],
  [/(^|\.)search\.brave\.com$/i, 'brave'],
  [/(^|\.)startpage\.com$/i, 'startpage'],
  [/(^|\.)yandex\.[a-z.]+$/i, 'yandex'],
  [/(^|\.)baidu\.com$/i, 'baidu'],
  [/(^|\.)naver\.com$/i, 'naver'],
  [/(^|\.)qwant\.com$/i, 'qwant'],
  [/(^|\.)mojeek\.com$/i, 'mojeek'],
  [/(^|\.)search\.marginalia\.nu$/i, 'marginalia'],
  [/(^|\.)presearch\.com$/i, 'presearch'],
  [/(^|\.)ask\.com$/i, 'ask'],
  [/(^|\.)aol\.com$/i, 'aol'],
]

export type CampaignCapture = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
  click_id_kind?: string
}

export type AttributionSourceSnapshot = {
  source_class: AttributionSourceClass
  source_detail: Record<string, string>
  landing_host: string | null
  landing_path: string | null
}

export function parseConsent(value: unknown): AnalyticsConsent {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'granted' || raw === 'allow' || raw === 'accepted') return 'granted'
  if (raw === 'denied' || raw === 'reject' || raw === 'rejected') return 'denied'
  return 'unknown'
}

/** A single campaign parameter, trimmed, control-character stripped and length-capped. */
export function normalizeCampaignValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!cleaned) return null
  return cleaned.slice(0, ATTRIBUTION_MAX_CAMPAIGN_VALUE_LENGTH)
}

/** Host only — never a full URL, never a path. */
export function safeReferrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    return host && host.includes('.') ? host.slice(0, 253) : null
  } catch {
    return null
  }
}

export function normalizeLandingPath(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const trimmed = path.trim()
  if (!trimmed) return null
  // Store path only: a query string may carry identifiers we must not retain.
  const withoutQuery = trimmed.split('?')[0].split('#')[0]
  if (!withoutQuery.startsWith('/')) return null
  return withoutQuery.slice(0, ATTRIBUTION_MAX_PATH_LENGTH)
}

export function isEstateHost(host: string | null | undefined): boolean {
  if (!host) return false
  const normalized = host.toLowerCase()
  return GA4_LINKER_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))
}

export function searchEngineForHost(host: string): string | null {
  for (const [pattern, engine] of SEARCH_ENGINE_HOSTS) {
    if (pattern.test(host)) return engine
  }
  return null
}

/**
 * Read campaign signals from a URL's query string. Returns null when there is
 * no campaign evidence at all (so "no campaign" never becomes a fabricated one).
 */
export function readCampaignFromSearchParams(params: URLSearchParams): CampaignCapture | null {
  const capture: CampaignCapture = {}
  for (const key of CAMPAIGN_QUERY_KEYS) {
    const value = normalizeCampaignValue(params.get(key))
    if (!value) continue
    if (key === 'utm_source') capture.source = value
    else if (key === 'utm_medium') capture.medium = value
    else if (key === 'utm_campaign') capture.campaign = value
    else if (key === 'utm_content') capture.content = value
    else if (key === 'utm_term') capture.term = value
    else if (CLICK_ID_KEYS.has(key)) capture.click_id_kind = key
  }
  if (capture.click_id_kind && !capture.medium) capture.medium = 'cpc'
  return Object.keys(capture).length > 0 ? capture : null
}

export function readCampaignFromUrl(url: string | null | undefined): CampaignCapture | null {
  if (!url) return null
  try {
    return readCampaignFromSearchParams(new URL(url).searchParams)
  } catch {
    return null
  }
}

/**
 * Classify a landing from real navigation evidence only.
 *
 *  - campaign query/click-id evidence       -> `campaign`
 *  - explicit referrer on an estate domain  -> `internal`
 *  - explicit search-engine referrer        -> `organic_search`
 *  - explicit other external referrer       -> `referral`
 *  - anything else (including host/path with no referrer and no campaign)
 *                                            -> `unknown`
 *
 * `landing_host`/`landing_path` are always retained as context. They are not
 * evidence of acquisition and can never turn a missing referrer into `direct`.
 */
export function classifyAttributionSource(input: {
  host?: string | null
  path?: string | null
  referrer?: string | null
  campaign?: CampaignCapture | null
}): AttributionSourceSnapshot {
  const host = input.host ? input.host.toLowerCase().slice(0, 253) : null
  const landingPath = normalizeLandingPath(input.path)
  const referrerHost = safeReferrerHost(input.referrer ?? null)
  const campaign = input.campaign ?? null

  const base = {
    landing_host: host,
    landing_path: landingPath,
  }

  if (campaign) {
    const detail: Record<string, string> = {}
    for (const [key, value] of Object.entries(campaign)) {
      if (value) detail[key] = value
    }
    return { ...base, source_class: 'campaign', source_detail: detail }
  }

  if (referrerHost) {
    if (isEstateHost(referrerHost)) {
      return { ...base, source_class: 'internal', source_detail: { referrer_host: referrerHost } }
    }
    const engine = searchEngineForHost(referrerHost)
    if (engine) {
      return { ...base, source_class: 'organic_search', source_detail: { engine } }
    }
    return { ...base, source_class: 'referral', source_detail: { referrer_host: referrerHost } }
  }

  // No campaign and no usable referrer: the acquisition source stays UNKNOWN.
  // A known landing host/path is kept as context only — it cannot evidence how
  // the visitor arrived, and `direct` is reserved for a future explicit source.
  return { ...base, source_class: 'unknown', source_detail: {} }
}

export function isSourceClass(value: unknown): value is AttributionSourceClass {
  return typeof value === 'string' && (ATTRIBUTION_SOURCE_CLASSES as readonly string[]).includes(value)
}

/**
 * Documented cluster vocabulary for commercial objects. Anything that does not
 * match stays `null` (unclassified) — this function never guesses.
 */
const NON_PILOT_CLUSTER_SIGNALS: readonly [RegExp, P10Cluster][] = [
  [/subclass\s*485|485\s*visa|temporary\s*graduate/i, 'au_485'],
  [/express\s*entry|\bcrs\b|comprehensive\s*ranking/i, 'express_entry'],
  [/spousal\s*sponsorship|spouse\s*visa|family\s*sponsorship|common-?law\s*partner/i, 'ca_family'],
  [/uk\s*student\s*route|uk\s*graduate\s*route|skilled\s*worker|uk\s*dependant|graduate\s*visa/i, 'uk_student'],
]

/** Intake case-type ids that already belong to the pilot cluster (lib/intake-questions.ts). */
const PILOT_INTAKE_CASE_TYPES = new Set(P10_PILOT.intake_case_types.map((value) => value.toLowerCase()))

export function classifyCaseTypeCluster(caseType: unknown): P10Cluster | null {
  const normalized = String(caseType ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (PILOT_INTAKE_CASE_TYPES.has(normalized)) return P10_PILOT.cluster
  return null
}

export function classifyProductCluster(productText: unknown): P10Cluster | null {
  const text = String(productText ?? '').trim()
  if (!text) return null
  for (const signal of P10_PILOT.product_signals) {
    if (signal.test(text)) return P10_PILOT.cluster
  }
  for (const [signal, cluster] of NON_PILOT_CLUSTER_SIGNALS) {
    if (signal.test(text)) return cluster
  }
  return null
}

/** Prefer durable case-type truth; fall back to product text; otherwise unclassified. */
export function classifyBusinessCluster(input: {
  caseType?: string | null
  productText?: string | null
}): P10Cluster | null {
  return classifyCaseTypeCluster(input.caseType) ?? classifyProductCluster(input.productText) ?? null
}
