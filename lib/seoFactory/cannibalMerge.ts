/**
 * Cannibal merge executor — one-click resolution of war-room cannibal_merge plays.
 *
 * For a query with multiple estate URLs ranking for the same term, the admin
 * picks a winner; this module:
 *   1. Appends 301 redirects (loser → winner) to the estate `_redirects` files
 *      (caseworks/public/_redirects · yousafe-consultancy/<app>/public/_redirects).
 *   2. Retires losers at the source (markdown only): index:false + canonicalUrl
 *      + mergedInto, so sitemaps/signals consolidate even before the 301 propagates.
 *   3. Enriches the winner frontmatter with mergedQueries so it explicitly
 *      targets the merged term (interlink/SEO layer reads this later).
 * Writes go to main directly (mode: 'merge') or a review PR (mode: 'pr').
 *
 * Resolution hardening (v2): when the caller passes a bare keyword or an
 * incomplete winner/loser set, this engine resolves the *actual competing
 * pages* straight from Google Search Console query×page data (highest
 * impressions = winner) instead of throwing a validation error. GSC data is
 * the source of truth for "which pages rank for this term".
 */

import { hostFromUrl, HOST_REPO, filePathFromOwnerUrl, slugify, type OwnerHost } from './ownership'
import { isJunkQuery } from './queryNoise'
import { getGscAccess } from '@/lib/gscAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  createBranchFrom,
  encodeRepoPath,
  getBranchHeadSha,
  githubFetch,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

export type CannibalMergeMode = 'merge' | 'pr'

export interface CannibalRedirect {
  from: string
  to: string
  repo: string
  file: string
}

export interface CannibalFileChange {
  repo: string
  path: string
  action: 'loser_noindex' | 'winner_keywords'
}

export interface CannibalCommit {
  repo: string
  branch: string
  commitSha: string
  prUrl?: string
}

export interface CannibalMergeOutcome {
  term: string
  winnerUrl: string
  redirectsAdded: CannibalRedirect[]
  filesUpdated: CannibalFileChange[]
  commits: CannibalCommit[]
  skipped: Array<{ url: string; reason: string }>
}

interface RepoPlan {
  repo: string
  branch: string
  redirectFile: string | null
  redirects: Array<{ from: string; to: string }>
  writes: Array<{ path: string; content: string; sha?: string }>
}

const OWNER = process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it'

/** _redirects location per host — null when the host has no redirect convention. */
function redirectFileForHost(host: OwnerHost): { repo: string; file: string } | null {
  if (host === 'legal') return { repo: 'caseworks', file: 'public/_redirects' }
  if (host === 'usa' || host === 'uk' || host === 'ca' || host === 'au')
    return { repo: 'yousafe-consultancy', file: `${host}/public/_redirects` }
  // apex (landing-page OpenNext worker) and market (portal) have no _redirects convention
  return null
}

/** Markdown/mdx content path for a URL — legal pages.tsx are never rewritten. */
function contentFilePathFor(host: OwnerHost, url: string): string | null {
  if (host === 'legal') return null
  const mapped = filePathFromOwnerUrl(url, host)
  if (!mapped) return null
  if (mapped.filePath.endsWith('.md') || mapped.filePath.endsWith('.mdx')) return mapped.filePath
  return null
}

function pathOf(url: string): string | null {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '') || '/'
    return p.endsWith('/') ? p : `${p}/`
  } catch {
    return null
  }
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
    return { content: Buffer.from(b64, 'base64').toString('utf-8'), sha: res.sha as string }
  } catch (e) {
    if (/^GitHub 404:/.test(e instanceof Error ? e.message : String(e))) return null
    throw e
  }
}

/** Deterministic frontmatter edit — preserves field order, adds missing keys on top. */
function editFrontmatter(content: string, edits: Array<[string, string]>): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return null
  let fm = m[1]
  for (const [key, value] of edits) {
    const re = new RegExp(`^${key}\\s*:.*$`, 'm')
    if (re.test(fm)) fm = fm.replace(re, `${key}: ${value}`)
    else fm = `${key}: ${value}\n${fm}`
  }
  return `---\n${fm}\n---\n${m[2]}`
}

function quote(v: string): string {
  return /^(true|false|\d+)$/.test(v) ? v : JSON.stringify(v)
}

