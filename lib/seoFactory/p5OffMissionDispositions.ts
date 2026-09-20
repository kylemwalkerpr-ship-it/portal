/**
 * P5 off-mission disposition contract — durable, versioned record of what the
 * estate deliberately does with the highest-impression off-mission URLs.
 *
 * Why this exists
 * ---------------
 * P1 separated RAW/off-mission visibility from QUALIFIED visibility so
 * campus-lifestyle demand stays measurable without becoming a mission. P5 adds
 * the missing half: an explicit, reviewable DISPOSITION for the URLs that carry
 * that demand, plus a fail-closed gate that keeps automated index-coverage /
 * site-health mutation away from them.
 *
 * Design constraints (supervisor decision, 2026-09-20):
 *   · the strategic vocabulary is the EXISTING one from the program design
 *     (`docs/superpowers/specs/2026-09-15-seo-cleanup-expansion-parity-design.md`
 *     §7.2): KEEP | KEEP_BUT_SILO | MOVE | MERGE_301 | NOINDEX | RETIRE.
 *     No competing vocabulary is introduced here.
 *   · KEEP_BUT_SILO means: retain the useful page in its CURRENT live state.
 *     It stays observable in raw/off-mission measurement but is non-mission and
 *     non-actionable. No redirect, noindex, canonical change, retirement, or
 *     automatic internal-authority expansion from P5 evidence alone.
 *   · evidence is persisted GSC rows for one explicit window. Values the audit
 *     did not measure stay `null` (UNKNOWN) — never coerced to 0, which would
 *     read as a measured zero.
 *
 * The registry is a committed JSON data file (`data/seo/`, mirrored byte-identical
 * into `public/seo-data/` like the ownership registry) and it is STATIC-imported.
 * That is deliberate: this is a fail-closed runtime gate, so it must not depend
 * on a fetch that could be unavailable (a failed fetch must never mean "allow").
 *
 * Nothing in this module performs a mutation. It only reports the contract.
 */

import registryFile from '../../data/seo/p5-off-mission-dispositions.json'

/** Closed strategic-disposition vocabulary (program design §7.2). */
export const STRATEGIC_DISPOSITIONS = [
  'KEEP',
  'KEEP_BUT_SILO',
  'MOVE',
  'MERGE_301',
  'NOINDEX',
  'RETIRE',
] as const

export type StrategicDisposition = (typeof STRATEGIC_DISPOSITIONS)[number]

const STRATEGIC_DISPOSITION_SET: ReadonlySet<string> = new Set(STRATEGIC_DISPOSITIONS)

export function isStrategicDisposition(value: unknown): value is StrategicDisposition {
  return STRATEGIC_DISPOSITION_SET.has(String(value || ''))
}

export interface P5EvidenceWindow {
  start: string
  end: string
}

/** Unknown-by-contract observation fields: `null` means UNKNOWN, never 0. */
export interface P5QualifiedDemand {
  impressions: number | null
  rows: number | null
  clicks: number | null
}

export interface P5LiveObservations {
  httpStatus: number | null
  inSitemap: boolean | null
  robotsState: string | null
  ownershipRegistryRowId: number | null
  observedAt: string | null
}

export interface P5Permits {
  redirect: boolean
  noindex: boolean
  canonicalChange: boolean
  retire: boolean
  automatedIndexCoverageMutation: boolean
  internalAuthorityExpansion: boolean
}

export interface P5OffMissionEntry {
  url: string
  disposition: StrategicDisposition
  cohortId: string
  evidenceWindow: P5EvidenceWindow
  offMissionImpressions: number | null
  offMissionRows: number | null
  offMissionClicks: number | null
  qualifiedDemand: P5QualifiedDemand
  liveObservations: P5LiveObservations
  permits: P5Permits
  unknownReason: string
  basis: string
  notes: string
}

export interface P5OffMissionEvidence {
  source: string
  siteUrl: string
  window: P5EvidenceWindow
  persistedSyncAt: string
  persistedWindowRows: number
  cohortRule: string
  cohortId: string
  cohortUrlCount: number
  offMissionTotals: { impressions: number; rows: number; urls: number; clicks: number }
  perUrlOffMissionSplit: unknown | null
  perUrlOffMissionSplitReason: string
  knownLimitations: string[]
}

export interface P5OffMissionRegistryFile {
  version: string
  program: string
  plan: string
  capturedAt: string
  evidence: P5OffMissionEvidence
  entries: P5OffMissionEntry[]
}

export const P5_OFF_MISSION_REGISTRY = registryFile as unknown as P5OffMissionRegistryFile
export const P5_OFF_MISSION_VERSION = P5_OFF_MISSION_REGISTRY.version

