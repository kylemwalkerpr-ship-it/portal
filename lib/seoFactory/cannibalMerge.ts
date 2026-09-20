/**
 * P4 cannibalization executor.
 *
 * Detection stays recommendation-first. Destructive consolidation is possible
 * only through an evidence-backed decision whose winner equals authoritative P3
 * ownership, and every mutation goes to a review PR — never to main.
 *
 * Ordering guarantees enforced here:
 *  1. `decision` is validated (pure) before anything else.
 *  2. Rollback SHAs are compared against live `main` — a stale/missing snapshot
 *     fails closed before any write.
 *  3. The decision row is persisted to the append-only ledger BEFORE the first
 *     branch/file mutation. Persistence failure means zero Git mutation.
 *  4. Every Git mutation is branch-fenced: no call may target `main`.
 *  5. A `pr_opened` ledger row is written for each review PR. If that row
 *     cannot be persisted the executor stops and returns `needs_decision` —
 *     partial state is never reported as a clean completion.
 */

import { hostFromUrl, slugify, type ContentRepo, type OwnershipRow } from './ownership'
import { isJunkQuery, isQualifiedGscDemandQuery } from './queryNoise'
import { getGscAccess } from '@/lib/gscAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import {
  ABSENT_FILE_SHA,
  CannibalDecisionBlockedError,
  cannibalLoserTarget,
  normalizeCannibalUrl,
  validateCannibalDecision,
  type CannibalEvidenceSource,
  type CannibalDecisionRecord,
} from './cannibalDecision'
import {
  createBranchFrom,
  encodeRepoPath,
  getBranchHeadSha,
  githubFetch,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

export type CannibalMergeMode = 'pr'

export interface CannibalRedirect {
  from: string
  to: string
  repo: string
  file: string
}

export interface CannibalFileChange {
  repo: string
  path: string
  action: 'loser_noindex'
}

export interface CannibalCommit {
  repo: string
  branch: string
  commitSha: string
  prUrl?: string
}

/**
 * `completed` means every Git mutation is covered by a persisted append-only
 * ledger row. `needs_decision` means partial state exists that the executor
 * could not ledger (e.g. a review PR opened but its `pr_opened` row missing);
 * callers must never report it as clean completion.
 */
export type CannibalMergeStatus = 'completed' | 'skipped' | 'needs_decision'

export interface CannibalMergeOutcome {
  status: CannibalMergeStatus
  mode: 'pr'
  term: string
  clusterId: string
  winnerUrl: string
  decisionId: string
  evidenceHash: string
  /** False when a Git mutation happened without its append-only ledger row. */
  ledgerPersisted: boolean
  /** Machine-readable reasons the outcome is not clean (empty when completed). */
  blockers: string[]
  redirectsAdded: CannibalRedirect[]
  filesUpdated: CannibalFileChange[]
  commits: CannibalCommit[]
  skipped: Array<{ url: string; reason: string }>
}

/**
 * Display/evidence shape for `/api/seo-factory/cannibal-pages`.
 * Metrics are `null` whenever they are unavailable (content-inventory fallback):
 * unavailable evidence is never coerced to zero and never destructive.
 */
export interface ResolvedCannibalPage {
  url: string
  impressions: number | null
  clicks: number | null
  position: number | null
}

export interface CannibalEvidenceWindow {
  startDate: string
  endDate: string
  capturedAt: string
}

/**
 * Evidence source for the evidence listing. `content_inventory` is a synthetic
 * display-only fallback with no GSC rows behind it — it is deliberately a
 * distinct value so an inventory listing can never masquerade as GSC evidence.
 */
export type CannibalResolutionEvidenceSource = CannibalEvidenceSource | 'content_inventory'

export interface CannibalResolution {
  pages: ResolvedCannibalPage[]
  source: 'gsc_live' | 'content_inventory'
  evidenceSource: CannibalResolutionEvidenceSource
  siteUrl: string
  window: CannibalEvidenceWindow | null
  metricsSynthetic: boolean
  /** True when the listing is a display-only inventory with no GSC evidence. */
  displayOnly: boolean
  eligibleForDestructiveAction: boolean
  blockingReasons: string[]
  /** P4 never suggests a winner; the authoritative P3 owner row decides. */
  suggestedWinner: null
}

interface PlannedWrite {
  path: string
  content: string
  sha?: string
}

interface PlannedRedirect {
  url: string
  from: string
  to: string
}

interface RepoPlan {
  repo: ContentRepo
  redirectsByFile: Map<string, PlannedRedirect[]>
  writes: PlannedWrite[]
  branch?: string
}

const OWNER = process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it'
const P4_BRANCH_PREFIX = 'cannibal-p4-'
const GSC_WINDOW_DAYS = 90

function pathOf(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '') || '/'
    return path.endsWith('/') ? path : `${path}/`
  } catch {
    return null
  }
}