/** Append the merged term to the winner's mergedQueries frontmatter field. */
function withMergedQuery(content: string, term: string): string | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return null
  let fm = m[1]
  const re = /^mergedQueries\s*:\s*"?([^"\n]*)"?$/m
  const hit = fm.match(re)
  if (hit) {
    const parts = hit[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.some((p) => p.toLowerCase() === term.toLowerCase())) return content
    fm = fm.replace(re, `mergedQueries: ${JSON.stringify([...parts, term].join(', '))}`)
  } else {
    fm = `mergedQueries: ${JSON.stringify(term)}\n${fm}`
  }
  return `---\n${fm}\n---\n${m[2]}`
}

// ---------------------------------------------------------------------------
// GSC resolution — the page set for a term comes from Google, not from guesses
// ---------------------------------------------------------------------------

/** A keyword-shaped string (no scheme/host) is a query, not a page URL. */
function looksLikeKeyword(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return true
  if (/^https?:\/\//i.test(v)) return false
  if (v.startsWith('/')) return false // path-only is still URL-ish
  return !/\.[a-z]{2,}(\/|$)/i.test(v) // no domain-looking component → keyword
}

function canonicalStem(q: string): string {
  return q
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

/**
 * Deterministic cluster id shared with the Command Center — both products
 * derive the same id from the term stem so the cannibal_merges upsert key
 * (cluster_id, source) dedupes cleanly across writers.
 */
export function clusterIdFromTerm(term: string): string {
  return `cluster_${canonicalStem(term).replace(/[^a-z0-9]+/g, '_').slice(0, 48)}`
}

/**
 * Best-effort sync of a merge decision into the shared cannibal_merges table
 * (source = 'portal'). Mirrors the Command Center's write so the deployed
 * Content Studio and Command Center share one audit trail. Never throws — a
 * sync failure must not fail the merge itself.
 */
async function recordMergeToSupabase(payload: {
  term: string
  winnerUrl: string
  loserUrls: string[]
  redirectsCreated: number
  prUrl?: string
  prNumber?: number
  status: 'merged' | 'skipped'
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
      },
      { onConflict: 'cluster_id,source' },
    )
    if (error) {
      console.warn('[cannibalMerge] supabase history sync skipped:', error.message)
    }
  } catch (err) {
    console.warn('[cannibalMerge] supabase history sync skipped:', err)
  }
}

/** Persist a non-mergeable cluster so Resolve-all can clear it from the Work Plan. */
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

export interface ResolvedCannibalPage {
  url: string
  impressions: number
  clicks: number
  position: number
}

export interface CannibalResolution {
  pages: ResolvedCannibalPage[]
  source: 'gsc_live' | 'content_inventory'
  siteUrl: string
}

/** Stop-words never counted in overlap matching. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'of', 'to', 'in', 'on', 'at', 'by',
  'with', 'from', 'is', 'are', 'was', 'be', 'been', 'how', 'what', 'why', 'when',
  'where', 'do', 'does', 'can', 'vs', 'uk', 'us', 'ca', 'au', 'new', 'near', 'for',
])

function significantWords(q: string): string[] {
  return q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
}

/**
 * Word-overlap similarity between a GSC query and the target term. Returns
 * the number of shared significant words (plural-safe via stem prefix match).
 */
function overlapScore(q: string, term: string): number {
  const qWords = significantWords(q)
  const tWords = significantWords(term)
  if (!qWords.length || !tWords.length) return 0
  let hits = 0
  for (const tw of tWords) {
    // match exact or plural stem (letter, letters)
    if (qWords.some((qw) => qw === tw || qw.startsWith(tw.slice(0, Math.max(3, tw.length - 1))))) hits++
  }
  return hits
}

/**
 * Query Google Search Console for every query×page row in the last 30 days,
 * keep rows whose keyword words overlap the target term, and return the pages
 * competing for it ranked by impressions. Matching is fuzzy (word-overlap)
 * instead of exact-stem so "administrative review letter template uk" also
 * picks up sibling queries like "uk administrative review letter template"
 * or "administrative review letter template 2026".
 *
 * Falls back to the content inventory (shipped/merged content_jobs) when GSC
 * has no page-level rows for the term, so the watch is still actionable when
 * GSC data is thin.
 */
