/**
 * Canonical job specification: ContentSpec (implementation brief §3.2).
 *
 * One immutable, versioned spec per job. Resolved once during planning,
 * validated before generation, persisted as a JSON snapshot in the existing
 * job audit payload, and passed unchanged to every model stage. Models cannot
 * invent links, sources, required keywords, content type, region, or
 * structural obligations.
 *
 * Milestone A scope: types + validation + creation helper only. No prompt,
 * route, evaluator, or ship path reads this yet — wiring is a later,
 * supervisor-approved milestone. This module is pure and deterministic.
 */

import {
  PLAYBOOK_VERSION,
  type ContentType,
  type Region,
} from './contentQualityPlaybook'
import { depthSpecForType } from './contentDepth'
import { isCitableSource, isLowValueHost, type CitationContext } from './officialSources'

export type ContentSpecKeyword = {
  phrase: string
  kind: 'short' | 'long_tail'
  optional?: boolean
}

/**
 * Provenance marker issued by link-audit when the URL was live-verified.
 * Structural syntax alone never proves membership in the verified live set —
 * a spec link must carry this explicit evidence record.
 */
export type EstateLinkVerification = {
  verifiedBy: 'link-audit'
  verifiedAt: string
  /** Observed HTTP status at verification time (2xx/3xx expected for live). */
  httpStatus?: number
  /** sha-256 of the verified page body captured by link-audit, when retained. */
  contentHash?: string
}

export type ContentSpecEstateLink = {
  url: string
  anchor: string
  role: 'hub' | 'related'
  verification: EstateLinkVerification
}

/**
 * Explicit provenance evidence for a citation whose citability cannot be
 * deterministically established from the spec context (e.g. a non-cream
 * institutional page that was live-checked by link-audit for this exact job).
 */
export type SourceProvenance = {
  evidence: 'link-audit'
  verifiedAt: string
  contentHash?: string
}

export type ContentSpecApprovedSource = {
  url: string
  publisher: string
  jurisdiction?: string
  purpose: string
  provenance?: SourceProvenance
}

export type ContentSpec = {
  version: typeof PLAYBOOK_VERSION
  jobId: string
  contentType: ContentType
  region: Region
  indexable: boolean
  target: { canonicalUrl: string; host: string; path: string }
  intent: { primaryQuery: string; reader: string; queryNeed: string; stage: string }
  primaryKeyword: string
  requiredKeywords: ContentSpecKeyword[]
  wordBudget: { min: number; target: number; max: number }
  outline: Array<{ heading: string; level: 2 | 3; purpose: string }>
  requiredSections: string[]
  verifiedEstateLinks: ContentSpecEstateLink[]
  approvedSources: ContentSpecApprovedSource[]
  ymyl: { disclaimerRequired: boolean; statutoryAnchors: string[]; freshnessRequired: boolean }
  aeoGeo: { answerFirst: boolean; faqRequired: boolean; quotableEvidenceRequired: boolean }
  provenance: { plannerRunId?: string; generatedAt: string; sourceHashes: Record<string, string> }
}

export const CONTENT_SPEC_VERSION = PLAYBOOK_VERSION

/** Content types that carry a concrete regional jurisdiction. */
const REGIONAL_TYPES: ReadonlySet<string> = new Set([
  'regional_page',
  'regional_from',
  'regional_university',
])

const KNOWN_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'legal_guide',
  'article',
  'blog_summary',
  'blog_post',
  'news_summary',
  'regional_page',
  'regional_from',
  'regional_university',
  'marketplace_gig',
])

const KNOWN_REGIONS: ReadonlySet<string> = new Set(['us', 'uk', 'ca', 'au', 'global'])

/** Placeholder / obviously invented host fragments. */
const PLACEHOLDER_HOST_RE =
  /(^|\.)(example\.(com|org|net)|your(site|domain)|domain\.(com|tld)|test|localhost|todo|placeholder|insert[-_]?here|example\.[a-z]+)$/i

const PLACEHOLDER_PATH_RE = /(\/|\/\/|^)(todo|tbd|fixme|xxx|placeholder)(\/|$)/i

function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && /^[\w.-]+\.[a-z]{2,}$/i.test(u.hostname) && !PLACEHOLDER_HOST_RE.test(u.hostname)
  } catch {
    return false
  }
}

