/**
 * P4 destructive cannibalization decision contract — pure and fail-closed.
 *
 * A redirect/noindex consolidation may only run when a complete evidence record
 * proves that two or more competing pages share an *exact qualified* GSC query,
 * that the winner is the authoritative P3 owner of the intent, and that the
 * operator recorded rollback evidence for every file the executor will touch.
 *
 * Deliberate rules:
 *  - Missing/unavailable metrics are never coerced to zero and never qualify:
 *    null, undefined, NaN, and 0 all fail the real-evidence checks.
 *  - Impressions alone never select a winner; the winner must equal the P3
 *    authoritative owner row (status=confirmed, action in keep|expand|merge).
 *  - Unrelated loser sets (the historical Canada-spouse over-expansion) fail on
 *    identity separation and on the exact-qualified-query-overlap requirement.
 */

import { createHash } from 'node:crypto'
import {
  filePathFromOwnerUrl,
  hostFromUrl,
  HOST_REPO,
  isAuthoritativeOwnershipRow,
  type ContentRepo,
  type OwnerHost,
  type OwnershipRow,
} from './ownership'
import { isJunkQuery, isQualifiedGscDemandQuery } from './queryNoise'

export type CannibalEvidenceSource = 'gsc_live' | 'persisted_qualified_gsc'
export type CannibalLoserActionKind = 'redirect_301' | 'noindex_canonical'

/** A single destructive review PR stays small enough for a human to audit. */
export const MAX_P4_LOSERS = 5

const DESTRUCTIVE_LOSER_HOSTS: ReadonlySet<OwnerHost> = new Set<OwnerHost>([
  'legal',
  'usa',
  'uk',
  'ca',
  'au',
])

export interface CannibalQueryEvidence {
  query: string
  impressions: number
  clicks: number
  position: number
}

export interface CannibalCompetitorEvidence {
  url: string
  impressions: number
  clicks: number
  position: number
  primaryIntent: string
  sharedQueries: CannibalQueryEvidence[]
}

export interface CannibalDecisionRecord {
  clusterId: string
  term: string
  evidenceSource: CannibalEvidenceSource
  evidenceWindow: { startDate: string; endDate: string; capturedAt: string }
  evidenceHash: string
  competitors: CannibalCompetitorEvidence[]
  primaryIntentComparison: string
  authoritativeOwner: {
    registryRowId: number
    ownerUrl: string
    status: string
    action: string
    intentClass: string
  }
  winnerUrl: string
  backlinks: { status: 'known' | 'unknown'; count?: number; note?: string }
  internalLinks: { status: 'known' | 'unknown'; count?: number; note?: string }
  loserActions: Array<{ url: string; action: CannibalLoserActionKind; target: string }>
  rollback: {
    files: Array<{ repo: string; path: string; sha: string }>
    restoreInstructions: string
  }
  decidedBy: string
  decidedAt: string
}

export interface CannibalDecisionValidation {
  ok: boolean
  blockers: string[]
  ownerRow: OwnershipRow | null
}

/**
 * Authoritative P3 ownership rows that claim one of the competing URLs —
 * either as the row's own `owner_url` or as one of its `supporting_urls`.
 *
 * A destructive consolidation is only allowed when EXACTLY ONE authoritative
 * row applies to the competing set: zero matches means no P3 mandate exists,
 * several matches means the authority itself is contested. Both fail closed.
 */
export function p3AuthorityRowsForCompetingUrls(
  competitorUrls: Iterable<string>,
  registryRows: OwnershipRow[],
): OwnershipRow[] {
  const urls = new Set<string>()
  for (const url of competitorUrls) {
    const normalized = normalizeCannibalUrl(url)
    if (normalized) urls.add(normalized)
  }
  if (urls.size === 0) return []
  return (registryRows || []).filter((row) => {
    if (!isAuthoritativeOwnershipRow(row)) return false
    if (urls.has(normalizeCannibalUrl(row.owner_url))) return true
    const supporting = Array.isArray(row.supporting_urls) ? row.supporting_urls : []
    return supporting.some((url) => urls.has(normalizeCannibalUrl(String(url || ''))))
  })
}

/** Sentinel rollback sha for a file that must not exist before the PR. */
export const ABSENT_FILE_SHA = 'absent'
const FULL_SHA_RE = /^[a-f0-9]{40}$/
const NON_HUMAN_OPERATORS = new Set(['auto', 'automation', 'system', 'anonymous', 'sweep'])