/**
 * Deterministic URL normalization for registry lookups.
 *
 * Rules (all deterministic, all documented so a reviewer can predict them):
 *   · trim; require an absolute http(s) URL — anything else is un-matchable
 *   · lowercase the HOST (hosts are case-insensitive) and drop a leading
 *     `www.`; the PATH keeps its case because URL paths are case-sensitive
 *     per RFC 3986, so normalization can never merge two different pages
 *   · http and https normalize to the same canonical `https://` key, so a
 *     scheme variant of a registered URL cannot slip past the gate
 *   · drop default ports (80/443), drop query/hash (the disposition is about
 *     the page, and tracker parameters must not defeat the gate)
 *   · collapse duplicate path slashes and require the site's trailing-slash
 *     form for non-root paths
 *
 * Returns `null` for un-matchable input, so callers can distinguish
 * "not registered" from "could not normalize".
 */
export function normalizeP5Url(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  const protocol = parsed.protocol.toLowerCase()
  if (protocol !== 'https:' && protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (!host) return null
  const port = parsed.port && parsed.port !== '80' && parsed.port !== '443' ? `:${parsed.port}` : ''
  let path = (parsed.pathname || '/').replace(/\/{2,}/g, '/')
  if (path.length > 1) path = `${path.replace(/\/+$/, '')}/`
  if (!path.startsWith('/')) path = `/${path}`
  return `https://${host}${port}${path}`
}

/** Registry keyed by normalized URL (module scope — the file is static). */
const P5_ENTRIES_BY_KEY: ReadonlyMap<string, P5OffMissionEntry> = (() => {
  const map = new Map<string, P5OffMissionEntry>()
  for (const entry of P5_OFF_MISSION_REGISTRY.entries || []) {
    const key = normalizeP5Url(entry?.url)
    if (key) map.set(key, entry)
  }
  return map
})()

/**
 * Registry lookup. Matches the normalized key first, then falls back to an
 * exact trimmed-string match so a registry entry that fails normalization can
 * still never be silently treated as "not registered".
 */
export function p5DispositionEntry(rawUrl: unknown): P5OffMissionEntry | null {
  const key = normalizeP5Url(rawUrl)
  if (key) {
    const hit = P5_ENTRIES_BY_KEY.get(key)
    if (hit) return hit
  }
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!value) return null
  return P5_OFF_MISSION_REGISTRY.entries.find((entry) => entry.url.trim() === value) || null
}

export function p5DispositionForUrl(rawUrl: unknown): StrategicDisposition | null {
  return p5DispositionEntry(rawUrl)?.disposition ?? null
}

export interface P5MutationVerdict {
  /** True when the URL is covered by the P5 registry at all. */
  registered: boolean
  disposition: StrategicDisposition | null
  /** True when automated index-coverage / site-health mutation must not run. */
  blocked: boolean
  /** Explicit P5 disposition reason — present exactly when `blocked`. */
  reason: string | null
}

/**
 * Fail-closed verdict for automated index-coverage / site-health mutation.
 *
 * Unregistered URLs are untouched by construction (`registered: false`,
 * `blocked: false`) — the P5 registry can only ever narrow behavior for the
 * URLs it explicitly names.
 *
 * A registered URL is blocked unless its disposition is `KEEP`. Every other
 * strategic disposition — KEEP_BUT_SILO, MOVE, MERGE_301, NOINDEX, RETIRE, and
 * any unrecognized value — refuses automated mutation, because the automated
 * fix set (remove noindex / write canonical / robots.txt edit / orphan link /
 * sitemap sync) would contradict the recorded intent.
 */
export function p5MutationVerdict(rawUrl: unknown): P5MutationVerdict {
  const entry = p5DispositionEntry(rawUrl)
  if (!entry) return { registered: false, disposition: null, blocked: false, reason: null }
  const disposition = isStrategicDisposition(entry.disposition) ? entry.disposition : null
  if (entry.disposition === 'KEEP') {
    return { registered: true, disposition: 'KEEP', blocked: false, reason: null }
  }
  const window = P5_OFF_MISSION_REGISTRY.evidence?.window
  const label = disposition || `UNRECOGNIZED(${String(entry.disposition)})`
  return {
    registered: true,
    disposition,
    blocked: true,
    reason:
      `P5 disposition ${label} — automated index-coverage/site-health mutation is ` +
      `fail-closed for registered P5 URLs (registry ${P5_OFF_MISSION_VERSION}, window ` +
      `${window?.start || 'UNKNOWN'} → ${window?.end || 'UNKNOWN'})`,
  }
}

/** Convenience: does this URL's P5 disposition block automated mutation? */
export function p5MutationBlocked(rawUrl: unknown): boolean {
  return p5MutationVerdict(rawUrl).blocked
}

/**
 * Normalized keys of every registered URL — the protection set a delegated
 * site-health repair must exclude (no orphan link injection, no sitemap entry)
 * so a repo-wide automated repair cannot silently re-expand a siloed page.
 */
export function p5ProtectedUrlKeys(
  file: P5OffMissionRegistryFile = P5_OFF_MISSION_REGISTRY,
): string[] {
  const out: string[] = []
  for (const entry of file.entries || []) {
    const key = normalizeP5Url(entry?.url)
    if (key) out.push(key)
  }
  return [...new Set(out)]
}