function normalizeUrl(url: string): string {
  return normalizeCannibalUrl(url)
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

async function readRepoFile(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await githubFetch(
      `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    )
    if (Array.isArray(res)) return null
    const b64 = res?.content as string | undefined
    if (!b64) return null
    return { content: Buffer.from(b64, 'base64').toString('utf-8'), sha: String(res.sha || '') }
  } catch (error) {
    if (/^GitHub 404:/.test(error instanceof Error ? error.message : String(error))) return null
    throw error
  }
}

function editFrontmatter(content: string, edits: Array<[string, string]>): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null
  let frontmatter = match[1]
  for (const [key, value] of edits) {
    const re = new RegExp(`^${key}\\s*:.*$`, 'm')
    frontmatter = re.test(frontmatter)
      ? frontmatter.replace(re, `${key}: ${value}`)
      : `${key}: ${value}\n${frontmatter}`
  }
  return `---\n${frontmatter}\n---\n${match[2]}`
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function canonicalStem(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
}

export function clusterIdFromTerm(term: string): string {
  return `cluster_${canonicalStem(term).replace(/[^a-z0-9]+/g, '_').slice(0, 48)}`
}

async function recordMergeToSupabase(payload: {
  term: string
  winnerUrl: string
  loserUrls: string[]
  redirectsCreated: number
  prUrl?: string
  prNumber?: number
  status: string
  message?: string
}): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient()
    const { error } = await supabase.from('cannibal_merges').upsert(
      {
        cluster_id: clusterIdFromTerm(payload.term),
        source: 'portal',
        stem: canonicalStem(payload.term),
        terms: JSON.stringify([payload.term]),
        winner_url: payload.winnerUrl,
        loser_urls: JSON.stringify(payload.loserUrls),
        redirects_created: payload.redirectsCreated,
        pr_url: payload.prUrl ?? null,
        pr_number: payload.prNumber ?? null,
        status: payload.status,
        message: payload.message ?? null,
        merged_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cluster_id,source' },
    )
    if (error) console.warn('[cannibalMerge] compatibility history skipped:', error.message)
  } catch (error) {
    console.warn('[cannibalMerge] compatibility history skipped:', error)
  }
}

export async function dismissCannibalCluster(term: string, reason: string): Promise<void> {
  await recordMergeToSupabase({
    term,
    winnerUrl: '',
    loserUrls: [],
    redirectsCreated: 0,
    status: 'skipped',
    message: reason.slice(0, 500),
  })
}

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','for','of','to','in','on','at','by','with','from','is','are','was',
  'be','been','how','what','why','when','where','do','does','can','vs','uk','us','ca','au','new','near',
])

function significantWords(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function overlapScore(query: string, term: string): number {
  const queryWords = significantWords(query)
  const termWords = significantWords(term)
  if (!queryWords.length || !termWords.length) return 0
  let hits = 0
  for (const termWord of termWords) {
    if (
      queryWords.some(
        (queryWord) =>
          queryWord === termWord || queryWord.startsWith(termWord.slice(0, Math.max(3, termWord.length - 1))),
      )
    ) {
      hits += 1
    }
  }
  return hits
}

/**
 * Competing-page evidence for a cluster.
 *
 * GSC rows are qualified-only (`isQualifiedGscDemandQuery`), so raw/off-mission
 * and deep-tail rows can never masquerade as destructive evidence. The content
 * inventory fallback is display-only: it marks metrics `null` (never 0) and is
 * permanently ineligible for destructive action. No winner is ever suggested.
 */
export async function resolveCannibalPages(
  term: string,
  opts: { now?: Date; windowDays?: number } = {},
): Promise<CannibalResolution | null> {
  const trimmed = term.trim()
  if (!trimmed) return null
  const now = opts.now ?? new Date()
  const windowDays = Math.max(7, Math.min(opts.windowDays ?? GSC_WINDOW_DAYS, 180))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000)
  const start = new Date(end.getTime() - (windowDays - 1) * 86_400_000)
  const window: CannibalEvidenceWindow = {
    startDate: isoDay(start),
    endDate: isoDay(end),
    capturedAt: now.toISOString(),
  }

  const access = await getGscAccess().catch(() => null)
  if (access?.accessToken && access.siteUrl) {
    try {
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: window.startDate,
          endDate: window.endDate,
          dimensions: ['query', 'page'],
          rowLimit: 25000,
          aggregationType: 'auto',
        }),
      })
      if (response.ok) {
        const data = (await response.json()) as {
          rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }>
        }
        const pageMap = new Map<
          string,
          { impressions: number; clicks: number; positionNumerator: number; positionDenominator: number; queries: Set<string> }
        >()
        const queryPages = new Map<string, Set<string>>()
        const termWords = significantWords(trimmed)
        const minOverlap = Math.max(2, Math.ceil(termWords.length / 2))
        for (const row of data.rows ?? []) {
          const query = String(row.keys?.[0] ?? '').toLowerCase().trim()
          const rawUrl = String(row.keys?.[1] ?? '').trim()
          if (!query || !/^https?:\/\//i.test(rawUrl)) continue
          const metrics = {
            impressions: Number(row.impressions),
            clicks: Number(row.clicks),
            position: Number(row.position),
          }
          if (!Number.isFinite(metrics.impressions) || !Number.isFinite(metrics.clicks) || !Number.isFinite(metrics.position)) {
            continue
          }
          // Zero/absent metrics are not evidence. A row without real
          // impressions and a real position is dropped (never zeroed into
          // destructive eligibility).
          if (!(metrics.impressions > 0) || !(metrics.position > 0)) continue
          if (!isQualifiedGscDemandQuery(query, metrics)) continue
          if (overlapScore(query, trimmed) < minOverlap) continue
          const page = rawUrl.replace(/\/+$/, '')
          const current = pageMap.get(page) ?? {
            impressions: 0,
            clicks: 0,
            positionNumerator: 0,
            positionDenominator: 0,
            queries: new Set<string>(),
          }
          const weight = Math.max(metrics.impressions, 1)
          current.impressions += metrics.impressions
          current.clicks += metrics.clicks
          current.positionNumerator += metrics.position * weight
          current.positionDenominator += weight
          current.queries.add(query)
          pageMap.set(page, current)
          const pages = queryPages.get(query) ?? new Set<string>()
          pages.add(page)
          queryPages.set(query, pages)
        }
        const sharedQueries = new Set(
          [...queryPages.entries()].filter(([, pages]) => pages.size >= 2).map(([query]) => query),
        )
        const pages: ResolvedCannibalPage[] = [...pageMap.entries()]
          .filter(([, data]) => [...data.queries].some((query) => sharedQueries.has(query)))
          .map(([url, data]) => ({
            url,
            impressions: data.impressions,
            clicks: data.clicks,
            position: Math.round((data.positionNumerator / Math.max(data.positionDenominator, 1)) * 10) / 10,
          }))
          // Evidence listing is deliberately URL-ordered: impressions must never
          // imply a winner.
          .sort((a, b) => a.url.localeCompare(b.url))
        if (pages.length >= 2) {
          const blockingReasons: string[] = []
          if (sharedQueries.size === 0) blockingReasons.push('qualified_shared_query_required')
          if (pages.some((page) => !(Number.isFinite(page.impressions) && (page.impressions ?? 0) > 0))) {
            blockingReasons.push('real_impressions_required_for_every_page')
          }
          if (pages.some((page) => !(Number.isFinite(page.position) && (page.position ?? 0) > 0))) {
            blockingReasons.push('real_position_required_for_every_page')
          }
          const eligible = blockingReasons.length === 0
          return {
            pages,
            source: 'gsc_live',
            evidenceSource: 'gsc_live',
            siteUrl: access.siteUrl,
            window,
            metricsSynthetic: false,
            displayOnly: false,
            eligibleForDestructiveAction: eligible,
            blockingReasons,
            suggestedWinner: null,
          }
        }
      }
    } catch {
      /* display-only fallback below */
    }
  }

  const supabase = createSupabaseAdminClient()
  const { data: jobs } = await supabase
    .from('content_jobs')
    .select('title,topic,primary_keyword,canonical_url,status')
    .in('status', ['merged', 'pr_created', 'publishing'])
    .limit(500)
  const termWords = significantWords(trimmed)
  const seen = new Set<string>()
  const pages: ResolvedCannibalPage[] = []
  for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
    const url = String(job.canonical_url || '').trim()
    const haystack = `${String(job.primary_keyword || '')} ${String(job.topic || '')} ${String(job.title || '')}`
    if (!url || seen.has(url)) continue
    if (overlapScore(haystack, trimmed) < Math.max(1, Math.ceil(termWords.length / 2))) continue
    seen.add(url)
    // Metrics are genuinely unavailable here — null, never 0.
    pages.push({ url, impressions: null, clicks: null, position: null })
  }
  pages.sort((a, b) => a.url.localeCompare(b.url))
  if (pages.length >= 2) {
    return {
      pages,
      source: 'content_inventory',
      // No GSC row backs this listing: it is a synthetic, display-only
      // inventory. It must never be labelled as GSC evidence, and it is
      // permanently ineligible for destructive action.
      evidenceSource: 'content_inventory',
      siteUrl: access?.siteUrl ?? '',
      window: null,
      metricsSynthetic: true,
      displayOnly: true,
      eligibleForDestructiveAction: false,
      blockingReasons: ['synthetic_inventory_evidence_not_actionable', 'real_metrics_unavailable'],
      suggestedWinner: null,
    }
  }
  return null
}

async function persistP4Decision(
  decision: CannibalDecisionRecord,
  status: 'approved' | 'pr_opened' | 'failed',
  pr?: { url?: string; number?: number },
): Promise<string> {
  const supabase = createSupabaseAdminClient()
  const result = await supabase
    .from('seo_cannibal_decisions')
    .insert({
      cluster_id: decision.clusterId,
      term: decision.term,
      status,
      evidence_source: decision.evidenceSource,
      evidence_hash: decision.evidenceHash,
      evidence_window: decision.evidenceWindow,
      evidence: decision,
      competitors: decision.competitors,
      winner_url: decision.winnerUrl,
      owner_registry_row_id: decision.authoritativeOwner.registryRowId,
      loser_actions: decision.loserActions,
      rollback: decision.rollback,
      decided_by: decision.decidedBy,
      decided_at: decision.decidedAt,
      pr_url: pr?.url ?? null,
      pr_number: pr?.number ?? null,
    } as never)
    .select('id')
    .single()
  if (result.error) throw new Error(`P4 decision persistence failed: ${result.error.message}`)
  const data = result.data as { id?: string } | null
  if (!data?.id) throw new Error('P4 decision persistence failed: missing decision id')
  return String(data.id)
}

function rollbackSha(decision: CannibalDecisionRecord, repo: string, path: string): string | null {
  return decision.rollback.files.find((file) => file.repo === repo && file.path === path)?.sha ?? null
}

/** Fail closed: the recorded snapshot must match live `main` exactly. */
function assertRollbackMatches(
  decision: CannibalDecisionRecord,
  repo: string,
  path: string,
  current: { sha: string } | null,
): void {
  const expected = rollbackSha(decision, repo, path)
  if (!expected) throw new CannibalDecisionBlockedError([`rollback_file_missing:${repo}:${path}`])
  if (expected === ABSENT_FILE_SHA) {
    if (current) throw new CannibalDecisionBlockedError([`rollback_sha_mismatch:${repo}:${path}`])
    return
  }
  if (!current || current.sha !== expected) {
    throw new CannibalDecisionBlockedError([`rollback_sha_mismatch:${repo}:${path}`])
  }
}

/** Every Git mutation is branch-fenced; `main` is impossible by construction. */
function assertSafeBranch(branch: string): void {
  const normalized = String(branch || '').trim()
  const isMain =
    normalized === 'main' ||
    normalized === 'master' ||
    normalized.startsWith('refs/heads/main') ||
    normalized.startsWith('refs/heads/master')
  if (isMain) throw new CannibalDecisionBlockedError(['main_branch_forbidden'])
  if (!normalized.startsWith(P4_BRANCH_PREFIX)) {
    throw new CannibalDecisionBlockedError([`branch_naming_violation:${normalized || 'empty'}`])
  }
}

export async function executeCannibalMerge(opts: {
  term: string
  winnerUrl: string
  loserUrls: string[]
  mode?: CannibalMergeMode
  confirm?: boolean
  decision?: CannibalDecisionRecord
}): Promise<CannibalMergeOutcome> {
  const term = String(opts.term || '').trim().slice(0, 160)
  if (!term) throw new CannibalDecisionBlockedError(['term_required'])
  if (isJunkQuery(term)) throw new CannibalDecisionBlockedError(['term_not_actionable'])
  if (opts.mode !== 'pr') throw new CannibalDecisionBlockedError(['pr_mode_required'])
  if (opts.confirm !== true) throw new CannibalDecisionBlockedError(['explicit_confirmation_required'])
  if (!opts.decision) throw new CannibalDecisionBlockedError(['decision_required'])

  const registry = await loadOwnershipRegistry()
  const validation = validateCannibalDecision(opts.decision, registry.rows as OwnershipRow[])
  if (!validation.ok) throw new CannibalDecisionBlockedError(validation.blockers)
  if (String(opts.decision.term).trim().toLowerCase() !== term.toLowerCase()) {
    throw new CannibalDecisionBlockedError(['request_term_must_match_decision'])
  }

  const winnerUrl = normalizeUrl(opts.winnerUrl)
  const decisionWinner = normalizeUrl(opts.decision.winnerUrl)
  const loserUrls = [...new Set(opts.loserUrls.map(normalizeUrl).filter(Boolean))].sort()
  const decisionLosers = [...new Set(opts.decision.loserActions.map((action) => normalizeUrl(action.url)))].sort()
  if (!winnerUrl || winnerUrl !== decisionWinner) {
    throw new CannibalDecisionBlockedError(['request_winner_must_match_decision'])
  }
  if (JSON.stringify(loserUrls) !== JSON.stringify(decisionLosers)) {
    throw new CannibalDecisionBlockedError(['request_losers_must_match_decision'])
  }
  const winnerHost = hostFromUrl(winnerUrl)
  const winnerPath = pathOf(winnerUrl)
  if (!winnerHost || !winnerPath) throw new CannibalDecisionBlockedError(['winner_url_invalid'])

  const plans = new Map<ContentRepo, RepoPlan>()
  const planFor = (repo: ContentRepo): RepoPlan => {
    const existing = plans.get(repo)
    if (existing) return existing
    const created: RepoPlan = { repo, redirectsByFile: new Map(), writes: [] }
    plans.set(repo, created)
    return created
  }
  const actionByUrl = new Map(opts.decision.loserActions.map((action) => [normalizeUrl(action.url), action]))
  const skipped: Array<{ url: string; reason: string }> = []
  const writtenRedirects: Array<{ repo: ContentRepo; file: string; entry: PlannedRedirect }> = []

  // ── Plan (reads only) ────────────────────────────────────────────────────
  for (const loserUrl of loserUrls) {
    const action = actionByUrl.get(loserUrl)
    const target = action ? cannibalLoserTarget(loserUrl, action.action) : null
    if (!target) throw new CannibalDecisionBlockedError([`unactionable_loser:${loserUrl}`])
    const plan = planFor(target.repo)
    if (target.kind === 'redirect') {
      const from = pathOf(loserUrl)
      if (!from) throw new CannibalDecisionBlockedError([`loser_path_unresolvable:${loserUrl}`])
      const redirects = plan.redirectsByFile.get(target.file) ?? []
      redirects.push({ url: loserUrl, from, to: target.host === winnerHost ? winnerPath : winnerUrl })
      plan.redirectsByFile.set(target.file, redirects)
    } else {
      const current = await readRepoFile(OWNER, target.repo, target.path, 'main')
      assertRollbackMatches(opts.decision, target.repo, target.path, current)
      if (!current) throw new CannibalDecisionBlockedError([`noindex_source_missing:${loserUrl}`])
      const edited = editFrontmatter(current.content, [
        ['index', 'false'],
        ['canonicalUrl', quote(winnerUrl)],
        ['mergedInto', quote(winnerUrl)],
      ])
      if (!edited) throw new CannibalDecisionBlockedError([`noindex_frontmatter_missing:${loserUrl}`])
      plan.writes.push({ path: target.path, content: edited, sha: current.sha })
    }
  }

  for (const plan of plans.values()) {
    for (const [file, redirects] of plan.redirectsByFile.entries()) {
      const current = await readRepoFile(OWNER, plan.repo, file, 'main')
      assertRollbackMatches(opts.decision, plan.repo, file, current)
      const seen = new Set<string>()
      for (const line of (current?.content || '').split('\n')) {
        const first = (line.trim().split(/\s+/)[0] || '').trim()
        if (first && first !== '#') seen.add(first)
      }
      const fresh = redirects.filter((redirect) => redirect.from && !seen.has(redirect.from))
      for (const redirect of redirects) {
        if (!fresh.includes(redirect)) {
          skipped.push({ url: redirect.url, reason: 'redirect_already_present_on_main' })
        }
      }
      if (!fresh.length) continue
      const body = fresh.map((redirect) => `${redirect.from}  ${redirect.to}  301`).join('\n')
      const header = `\n# P4 evidence-backed cannibal consolidation — ${term}\n# winner: ${winnerUrl}\n`
      plan.writes.push({
        path: file,
        content: `${(current?.content || '').replace(/\n*$/, '\n')}${header}${body}\n`,
        sha: current?.sha,
      })
      for (const entry of fresh) writtenRedirects.push({ repo: plan.repo, file, entry })
    }
  }

  // ── Persist decision BEFORE the first Git mutation ───────────────────────
  const decisionId = await persistP4Decision(opts.decision, 'approved')

  const outcome: CannibalMergeOutcome = {
    status: 'completed',
    mode: 'pr',
    term,
    clusterId: opts.decision.clusterId,
    winnerUrl,
    decisionId,
    evidenceHash: opts.decision.evidenceHash,
    ledgerPersisted: true,
    blockers: [],
    redirectsAdded: [],
    filesUpdated: [],
    commits: [],
    skipped,
  }

  try {
    // ── Branch + writes + PR (never main) ─────────────────────────────────
    for (const plan of plans.values()) {
      if (!plan.writes.length) continue
      const branch = `${P4_BRANCH_PREFIX}${slugify(term).slice(0, 32)}-${Date.now().toString(36)}`
      assertSafeBranch(branch)
      plan.branch = branch
      const mainSha = await getBranchHeadSha(OWNER, plan.repo, 'main')
      assertSafeBranch(branch)
      await createBranchFrom(OWNER, plan.repo, branch, mainSha)
      for (const write of plan.writes) {
        assertSafeBranch(branch)
        await putRepoFile({
          owner: OWNER,
          repo: plan.repo,
          path: write.path,
          branch,
          content: write.content,
          message: `fix(seo): P4 consolidate "${term}" — ${write.path}`,
          sha: write.sha,
        })
      }
      assertSafeBranch(branch)
      const pr = await openPullRequest({
        owner: OWNER,
        repo: plan.repo,
        title: `fix(seo): P4 cannibal consolidation "${term}"`,
        head: branch,
        base: 'main',
        body: [
          'P4 evidence-backed cannibalization consolidation. Review required — never merged by this executor.',
          '',
          `**Winner / P3 owner:** ${winnerUrl}`,
          `**Decision cluster:** ${opts.decision.clusterId}`,
          `**Decision ledger id:** ${decisionId}`,
          `**Evidence:** ${opts.decision.evidenceSource} · ${opts.decision.evidenceWindow.startDate} → ${opts.decision.evidenceWindow.endDate}`,
          `**Evidence hash:** ${opts.decision.evidenceHash}`,
          `**Decided by:** ${opts.decision.decidedBy} at ${opts.decision.decidedAt}`,
          '',
          '**Loser actions:**',
          ...opts.decision.loserActions.map((action) => `- ${action.action}: ${action.url} → ${action.target}`),
          '',
          `**Rollback:** ${opts.decision.rollback.restoreInstructions}`,
          '',
          'Rollback snapshot:',
          ...opts.decision.rollback.files.map((file) => `- \`${file.repo}\` \`${file.path}\` @ ${file.sha}`),
        ].join('\n'),
      })
      const prNumber = Number(pr.html_url.split('/').pop() || 0) || undefined
      outcome.commits.push({ repo: plan.repo, branch, commitSha: '', prUrl: pr.html_url })
      for (const written of writtenRedirects) {
        if (written.repo !== plan.repo) continue
        outcome.redirectsAdded.push({
          from: written.entry.from,
          to: written.entry.to,
          repo: written.repo,
          file: written.file,
        })
      }
      for (const write of plan.writes) {
        if (!write.path.endsWith('_redirects')) {
          outcome.filesUpdated.push({ repo: plan.repo, path: write.path, action: 'loser_noindex' })
        }
      }
      try {
        await persistP4Decision(opts.decision, 'pr_opened', { url: pr.html_url, number: prNumber })
      } catch (error) {
        // The review PR exists but its append-only ledger row does not. That is
        // partial state: report needs-decision, record the blocker, and stop
        // mutating so no further PR can outrun the ledger.
        console.error('[cannibalMerge] PR linkage persistence failed:', error)
        outcome.status = 'needs_decision'
        outcome.ledgerPersisted = false
        outcome.blockers.push('pr_opened_ledger_persistence_failed')
        break
      }
    }
  } catch (error) {
    try {
      await persistP4Decision(opts.decision, 'failed')
    } catch (persistError) {
      console.error('[cannibalMerge] failure persistence skipped:', persistError)
    }
    throw error
  }

  if (outcome.status === 'completed' && outcome.commits.length === 0) {
    outcome.status = 'skipped'
    outcome.blockers.push('no_actionable_writes')
    return outcome
  }

  const firstPr = outcome.commits.find((commit) => commit.prUrl)
  const prNumber = firstPr?.prUrl ? Number(firstPr.prUrl.split('/').pop() || 0) || undefined : undefined
  await recordMergeToSupabase({
    term,
    winnerUrl,
    loserUrls,
    redirectsCreated: outcome.redirectsAdded.length,
    prUrl: firstPr?.prUrl,
    prNumber,
    status:
      outcome.status === 'needs_decision'
        ? 'needs_decision'
        : outcome.commits.length
          ? 'pr_created'
          : 'skipped',
    message:
      outcome.status === 'needs_decision'
        ? 'P4 review PR opened but the append-only decision ledger row could not be persisted — operator decision required'
        : outcome.commits.length
          ? 'P4 evidence-backed review PR opened; not merged'
          : 'P4 decision produced no actionable writes',
  })
  return outcome
}