export async function resolveCannibalPages(
  term: string,
): Promise<CannibalResolution | null> {
  const trimmed = term.trim()
  if (!trimmed) return null

  // 1) GSC page×query resolution (source of truth when present)
  const access = await getGscAccess().catch(() => null)
  if (access?.accessToken && access.siteUrl) {
    try {
      const encodedSite = encodeURIComponent(access.siteUrl)
      const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: '30daysAgo',
          endDate: 'today',
          dimensions: ['query', 'page'],
          rowLimit: 1000,
          aggregationType: 'auto',
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          rows?: Array<{
            keys: string[]
            clicks: number
            impressions: number
            ctr: number
            position: number
          }>
        }
        const pageMap = new Map<
          string,
          { impressions: number; clicks: number; positions: number[] }
        >()
        for (const row of data.rows ?? []) {
          const q = String(row.keys?.[0] ?? '').toLowerCase().trim()
          const rawUrl = String(row.keys?.[1] ?? '').trim()
          if (!q || q.length < 4 || !rawUrl || !/^https?:\/\//i.test(rawUrl)) continue
          // Word-overlap gate: at least half the term's words appear in the query.
          const tWords = significantWords(trimmed)
          const hits = overlapScore(q, trimmed)
          if (hits < Math.max(2, Math.ceil(tWords.length / 2))) continue
          const urlKey = rawUrl.replace(/\/+$/, '')
          const existing = pageMap.get(urlKey) ?? { impressions: 0, clicks: 0, positions: [] }
          existing.impressions += row.impressions
          existing.clicks += row.clicks
          existing.positions.push(row.position)
          pageMap.set(urlKey, existing)
        }
        const pages: ResolvedCannibalPage[] = [...pageMap.entries()]
          .map(([u, d]) => ({
            url: u,
            impressions: d.impressions,
            clicks: d.clicks,
            position: Math.round((d.positions.reduce((a, b) => a + b, 0) / d.positions.length) * 10) / 10,
          }))
          .sort((a, b) => b.impressions - a.impressions)
        if (pages.length >= 2) {
          return { pages, source: 'gsc_live', siteUrl: access.siteUrl }
        }
      }
    } catch {
      /* fall through to inventory resolution */
    }
  }

  // 2) Content-inventory fallback: shipped/merged pages that target this term.
  // GSC often has no page rows for fresh or low-impression terms — but the
  // studio KNOWS which pages were built for it, so resolve from those instead
  // of dead-ending with "could not resolve".
  const supabase = createSupabaseAdminClient()
  const { data: jobs } = await supabase
    .from('content_jobs')
    .select('id, title, topic, primary_keyword, canonical_url, content_path, status, seo_score, pr_url')
    .in('status', ['merged', 'pr_created', 'publishing'])
    .limit(500)
  const tWords = significantWords(trimmed)
  const seen = new Set<string>()
  const pages: ResolvedCannibalPage[] = []
  for (const j of (jobs ?? []) as Array<Record<string, unknown>>) {
    const url = String(j.canonical_url || '').trim()
    const hay = `${String(j.primary_keyword || '')} ${String(j.topic || '')} ${String(j.title || '')}`
    if (!url || seen.has(url)) continue
    const hits = overlapScore(hay, trimmed)
    if (hits < Math.max(1, Math.ceil(tWords.length / 2))) continue
    seen.add(url)
    pages.push({
      url,
      impressions: 0,
      clicks: 0,
      position: 0,
    })
  }
  if (pages.length >= 2) {
    return { pages, source: 'content_inventory', siteUrl: access?.siteUrl ?? '' }
  }

  return null
}