/**
 * Registry self-check (no network, no mutation). Returns a list of problems;
 * an empty array means the contract is well-formed. Used by the P5 regression
 * suite and safe to call from operational tooling.
 */
export function validateP5Registry(
  file: P5OffMissionRegistryFile = P5_OFF_MISSION_REGISTRY,
): string[] {
  const problems: string[] = []
  const push = (message: string) => problems.push(message)

  if (!file || typeof file !== 'object') return ['registry is not an object']
  if (typeof file.version !== 'string' || !file.version.trim()) push('version is missing')
  if (Number.isNaN(Date.parse(String(file.capturedAt)))) push('capturedAt is not a parseable timestamp')

  const evidence = file.evidence
  if (!evidence) push('evidence block is missing')
  else {
    if (!evidence.window?.start || !evidence.window?.end) push('evidence window is missing')
    else if (evidence.window.start > evidence.window.end) push('evidence window is inverted')
    if (Number.isNaN(Date.parse(String(evidence.persistedSyncAt)))) {
      push('evidence.persistedSyncAt is not a parseable timestamp')
    }
    if (!String(evidence.cohortRule || '').trim()) push('evidence.cohortRule is missing')
    if (!String(evidence.cohortId || '').trim()) push('evidence.cohortId is missing')
    if (!(evidence.knownLimitations || []).length) push('evidence.knownLimitations is empty')
    if (evidence.perUrlOffMissionSplit != null && !String(evidence.perUrlOffMissionSplitReason || '').trim()) {
      push('per-URL off-mission split is present without provenance')
    }
  }

  if (!Array.isArray(file.entries) || !file.entries.length) {
    push('entries is empty')
    return problems
  }
  if (evidence && file.entries.length !== evidence.cohortUrlCount) {
    push(`entries ${file.entries.length} != evidence.cohortUrlCount ${evidence.cohortUrlCount}`)
  }

  const seen = new Set<string>()
  const nullableNumber = (value: unknown, field: string) => {
    if (value === null || value === undefined) return
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      push(`${field} must be null (UNKNOWN) or a non-negative finite number`)
    }
  }

  for (const entry of file.entries) {
    const url = String(entry?.url || '')
    const key = normalizeP5Url(url)
    if (!key) push(`entry URL does not normalize: ${url || '(missing)'}`)
    else {
      if (key !== url) push(`entry URL is not in canonical normalized form: ${url} -> ${key}`)
      if (seen.has(key)) push(`duplicate entry URL: ${key}`)
      seen.add(key)
    }
    if (!isStrategicDisposition(entry?.disposition)) {
      push(`entry ${url} uses a disposition outside the strategic vocabulary: ${String(entry?.disposition)}`)
    }
    if (!String(entry?.cohortId || '').trim()) push(`entry ${url} has no cohortId`)
    if (!entry?.evidenceWindow?.start || !entry?.evidenceWindow?.end) {
      push(`entry ${url} has no evidence window`)
    } else if (
      evidence?.window &&
      (entry.evidenceWindow.start !== evidence.window.start ||
        entry.evidenceWindow.end !== evidence.window.end)
    ) {
      push(`entry ${url} window does not match the registry evidence window`)
    }

    nullableNumber(entry?.offMissionImpressions, `entry ${url} offMissionImpressions`)
    nullableNumber(entry?.offMissionRows, `entry ${url} offMissionRows`)
    nullableNumber(entry?.offMissionClicks, `entry ${url} offMissionClicks`)
    nullableNumber(entry?.qualifiedDemand?.impressions, `entry ${url} qualifiedDemand.impressions`)
    nullableNumber(entry?.qualifiedDemand?.rows, `entry ${url} qualifiedDemand.rows`)
    nullableNumber(entry?.qualifiedDemand?.clicks, `entry ${url} qualifiedDemand.clicks`)

    const live = entry?.liveObservations
    for (const field of [
      'httpStatus',
      'inSitemap',
      'robotsState',
      'ownershipRegistryRowId',
      'observedAt',
    ]) {
      if (!live || !(field in live)) {
        push(`entry ${url} liveObservations.${field} is missing (use null for UNKNOWN)`)
      }
    }

    const hasUnknown =
      entry?.offMissionImpressions == null ||
      entry?.offMissionRows == null ||
      entry?.offMissionClicks == null ||
      entry?.qualifiedDemand?.impressions == null ||
      entry?.liveObservations?.httpStatus == null ||
      entry?.liveObservations?.inSitemap == null
    if (hasUnknown && !String(entry?.unknownReason || '').trim()) {
      push(`entry ${url} has UNKNOWN evidence but no unknownReason`)
    }

    if (isStrategicDisposition(entry?.disposition) && entry.disposition !== 'KEEP') {
      if (entry?.permits?.automatedIndexCoverageMutation !== false) {
        push(`entry ${url} (${entry.disposition}) must not permit automated index-coverage mutation`)
      }
    }
  }

  return problems
}