export interface CannibalRedirectTarget {
  host: OwnerHost
  repo: ContentRepo
  kind: 'redirect'
  file: string
}
export interface CannibalNoindexTarget {
  host: OwnerHost
  repo: ContentRepo
  kind: 'noindex'
  path: string
}
export type CannibalLoserTarget = CannibalRedirectTarget | CannibalNoindexTarget

/** Redirect convention for a host, or null when the host has no such file. */
export function cannibalRedirectFileForHost(host: OwnerHost): string | null {
  if (host === 'legal') return 'public/_redirects'
  if (host === 'usa' || host === 'uk' || host === 'ca' || host === 'au') {
    return `${host}/public/_redirects`
  }
  return null
}

/**
 * Frontmatter source for a regional page, or null when the URL has no editable
 * markdown/mdx source (caseworks routes are page.tsx, so a legal loser can only
 * be redirected — never "noindexed" by editing a file that isn't there).
 */
export function cannibalContentPathFor(host: OwnerHost, url: string): string | null {
  if (host === 'legal') return null
  const mapped = filePathFromOwnerUrl(url, host)
  if (!mapped) return null
  return /\.mdx?$/.test(mapped.filePath) ? mapped.filePath : null
}

/**
 * Pure planning target for a destructive loser action. Returns null when the
 * action cannot be represented as a repo change — the executor fails closed
 * rather than inventing a write.
 */
export function cannibalLoserTarget(
  url: string,
  action: CannibalLoserActionKind,
): CannibalLoserTarget | null {
  const host = hostFromUrl(url)
  if (!host || !DESTRUCTIVE_LOSER_HOSTS.has(host)) return null
  const repo = HOST_REPO[host]
  if (action === 'redirect_301') {
    const file = cannibalRedirectFileForHost(host)
    return file ? { host, repo, kind: 'redirect', file } : null
  }
  const path = cannibalContentPathFor(host, url)
  return path ? { host, repo, kind: 'noindex', path } : null
}

export function normalizeCannibalUrl(value: string): string {
  try {
    const u = new URL(String(value || '').trim())
    u.hash = ''
    return u.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(String(value || '')))
}

/** True only for a real, finite metric. null/undefined/NaN are unavailable. */
function isMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function identity(text: string): string {
  const t = String(text || '').toLowerCase()
  if (/\bi[- ]?485\b|adjustment of status/.test(t)) return 'us_i485'
  if (/\b(subclass\s*)?485\b|temporary graduate|post[- ]study work/.test(t)) return 'au_485'
  if (/\bstem\s+opt\b|i-983/.test(t)) return 'us_stem_opt'
  if (/\boptional practical training\b|\bopt\b/.test(t)) return 'us_opt'
  if (/\bf[- ]?1\b|sevis|\bcpt\b/.test(t)) return 'us_f1'
  if (/express entry/.test(t) && /document checklist|documents? checklist|checklist/.test(t)) return 'ca_express_entry_checklist'
  if (/\bcrs\b|comprehensive ranking system|stem category|category draw|draw cut[- ]?off|draw results?|express entry draw/.test(t)) return 'ca_express_entry_draws'
  if (/federal skilled worker/.test(t)) return 'ca_express_entry_fsw'
  if (/express entry/.test(t)) return 'ca_express_entry_general'
  if (/skilled worker/.test(t)) return 'uk_skilled_worker'
  if (/graduate (visa|route)/.test(t)) return 'uk_graduate'
  if (/student visa/.test(t) && /\buk\b|united kingdom/.test(t)) return 'uk_student'
  return 'other'
}

/**
 * Identity compatibility. `other` is permissive (an unrecognised intent is not
 * proof of a conflict) but two *different* known identities never merge — the
 * AU subclass 485 / US I-485 pair is the canonical trap this protects. The
 * F-1/CPT/OPT/STEM family stays one intent family on purpose.
 */
export function sameCannibalIdentity(a: string, b: string): boolean {
  const x = identity(a)
  const y = identity(b)
  if (x === 'other' || y === 'other') return true
  if (x === y) return true
  const f1Family = new Set(['us_f1', 'us_opt', 'us_stem_opt'])
  return f1Family.has(x) && f1Family.has(y)
}