export async function executeCannibalMerge(opts: {
  term: string
  winnerUrl: string
  loserUrls: string[]
  mode?: CannibalMergeMode
}): Promise<CannibalMergeOutcome> {
  const mode: CannibalMergeMode = opts.mode === 'pr' ? 'pr' : 'merge'
  const term = opts.term.trim().slice(0, 160)
  let winnerUrl = opts.winnerUrl.trim()
  let loserUrls = [...new Set(opts.loserUrls.map((u) => u.trim()).filter(Boolean))].filter(
    (u) => u !== winnerUrl,
  )

  const outcome: CannibalMergeOutcome = {
    term,
    winnerUrl,
    redirectsAdded: [],
    filesUpdated: [],
    commits: [],
    skipped: [],
  }

  if (!term) {
    throw new Error('A search term is required to run a cannibal merge.')
  }

  if (isJunkQuery(term)) {
    const reason = 'junk GSC query — not a real keyword cluster'
    await dismissCannibalCluster(term, reason)
    outcome.skipped.push({ url: '', reason })
    return outcome
  }

  // Resolution-first: if the caller passed a bare keyword, a missing winner,
  // or an empty loser set, pull the competing pages from GSC page data.
  if (!winnerUrl || looksLikeKeyword(winnerUrl) || loserUrls.length === 0) {
    const resolved = await resolveCannibalPages(term)
    if (resolved && resolved.pages.length >= 2) {
      winnerUrl = resolved.pages[0].url
      loserUrls = resolved.pages.slice(1).map((p) => p.url)
      outcome.winnerUrl = winnerUrl
    } else {
      const reason = 'no competing pages resolvable — not a real cluster'
      await dismissCannibalCluster(term, reason)
      outcome.skipped.push({ url: '', reason })
      return outcome
    }
  }

  // Hard validation of the final (possibly resolved) page set.
  if (!/^https?:\/\//i.test(winnerUrl)) {
    throw new Error(`Winner is not a valid page URL: ${winnerUrl}`)
  }
  const winnerHost = hostFromUrl(winnerUrl)
  if (!winnerHost) throw new Error(`Could not resolve host for winner URL: ${winnerUrl}`)
  const winnerPath = pathOf(winnerUrl)
  if (!winnerPath) throw new Error(`Could not parse winner URL: ${winnerUrl}`)
  const winnerRepo = HOST_REPO[winnerHost]
  const winnerContentPath = contentFilePathFor(winnerHost, winnerUrl)

  // ── Plan per repo ──
  const plans = new Map<string, RepoPlan>()
  const planFor = (repo: string, host: OwnerHost): RepoPlan => {
    let p = plans.get(repo)
    if (!p) {
      p = { repo, branch: 'main', redirectFile: null, redirects: [], writes: [] }
      plans.set(repo, p)
      const rf = redirectFileForHost(host)
      if (rf && rf.repo === repo) p.redirectFile = rf.file
    }
    return p
  }

  // Winner enrichment (markdown only) — explicitly target the merged term
  if (winnerContentPath) {
    const existing = await readRepoFile(OWNER, winnerRepo, winnerContentPath, 'main')
    if (existing) {
      const withQ = withMergedQuery(existing.content, term)
      if (withQ && withQ !== existing.content) {
        planFor(winnerRepo, winnerHost).writes.push({
          path: winnerContentPath,
          content: withQ,
          sha: existing.sha,
        })
        outcome.filesUpdated.push({ repo: winnerRepo, path: winnerContentPath, action: 'winner_keywords' })
      }
    }
  }

  // Losers → 301 redirect + noindex/canonical at source
  for (const loserUrl of loserUrls) {
    const host = hostFromUrl(loserUrl)
    if (!host) {
      outcome.skipped.push({ url: loserUrl, reason: 'unknown host' })
      continue
    }
    const repo = HOST_REPO[host]
    const fromPath = pathOf(loserUrl)
    if (!fromPath) {
      outcome.skipped.push({ url: loserUrl, reason: 'unparseable URL' })
      continue
    }
    const to = host === winnerHost ? winnerPath : winnerUrl
    const plan = planFor(repo, host)
    if (plan.redirectFile) {
      plan.redirects.push({ from: fromPath, to })
    } else {
      outcome.skipped.push({
        url: loserUrl,
        reason: `no _redirects convention for host ${host} — canonical/noindex only`,
      })
    }
    const contentPath = contentFilePathFor(host, loserUrl)
    if (contentPath) {
      const existing = await readRepoFile(OWNER, repo, contentPath, 'main')
      if (existing) {
        const edited = editFrontmatter(existing.content, [
          ['index', 'false'],
          ['canonicalUrl', quote(winnerUrl)],
          ['mergedInto', quote(winnerUrl)],
        ])
        if (edited) {
          plan.writes.push({ path: contentPath, content: edited, sha: existing.sha })
          outcome.filesUpdated.push({ repo, path: contentPath, action: 'loser_noindex' })
        }
      }
    }
  }

  // ── Execute per repo ──
  for (const plan of plans.values()) {
    const hasChanges = plan.redirects.length > 0 || plan.writes.length > 0
    if (!hasChanges) continue

    let branch = 'main'
    let isPr = false
    if (mode === 'pr') {
      branch = `cannibal-merge-${slugify(term).slice(0, 40)}-${Date.now().toString(36)}`
      const mainSha = await getBranchHeadSha(OWNER, plan.repo, 'main')
      await createBranchFrom(OWNER, plan.repo, branch, mainSha)
      isPr = true
    }

    // _redirects (append 301s, dedupe by source path)
    if (plan.redirectFile && plan.redirects.length > 0) {
      const existing = await readRepoFile(OWNER, plan.repo, plan.redirectFile, 'main')
      const seen = new Set<string>()
      if (existing) {
        for (const line of existing.content.split('\n')) {
          const first = (line.trim().split(/\s+/)[0] || '').trim()
          if (first && first !== '#') seen.add(first)
        }
      }
      const fresh = plan.redirects.filter((r) => !seen.has(r.from))
      if (fresh.length > 0) {
        const header = [
          '',
          `# SEO war-room cannibal merge — ${term} (${new Date().toISOString().slice(0, 10)})`,
          `# winner: ${winnerUrl}`,
          '',
        ].join('\n')
        const body = fresh.map((r) => `${r.from}  ${r.to}  301`).join('\n') + '\n'
        const content = existing
          ? existing.content.replace(/\n*$/, '\n') + header + body
          : `# Cloudflare Pages 301 redirects — war-room cannibal merges\n# winner: ${winnerUrl}\n${body}`
        await putRepoFile({
          owner: OWNER,
          repo: plan.repo,
          path: plan.redirectFile,
          branch,
          content,
          message: `fix(seo): cannibal merge "${term}" — 301 ${fresh.length} URL(s) → ${winnerUrl}`,
          sha: existing?.sha,
        })
        for (const r of fresh) {
          outcome.redirectsAdded.push({ from: r.from, to: r.to, repo: plan.repo, file: plan.redirectFile })
        }
      }
    }

    // content file writes
    for (const w of plan.writes) {
      await putRepoFile({
        owner: OWNER,
        repo: plan.repo,
        path: w.path,
        branch,
        content: w.content,
        message: `fix(seo): cannibal merge "${term}" — ${w.path}`,
        sha: w.sha,
      })
    }

    // PR or direct commit
    if (isPr) {
      const pr = await openPullRequest({
        owner: OWNER,
        repo: plan.repo,
        title: `fix(seo): cannibal merge "${term}" → ${winnerUrl}`,
        head: branch,
        base: 'main',
        body: [
          `Cannibal merge from the SEO War Room.`,
          ``,
          `**Winner:** ${winnerUrl}`,
          `**Redirects (301):**`,
          ...plan.redirects.map((r) => `- ${r.from} → ${r.to}`),
          `**Files updated:**`,
          ...plan.writes.map((w) => `- ${w.path}`),
        ].join('\n'),
      })
      outcome.commits.push({ repo: plan.repo, branch, commitSha: '', prUrl: pr.html_url })
    } else {
      outcome.commits.push({ repo: plan.repo, branch, commitSha: 'merged-to-main' })
    }
  }

  // ── Sync the decision into the shared cannibal_merges table (best-effort) ──
  const firstPr = outcome.commits.find((c) => c.prUrl)
  const prNumber = firstPr?.prUrl ? Number(firstPr.prUrl.split('/').pop() || 0) || undefined : undefined
  await recordMergeToSupabase({
    term,
    winnerUrl,
    loserUrls,
    redirectsCreated: outcome.redirectsAdded.length,
    prUrl: firstPr?.prUrl,
    prNumber,
    status: outcome.commits.length > 0 ? 'merged' : 'skipped',
    message:
      outcome.commits.length > 0
        ? `Merged ${outcome.redirectsAdded.length} redirect(s) across ${outcome.commits.length} repo(s)`
        : `Skipped — ${outcome.skipped.length} URL(s) had no redirect convention`,
  })

  return outcome
}