/** Estate-relative paths (e.g. `/legal/uk-visa`) are valid internal targets. */
function isEstateRelativePath(raw: string): boolean {
  return /^\/[A-Za-z0-9\-._~/]*$/.test(raw) && !raw.includes('//') && !PLACEHOLDER_PATH_RE.test(raw)
}

function isVerifiedEstateLinkUrl(raw: string): boolean {
  return isHttpsUrl(raw) || isEstateRelativePath(raw)
}

function isApprovedSourceUrl(raw: string): boolean {
  return isHttpsUrl(raw)
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/i

/** Structural validation of an explicit provenance/verification evidence record. */
function isValidProvenanceEvidence(
  p: unknown,
): p is { verifiedAt: string; contentHash?: string } {
  if (!p || typeof p !== 'object') return false
  const e = p as { verifiedAt?: unknown; contentHash?: unknown }
  if (typeof e.verifiedAt !== 'string' || Number.isNaN(Date.parse(e.verifiedAt))) return false
  if (e.contentHash !== undefined && (typeof e.contentHash !== 'string' || !SHA256_HEX_RE.test(e.contentHash))) {
    return false
  }
  return true
}

/**
 * Citation context derived from the spec itself: region, contentType-agnostic
 * topic (primary keyword + primary query), and the required keyword phrases.
 * This lets the canonical citable/relevant helpers from officialSources.ts
 * judge a source against this specific job — no arbitrary https URL passes.
 */
function citationContextFromSpec(s: Partial<ContentSpec>): CitationContext {
  const keywords = (s.requiredKeywords || [])
    .map((k) => k?.phrase)
    .filter((p): p is string => typeof p === 'string')
  return {
    region: typeof s.region === 'string' ? s.region : null,
    topic: [s.primaryKeyword, s.intent?.primaryQuery].filter(Boolean).join(' ') || null,
    keywords,
  }
}

/**
 * Validate a ContentSpec before any AI call. Returns the (possibly empty)
 * list of issues; `assertValidContentSpec` throws instead. Rejects
 * unverified links (no link-audit verification evidence), citations that are
 * not canonical official sources under the repository's citation policy
 * (officialSources/citationPolicy) and lack provenance evidence, malformed
 * source records, and incompatible region/type combinations (test matrix §7.3).
 */
export function validateContentSpec(spec: unknown): string[] {
  const issues: string[] = []
  if (!spec || typeof spec !== 'object') return ['spec: not an object']
  const s = spec as Partial<ContentSpec>

  if (s.version !== PLAYBOOK_VERSION) {
    issues.push(`version: expected "${PLAYBOOK_VERSION}", got "${String(s.version)}"`)
  }
  if (!s.jobId || typeof s.jobId !== 'string') issues.push('jobId: missing or empty')
  if (!s.contentType || !KNOWN_CONTENT_TYPES.has(s.contentType)) {
    issues.push(`contentType: unknown content type "${String(s.contentType)}"`)
  }
  if (!s.region || !KNOWN_REGIONS.has(s.region)) {
    issues.push(`region: unknown region "${String(s.region)}"`)
  }
  if (typeof s.indexable !== 'boolean') issues.push('indexable: must be boolean')

  if (s.contentType && REGIONAL_TYPES.has(s.contentType) && s.region === 'global') {
    issues.push(`region/type: "${s.contentType}" requires a concrete region (us/uk/ca/au), not global`)
  }

  const t = s.target
  if (!t || typeof t !== 'object') {
    issues.push('target: missing')
  } else {
    if (!t.canonicalUrl || !isHttpsUrl(t.canonicalUrl)) {
      issues.push('target.canonicalUrl: must be a live https URL')
    }
    if (!t.host || typeof t.host !== 'string' || !/^[a-z0-9.-]+$/i.test(t.host)) {
      issues.push('target.host: missing or malformed')
    }
    if (!t.path || !t.path.startsWith('/') || t.path.includes('//')) {
      issues.push('target.path: must be an absolute site path')
    }
    if (isHttpsUrl(t.canonicalUrl || '') && t.host && t.path) {
      const expected = `https://${t.host}${t.path}`
      if (t.canonicalUrl !== expected && t.canonicalUrl !== `${expected}/`) {
        issues.push('target: canonicalUrl does not match host + path')
      }
    }
  }

  const i = s.intent
  if (!i || typeof i !== 'object') {
    issues.push('intent: missing')
  } else {
    for (const k of ['primaryQuery', 'reader', 'queryNeed', 'stage'] as const) {
      if (!i[k] || typeof i[k] !== 'string') issues.push(`intent.${k}: missing or empty`)
    }
  }

  if (!s.primaryKeyword || typeof s.primaryKeyword !== 'string') {
    issues.push('primaryKeyword: missing or empty')
  }

  const seenKeywords = new Set<string>()
  if (!Array.isArray(s.requiredKeywords)) {
    issues.push('requiredKeywords: missing or not an array')
  } else {
    for (const k of s.requiredKeywords) {
      if (!k || typeof k !== 'object') {
        issues.push('requiredKeywords: malformed keyword record')
        continue
      }
      if (!k.phrase || typeof k.phrase !== 'string') {
        issues.push('requiredKeywords: keyword phrase missing or empty')
        continue
      }
      if (seenKeywords.has(k.phrase.toLowerCase())) {
        issues.push(`requiredKeywords: duplicate phrase "${k.phrase}"`)
      }
      seenKeywords.add(k.phrase.toLowerCase())
      if (k.kind !== 'short' && k.kind !== 'long_tail') {
        issues.push(`requiredKeywords: invalid kind "${String(k.kind)}" for "${k.phrase}"`)
      }
      if (k.optional !== undefined && typeof k.optional !== 'boolean') {
        issues.push(`requiredKeywords: optional must be boolean for "${k.phrase}"`)
      }
    }
  }

  const w = s.wordBudget
  if (!w || typeof w !== 'object') {
    issues.push('wordBudget: missing')
  } else {
    const { min, target, max } = w
    if (!Number.isInteger(min) || !Number.isInteger(target) || !Number.isInteger(max)) {
      issues.push('wordBudget: min/target/max must be integers')
    } else if (min <= 0 || target <= 0 || max <= 0) {
      issues.push('wordBudget: min/target/max must be positive')
    } else if (!(min <= target && target <= max)) {
      issues.push(`wordBudget: requires min ≤ target ≤ max (got ${min}/${target}/${max})`)
    }
  }

  if (!Array.isArray(s.outline)) {
    issues.push('outline: missing or not an array')
  } else {
    for (const o of s.outline) {
      if (!o || typeof o !== 'object' || !o.heading || !o.purpose) {
        issues.push('outline: malformed outline entry (heading/purpose required)')
      } else if (o.level !== 2 && o.level !== 3) {
        issues.push(`outline: level must be 2 or 3 for "${o.heading}"`)
      }
    }
  }

  if (!Array.isArray(s.requiredSections)) {
    issues.push('requiredSections: missing or not an array')
  } else if (new Set(s.requiredSections).size !== s.requiredSections.length) {
    issues.push('requiredSections: duplicate entries')
  }

  if (!Array.isArray(s.verifiedEstateLinks)) {
    issues.push('verifiedEstateLinks: missing or not an array')
  } else {
    const seenLinks = new Set<string>()
    for (const l of s.verifiedEstateLinks) {
      if (!l || typeof l !== 'object') {
        issues.push('verifiedEstateLinks: malformed link record')
        continue
      }
      if (!l.url || !isVerifiedEstateLinkUrl(l.url)) {
        issues.push(`verifiedEstateLinks: unverified or placeholder URL "${String(l.url)}"`)
      }
      // Syntax alone does not prove the URL is in the verified live set: every
      // link must carry an explicit link-audit verification marker, validated
      // structurally. No network calls are performed here.
      if (l.url && l.url && (!l.verification || typeof l.verification !== 'object' || (l.verification as EstateLinkVerification | undefined)?.verifiedBy !== 'link-audit' || !isValidProvenanceEvidence(l.verification))) {
        issues.push(
          `verifiedEstateLinks: missing or invalid link-audit verification evidence for "${String(l.url)}" — syntax alone does not prove the URL is in the verified live set`,
        )
      }
      const v = l.verification
      if (v && typeof v === 'object' && v.verifiedBy === 'link-audit' && isValidProvenanceEvidence(v)) {
        if (v.httpStatus !== undefined && (!Number.isInteger(v.httpStatus) || v.httpStatus < 200 || v.httpStatus > 399)) {
          issues.push(`verifiedEstateLinks: implausible verification httpStatus ${String(v.httpStatus)} for "${l.url}"`)
        }
      }
      if (l.url && seenLinks.has(l.url)) {
        issues.push(`verifiedEstateLinks: duplicate URL "${l.url}"`)
      }
      if (l.url) seenLinks.add(l.url)
      if (!l.anchor || typeof l.anchor !== 'string') {
        issues.push(`verifiedEstateLinks: missing anchor for "${String(l.url)}"`)
      }
      if (l.role !== 'hub' && l.role !== 'related') {
        issues.push(`verifiedEstateLinks: invalid role "${String(l.role)}" for "${String(l.url)}"`)
      }
    }
  }

  if (!Array.isArray(s.approvedSources)) {
    issues.push('approvedSources: missing or not an array')
  } else {
    const ctx = citationContextFromSpec(s)
    const seenSources = new Set<string>()
    for (const src of s.approvedSources) {
      if (!src || typeof src !== 'object') {
        issues.push('approvedSources: malformed source record')
        continue
      }
      if (!src.url || !isApprovedSourceUrl(src.url)) {
        issues.push(`approvedSources: invented, non-https, or placeholder citation "${String(src.url)}"`)
      } else if (isLowValueHost(src.url)) {
        issues.push(`approvedSources: low-value citation host "${String(src.url)}"`)
      } else {
        // Canonical official-source policy: the URL must be citable under the
        // repository's own citation policy for this job's context, OR carry
        // explicit provenance evidence (live link-audit verification with a
        // well-formed marker) when citability cannot be established
        // deterministically without claim context.
        const citable = isCitableSource(src.url, ctx)
        const provValid = src.provenance?.evidence === 'link-audit' && isValidProvenanceEvidence(src.provenance)
        if (!citable && !provValid) {
          issues.push(
            `approvedSources: "${src.url}" is not a canonical official source for this job and carries no provenance evidence`,
          )
        }
      }
      if (src.url && seenSources.has(src.url)) {
        issues.push(`approvedSources: duplicate URL "${src.url}"`)
      }
      if (src.url) seenSources.add(src.url)
      if (!src.publisher || typeof src.publisher !== 'string') {
        issues.push(`approvedSources: missing publisher for "${String(src.url)}"`)
      }
      if (!src.purpose || typeof src.purpose !== 'string') {
        issues.push(`approvedSources: missing purpose for "${String(src.url)}"`)
      }
      if (src.jurisdiction !== undefined && !KNOWN_REGIONS.has(src.jurisdiction as Region)) {
        issues.push(`approvedSources: unknown jurisdiction "${String(src.jurisdiction)}"`)
      }
    }
  }

  const y = s.ymyl
  if (!y || typeof y !== 'object') {
    issues.push('ymyl: missing')
  } else {
    if (typeof y.disclaimerRequired !== 'boolean') issues.push('ymyl.disclaimerRequired: must be boolean')
    if (typeof y.freshnessRequired !== 'boolean') issues.push('ymyl.freshnessRequired: must be boolean')
    if (!Array.isArray(y.statutoryAnchors)) issues.push('ymyl.statutoryAnchors: missing or not an array')
  }

  const a = s.aeoGeo
  if (!a || typeof a !== 'object') {
    issues.push('aeoGeo: missing')
  } else {
    for (const k of ['answerFirst', 'faqRequired', 'quotableEvidenceRequired'] as const) {
      if (typeof a[k] !== 'boolean') issues.push(`aeoGeo.${k}: must be boolean`)
    }
  }

  const p = s.provenance
  if (!p || typeof p !== 'object') {
    issues.push('provenance: missing')
  } else {
    if (!p.generatedAt || Number.isNaN(Date.parse(p.generatedAt))) {
      issues.push('provenance.generatedAt: missing or not an ISO-8601 date')
    }
    if (p.plannerRunId !== undefined && (!p.plannerRunId || typeof p.plannerRunId !== 'string')) {
      issues.push('provenance.plannerRunId: must be a non-empty string when present')
    }
    if (!p.sourceHashes || typeof p.sourceHashes !== 'object' || Array.isArray(p.sourceHashes)) {
      issues.push('provenance.sourceHashes: missing or not a record')
    } else {
      for (const [k, v] of Object.entries(p.sourceHashes)) {
        if (!k || typeof v !== 'string' || !v) issues.push(`provenance.sourceHashes: malformed entry "${k}"`)
      }
    }
  }

  return issues
}

/** Throw on any validation issue — use before generation and before audits. */
export function assertValidContentSpec(spec: unknown): asserts spec is ContentSpec {
  const issues = validateContentSpec(spec)
  if (issues.length) {
    throw new Error(`content spec validation failed:\n- ${issues.join('\n- ')}`)
  }
}

export type CreateContentSpecInput = {
  jobId: string
  contentType: ContentType
  region: Region
  indexable: boolean
  target: { canonicalUrl: string; host: string; path: string }
  intent: ContentSpec['intent']
  primaryKeyword: string
  requiredKeywords: ContentSpecKeyword[]
  outline?: ContentSpec['outline']
  requiredSections?: string[]
  verifiedEstateLinks?: ContentSpecEstateLink[]
  approvedSources?: ContentSpecApprovedSource[]
  ymyl?: Partial<ContentSpec['ymyl']>
  aeoGeo?: Partial<ContentSpec['aeoGeo']>
  plannerRunId?: string
  sourceHashes?: Record<string, string>
  /** Explicit word budget; derived from contentDepth for the type when omitted. */
  wordBudget?: { min: number; target: number; max: number }
  generatedAt?: string
}

/**
 * Resolve one immutable ContentSpec. The word budget defaults to the
 * canonical contentDepth values for the content type so brief, writer,
 * reviewer, and ship all share the same floor/target/max.
 */
export function createContentSpec(input: CreateContentSpecInput): ContentSpec {
  const depth = depthSpecForType(input.contentType)
  const spec: ContentSpec = {
    version: PLAYBOOK_VERSION,
    jobId: input.jobId,
    contentType: input.contentType,
    region: input.region,
    indexable: input.indexable,
    target: input.target,
    intent: input.intent,
    primaryKeyword: input.primaryKeyword,
    requiredKeywords: input.requiredKeywords,
    wordBudget: input.wordBudget ?? {
      min: depth.minWords,
      target: depth.targetWords,
      max: depth.maxWords,
    },
    outline: input.outline ?? [],
    requiredSections: input.requiredSections ?? [],
    verifiedEstateLinks: input.verifiedEstateLinks ?? [],
    approvedSources: input.approvedSources ?? [],
    ymyl: {
      disclaimerRequired: input.ymyl?.disclaimerRequired ?? input.indexable,
      statutoryAnchors: input.ymyl?.statutoryAnchors ?? [],
      freshnessRequired: input.ymyl?.freshnessRequired ?? false,
    },
    aeoGeo: {
      answerFirst: input.aeoGeo?.answerFirst ?? input.indexable,
      faqRequired: input.aeoGeo?.faqRequired ?? input.indexable,
      quotableEvidenceRequired: input.aeoGeo?.quotableEvidenceRequired ?? false,
    },
    provenance: {
      plannerRunId: input.plannerRunId,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      sourceHashes: input.sourceHashes ?? {},
    },
  }
  assertValidContentSpec(spec)
  return spec
}

// ── Milestone B: pipeline wiring helpers ────────────────────────────────────
//
// Safe boundary adapters. A missing or invalid snapshot yields `null` so the
// pre-spec pipeline behavior is preserved; a present snapshot is validated
// and never silently repaired or weakened.

const KNOWN_SPEC_REGIONS: Record<string, Region> = {
  us: 'us', uk: 'uk', ca: 'ca', au: 'au',
}

/** Normalize a pipeline region string ('US', 'uk', …) to a spec Region. */
export function normalizeRegionForSpec(region: string | undefined | null): Region {
  return KNOWN_SPEC_REGIONS[String(region || '').toLowerCase()] || 'global'
}

/** Canonical JSON snapshot — the exact bytes persisted and passed to stages. */
export function serializeContentSpec(spec: ContentSpec): string {
  return JSON.stringify(spec)
}

/**
 * Validate a persisted spec snapshot (e.g. `audit_json.contentSpec`) without
 * weakening anything: returns the parsed snapshot only when it validates;
 * `null` otherwise, so legacy jobs keep their existing behavior.
 */
export function reviveContentSpec(snapshot: unknown): ContentSpec | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  try {
    const parsed = typeof snapshot === 'string' ? (JSON.parse(snapshot) as unknown) : snapshot
    if (validateContentSpec(parsed).length) return null
    return parsed as ContentSpec
  } catch {
    return null
  }
}