/** Canonical, order-insensitive evidence payload that the hash covers. */
export function canonicalCannibalEvidence(decision: CannibalDecisionRecord): string {
  const query = (q: CannibalQueryEvidence) => ({
    query: String(q?.query || '').trim().toLowerCase(),
    impressions: q?.impressions ?? null,
    clicks: q?.clicks ?? null,
    position: q?.position ?? null,
  })
  return JSON.stringify({
    clusterId: String(decision.clusterId || '').trim(),
    term: String(decision.term || '').trim().toLowerCase(),
    evidenceSource: decision.evidenceSource,
    evidenceWindow: {
      startDate: decision.evidenceWindow?.startDate ?? null,
      endDate: decision.evidenceWindow?.endDate ?? null,
      capturedAt: decision.evidenceWindow?.capturedAt ?? null,
    },
    competitors: (decision.competitors || [])
      .map((competitor) => ({
        url: normalizeCannibalUrl(competitor.url),
        impressions: competitor.impressions ?? null,
        clicks: competitor.clicks ?? null,
        position: competitor.position ?? null,
        primaryIntent: String(competitor.primaryIntent || '').trim(),
        sharedQueries: [...(competitor.sharedQueries || [])]
          .map(query)
          .sort((a, b) => a.query.localeCompare(b.query)),
      }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    primaryIntentComparison: String(decision.primaryIntentComparison || '').trim(),
    authoritativeOwner: {
      registryRowId: decision.authoritativeOwner?.registryRowId ?? null,
      ownerUrl: normalizeCannibalUrl(decision.authoritativeOwner?.ownerUrl || ''),
      status: decision.authoritativeOwner?.status ?? null,
      action: decision.authoritativeOwner?.action ?? null,
      intentClass: decision.authoritativeOwner?.intentClass ?? null,
    },
    winnerUrl: normalizeCannibalUrl(decision.winnerUrl),
    backlinks: decision.backlinks ?? null,
    internalLinks: decision.internalLinks ?? null,
    loserActions: [...(decision.loserActions || [])]
      .map((action) => ({
        url: normalizeCannibalUrl(action?.url),
        action: action?.action ?? null,
        target: normalizeCannibalUrl(action?.target || ''),
      }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    rollback: {
      files: [...(decision.rollback?.files || [])]
        .map((file) => ({ repo: file?.repo ?? null, path: file?.path ?? null, sha: file?.sha ?? null }))
        .sort((a, b) => `${a.repo}:${a.path}`.localeCompare(`${b.repo}:${b.path}`)),
      restoreInstructions: String(decision.rollback?.restoreInstructions || '').trim(),
    },
    decidedBy: String(decision.decidedBy || '').trim(),
    decidedAt: String(decision.decidedAt || '').trim(),
  })
}

export function computeCannibalEvidenceHash(decision: CannibalDecisionRecord): string {
  return createHash('sha256').update(canonicalCannibalEvidence(decision)).digest('hex')
}

export function validateCannibalDecision(
  decision: CannibalDecisionRecord | null | undefined,
  registryRows: OwnershipRow[],
): CannibalDecisionValidation {
  const blockers: string[] = []
  if (!decision || typeof decision !== 'object') {
    return { ok: false, blockers: ['decision_required'], ownerRow: null }
  }
  if (!String(decision.clusterId || '').trim()) blockers.push('cluster_id_required')
  const term = String(decision.term || '').trim()
  if (!term) blockers.push('term_required')
  else if (isJunkQuery(term)) blockers.push('term_not_actionable')
  if (!['gsc_live', 'persisted_qualified_gsc'].includes(String(decision.evidenceSource))) {
    blockers.push('qualified_gsc_evidence_required')
  }
  const window = decision.evidenceWindow
  if (!window || !isIsoDate(window.startDate) || !isIsoDate(window.endDate) || !isIsoDate(window.capturedAt)) {
    blockers.push('evidence_window_required')
  } else {
    const start = Date.parse(window.startDate)
    const end = Date.parse(window.endDate)
    const captured = Date.parse(window.capturedAt)
    if (end < start) blockers.push('evidence_window_inverted')
    // Captured after the window closed (GSC sync lag), never before it opened,
    // and never more than 30 days detached from the window it claims to cover.
    if (captured < start || captured - end > 30 * 86_400_000) {
      blockers.push('evidence_window_capture_out_of_range')
    }
    if (isIsoDate(decision.decidedAt) && captured > Date.parse(decision.decidedAt) + 3_600_000) {
      blockers.push('evidence_captured_after_decision')
    }
  }
  const hash = String(decision.evidenceHash || '')
  if (!/^[a-f0-9]{16,}$/i.test(hash)) blockers.push('evidence_hash_required')
  else if (hash.toLowerCase() !== computeCannibalEvidenceHash(decision)) blockers.push('evidence_hash_mismatch')

  const competitors = Array.isArray(decision.competitors) ? decision.competitors : []
  if (competitors.length < 2) blockers.push('at_least_two_competitors_required')
  const winner = normalizeCannibalUrl(decision.winnerUrl)
  if (!winner) blockers.push('winner_url_invalid')
  const urls = new Set<string>()
  for (const competitor of competitors) {
    const url = normalizeCannibalUrl(competitor?.url)
    if (!url) {
      blockers.push('competitor_url_invalid')
      continue
    }
    if (urls.has(url)) blockers.push(`duplicate_competitor:${url}`)
    urls.add(url)
    if (!isMetric(competitor.impressions)) blockers.push(`metrics_unavailable:${url}`)
    else if (competitor.impressions <= 0) blockers.push(`real_impressions_required:${url}`)
    if (!isMetric(competitor.clicks)) blockers.push(`metrics_unavailable:${url}`)
    else if (competitor.clicks < 0) blockers.push(`real_clicks_required:${url}`)
    if (!isMetric(competitor.position)) blockers.push(`metrics_unavailable:${url}`)
    else if (competitor.position <= 0) blockers.push(`real_position_required:${url}`)
    if (!String(competitor.primaryIntent || '').trim()) blockers.push(`primary_intent_required:${url}`)
    if (!sameCannibalIdentity(term, `${competitor.primaryIntent || ''} ${url}`)) {
      blockers.push(`identity_mismatch:${url}`)
    }
    const shared = Array.isArray(competitor.sharedQueries) ? competitor.sharedQueries : []
    if (shared.length === 0) blockers.push(`shared_query_required:${url}`)
    if (!shared.some((q) => isQualifiedGscDemandQuery(String(q?.query || ''), q))) {
      blockers.push(`unqualified_shared_query_evidence:${url}`)
    }
  }
  if (winner && !urls.has(winner)) blockers.push('winner_must_be_competitor')
  if (!String(decision.primaryIntentComparison || '').trim()) blockers.push('intent_comparison_required')

  const byUrl = new Map(competitors.map((c) => [normalizeCannibalUrl(c.url), c]))
  const winnerEvidence = byUrl.get(winner)
  if (winnerEvidence) {
    const winnerIdentity = `${winnerEvidence.primaryIntent || ''} ${winner}`
    for (const competitor of competitors) {
      const url = normalizeCannibalUrl(competitor.url)
      if (!url || url === winner) continue
      if (!sameCannibalIdentity(winnerIdentity, `${competitor.primaryIntent || ''} ${url}`)) {
        blockers.push(`winner_loser_identity_mismatch:${url}`)
      }
    }
  }
  const qualifiedQueryKey = (q: CannibalQueryEvidence) => String(q?.query || '').trim().toLowerCase()
  const winnerQueries = new Set(
    (winnerEvidence?.sharedQueries || [])
      .filter((q) => isQualifiedGscDemandQuery(String(q?.query || ''), q))
      .map(qualifiedQueryKey),
  )
  if (winnerQueries.size === 0) blockers.push('winner_has_no_qualified_shared_query')
  for (const competitor of competitors) {
    const url = normalizeCannibalUrl(competitor.url)
    if (!url || url === winner) continue
    const qualified = (competitor.sharedQueries || []).filter((q) =>
      isQualifiedGscDemandQuery(String(q?.query || ''), q),
    )
    if (qualified.length === 0) blockers.push(`loser_has_no_qualified_query:${url}`)
    else if (winnerQueries.size > 0 && !qualified.some((q) => winnerQueries.has(qualifiedQueryKey(q)))) {
      blockers.push(`no_exact_qualified_query_overlap:${url}`)
    }
  }

  const ownerId = Number(decision.authoritativeOwner?.registryRowId)
  const ownerRow = registryRows.find((row) => row.id === ownerId) || null
  if (!ownerRow || !isAuthoritativeOwnershipRow(ownerRow)) {
    blockers.push('authoritative_p3_owner_required')
  } else {
    const ownerUrl = normalizeCannibalUrl(ownerRow.owner_url)
    if (winner !== ownerUrl) blockers.push('winner_must_equal_authoritative_owner')
    if (normalizeCannibalUrl(decision.authoritativeOwner.ownerUrl) !== ownerUrl) {
      blockers.push('owner_reference_url_mismatch')
    }
    if (String(decision.authoritativeOwner.status) !== String(ownerRow.status)) {
      blockers.push('owner_reference_status_mismatch')
    }
    if (String(decision.authoritativeOwner.action) !== String(ownerRow.action)) {
      blockers.push('owner_reference_action_mismatch')
    }
  }

  // Unique P3 authority across the competitor set. The row selected above only
  // proves which row the operator *declared*; it does not prove that no other
  // authoritative row also owns one of the competing URLs. Without exactly one
  // authority row the winner is ambiguous, so every destructive action fails
  // closed before any Git mutation.
  const authorityRows = p3AuthorityRowsForCompetingUrls(urls, registryRows)
  if (authorityRows.length === 0) {
    blockers.push('p3_authority_missing')
  } else if (authorityRows.length > 1) {
    blockers.push('p3_authority_ambiguous')
  } else {
    const authorityUrl = normalizeCannibalUrl(authorityRows[0].owner_url)
    if (winner !== authorityUrl) blockers.push('winner_must_equal_unique_p3_authority')
    if (ownerRow && Number(ownerRow.id) !== Number(authorityRows[0].id)) {
      blockers.push('authoritative_owner_must_be_unique_p3_authority')
    }
  }

  for (const key of ['backlinks', 'internalLinks'] as const) {
    const evidence = decision[key]
    if (!evidence || !['known', 'unknown'].includes(evidence.status)) {
      blockers.push(`${key}_evidence_required`)
      continue
    }
    if (evidence.status === 'known' && (!isMetric(evidence.count) || Number(evidence.count) < 0)) {
      blockers.push(`${key}_count_required`)
    }
  }

  const losers = [...urls].filter((url) => url !== winner)
  const actions = Array.isArray(decision.loserActions) ? decision.loserActions : []
  if (actions.length === 0) blockers.push('loser_actions_required')
  if (losers.length > MAX_P4_LOSERS) blockers.push(`loser_set_exceeds_review_cap:${MAX_P4_LOSERS}`)
  const actionUrls = new Set<string>()
  for (const action of actions) {
    const url = normalizeCannibalUrl(action?.url)
    const target = normalizeCannibalUrl(action?.target)
    const label = url || 'unknown'
    if (!url || !losers.includes(url)) blockers.push(`loser_action_url_invalid:${label}`)
    if (url) actionUrls.add(url)
    const kind = String(action?.action || '') as CannibalLoserActionKind
    if (!['redirect_301', 'noindex_canonical'].includes(kind)) {
      blockers.push(`unsupported_loser_action:${label}`)
    } else if (url && !cannibalLoserTarget(url, kind)) {
      blockers.push(`unactionable_loser:${url}`)
    }
    if (target !== winner) blockers.push(`loser_target_must_equal_winner:${label}`)
  }
  for (const loser of losers) if (!actionUrls.has(loser)) blockers.push(`loser_action_missing:${loser}`)

  const rollback = decision.rollback
  if (
    !rollback ||
    !Array.isArray(rollback.files) ||
    rollback.files.length === 0 ||
    !String(rollback.restoreInstructions || '').trim()
  ) {
    blockers.push('rollback_snapshot_required')
  } else {
    for (const file of rollback.files) {
      const repo = String(file?.repo || '')
      const path = String(file?.path || '')
      const sha = String(file?.sha || '')
      if (!repo || !path) {
        blockers.push('rollback_snapshot_required')
        continue
      }
      if (sha !== ABSENT_FILE_SHA && !FULL_SHA_RE.test(sha.toLowerCase())) {
        blockers.push(`rollback_sha_invalid:${repo}:${path}`)
      }
    }
  }

  const decidedBy = String(decision.decidedBy || '').trim()
  if (!decidedBy) blockers.push('decided_by_required')
  else if (NON_HUMAN_OPERATORS.has(decidedBy.toLowerCase())) blockers.push('operator_identity_required')
  if (!isIsoDate(decision.decidedAt)) blockers.push('decided_at_required')

  return { ok: blockers.length === 0, blockers: [...new Set(blockers)], ownerRow }
}

export class CannibalDecisionBlockedError extends Error {
  blockers: string[]
  constructor(blockers: string[]) {
    super(`P4 cannibal decision blocked: ${blockers.join(', ')}`)
    this.name = 'CannibalDecisionBlockedError'
    this.blockers = blockers
  }
}