export type ResolveContentSpecArgs = {
  jobId: string
  contentType: string
  region: string | undefined
  indexable: boolean
  canonicalUrl: string
  primaryKeyword: string
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  /** Live-verified official citation URLs (from assembleDraftSourceAllowlist). */
  verifiedSourceUrls?: string[]
  outline?: string[]
  audience?: string
  topic?: string
  minWords?: number
  targetWords?: number
  maxWords?: number
  plannerRunId?: string
}

export type ContentSpecResolution =
  | { spec: ContentSpec; reason?: undefined; issues?: undefined }
  | { spec: null; reason: string; issues?: string[] }

/**
 * Resolve ONE ContentSpec per job at planning/brief start. Fails closed and
 * safe: any validation issue returns `{ spec: null }` with the reason so the
 * caller keeps its existing (spec-less) behavior — an absent spec must never
 * weaken the pipeline, and an invalid spec is never silently repaired.
 */
export function resolveContentSpecForJob(args: ResolveContentSpecArgs): ContentSpecResolution {
  if (!args.canonicalUrl || !args.primaryKeyword || !args.contentType) {
    return { spec: null, reason: 'missing canonicalUrl, contentType, or primaryKeyword' }
  }
  let host = ''
  let path = ''
  try {
    const u = new URL(args.canonicalUrl)
    host = u.hostname
    path = u.pathname || '/'
  } catch {
    return { spec: null, reason: `canonicalUrl is not a URL: "${args.canonicalUrl}"` }
  }
  const requiredKeywords: ContentSpecKeyword[] = [
    ...(args.requiredShortKeywords || []).map((phrase) => ({ phrase, kind: 'short' as const })),
    ...(args.requiredLongTailKeywords || []).map((phrase) => ({ phrase, kind: 'long_tail' as const })),
  ]
  const now = new Date().toISOString()
  const approvedSources: ContentSpecApprovedSource[] = (args.verifiedSourceUrls || []).map((url) => ({
    url,
    publisher: (() => {
      try {
        return new URL(url).hostname
      } catch {
        return url
      }
    })(),
    jurisdiction: normalizeRegionForSpec(args.region),
    purpose: 'official citation live-verified by link-audit for this job',
    provenance: { evidence: 'link-audit', verifiedAt: now },
  }))
  try {
    const spec = createContentSpec({
      jobId: args.jobId,
      contentType: args.contentType as ContentType,
      region: normalizeRegionForSpec(args.region),
      indexable: args.indexable,
      target: { canonicalUrl: args.canonicalUrl, host, path },
      intent: {
        primaryQuery: args.primaryKeyword,
        reader: args.audience || 'people navigating the immigration process',
        queryNeed: args.topic || args.primaryKeyword,
        stage: 'consideration',
      },
      primaryKeyword: args.primaryKeyword,
      requiredKeywords,
      ...(args.minWords && args.targetWords && args.maxWords
        ? {
            wordBudget: {
              min: args.minWords,
              target: args.targetWords,
              max: args.maxWords,
            },
          }
        : {}),
      outline: (args.outline || []).map((heading) => ({ heading, level: 2 as const, purpose: 'planner outline' })),
      requiredSections: args.outline || [],
      // Estate links only ever enter a spec with explicit link-audit
      // verification evidence; planning-time radar interlinks carry none, so
      // the spec starts empty here (Milestone B limitation).
      verifiedEstateLinks: [],
      approvedSources,
      ymyl: { disclaimerRequired: args.indexable, statutoryAnchors: [], freshnessRequired: false },
      aeoGeo: { answerFirst: args.indexable, faqRequired: args.indexable, quotableEvidenceRequired: false },
      plannerRunId: args.plannerRunId,
      generatedAt: now,
    })
    return { spec }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { spec: null, reason: 'content spec validation failed', issues: message.split('\n').slice(1) }
  }
}
