/**
 * Index Coverage fixes — resolve "why is this page not indexed" issues.
 *
 * Takes the GSC URL Inspection classification (lib/gscIndexCoverage.ts) and,
 * for each issue, applies the fix that makes the page indexable again:
 *
 *   · REMOVE_NOINDEX      → strip robots noindex (fully-expanded pages only)
 *   · ADD/FIX_CANONICAL   → write a self-referencing canonical
 *   · FIX_ROBOTS_TXT      → remove a matching robots.txt disallow
 *   · orphan / sitemap    → delegate to the existing Site Health repair
 *   · thin / route / 401  → surfaced as recommendations (not auto-rewritten)
 *
 * Deterministic edits open PRs into the content repos (same GitHub path as
 * siteHealthFixes.ts). After a fix lands we nudge re-crawl via IndexNow
 * (Google has no public request-indexing API for general pages).
 *
 * runtime: nodejs (uses GitHub Contents API).
 */

import {
  githubFetch,
  getBranchHeadSha,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'
import {
  hasNoIndexFlag,
  stripNoIndex,
  isFullyExpanded,
  wordCount,
} from './siteHealthFixes'
import {
  auditSiteHealthChunked,
  repairSiteHealth,
  type SiteHealthPage,
  type SiteHealthScope,
} from './siteHealth'
import { submitUrlsToIndexNow } from '@/lib/indexNow'
import { type GscFixAction, type GscIndexIssue } from '@/lib/gscIndexCoverage'

export interface IndexFixItem {
  issue: GscIndexIssue
  page: SiteHealthPage
}

export type FixStatus = 'fixed' | 'delegated' | 'recommended' | 'skipped' | 'failed' | 'requested'

export interface FixOutcome {
  url: string
  repo: string
  path: string
  action: GscFixAction
  status: FixStatus
  detail: string
  prUrl?: string | null
  newContent?: string | null
}

export interface ResolveResult {
  outcomes: FixOutcome[]
  prUrls: string[]
  requestedIndexing: Array<{ url: string; ok: boolean; detail: string }>
  summary: {
    fixed: number
    delegated: number
    recommended: number
    skipped: number
    failed: number
    requested: number
  }
  warnings: string[]
}

// ── Estate page inventory ───────────────────────────────────────────────────

/**
 * Scan every scoped repo into a flat page inventory (repo/path/url/title/words/
 * content) by draining `auditSiteHealthChunked` batches. Used by the index
 * coverage routes to join GSC verdicts to the exact source file a fix must edit.
 */
export async function collectEstatePages(
  scope: SiteHealthScope = 'all',
  batchSize = 50,
): Promise<SiteHealthPage[]> {
  const pages: SiteHealthPage[] = []
  let cursor: number | null = 0
  let guard = 0
  while (cursor !== null && guard < 200) {
    guard++
    const batch = await auditSiteHealthChunked(scope, cursor, batchSize)
    pages.push(...batch.pages)
    if (!batch.pages.length) break
    cursor = batch.nextBatch
  }
  return pages
}

/** Normalize a URL the same way the site health scan does, for joins. */
export function indexUrlKey(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return (u.host.toLowerCase() + path).toLowerCase()
  } catch {
    return url.replace(/\/+$/, '').toLowerCase()
  }
}

/** Join a GSC issue to the matching scanned page (for repo/path/title/words/content). */
export function joinIssueToPage(
  issue: GscIndexIssue,
  pages: SiteHealthPage[],
): IndexFixItem | null {
  const key = indexUrlKey(issue.url)
  const page = pages.find((p) => indexUrlKey(p.url) === key)
  return page ? { issue, page } : null
}

// ── Pure transforms ─────────────────────────────────────────────────────────

/** Normalize a URL for use as a canonical href (keep the site's trailing-slash form). */
export function canonicalHref(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '')
    return `${u.protocol}//${u.host}${path ? path + '/' : '/'}`
  } catch {
    return url
  }
}

/**
 * Ensure a page declares a self-referencing canonical URL.
 * Handles the Next.js `metadata.alternates.canonical`, a bare `canonical:`,
 * and a raw `<link rel="canonical">`. Returns the original string unchanged
 * when a correct canonical is already present.
 */
export function ensureCanonical(content: string, url: string): string {
  const target = canonicalHref(url)
  const quoted = JSON.stringify(target)

  // 1) an existing canonical value → replace it in place.
  if (/canonical\s*:\s*["'][^"']*["']/i.test(content)) {
    return content.replace(/canonical\s*:\s*(['"])[^"']*\1/i, `canonical: ${quoted}`)
  }
  // 2) a raw <link rel="canonical"> → replace the href.
  if (/<link[^>]*rel=["']canonical["']/i.test(content)) {
    return content.replace(
      /(<link[^>]*rel=["']canonical["'][^>]*href=["'])[^"']*(["'][^>]*>)/i,
      `$1${target}$2`,
    )
  }
  // 3) an existing `alternates: {` block → insert canonical inside it.
  if (/alternates\s*:\s*\{/.test(content)) {
    return content.replace(/alternates\s*:\s*\{/, `alternates: { canonical: ${quoted},`)
  }
  // 4) an existing metadata export → add alternates.canonical.
  if (/(?:export\s+)?const\s+metadata(?:\s*:\s*[A-Za-z0-9_.]+)?\s*=\s*\{/.test(content)) {
    return content.replace(
      /((?:export\s+)?const\s+metadata(?:\s*:\s*[A-Za-z0-9_.]+)?\s*=\s*\{)/,
      `$1\n  alternates: { canonical: ${quoted} },`,
    )
  }
  // 5) no metadata at all → prepend a minimal metadata export.
  return `export const metadata = { alternates: { canonical: ${quoted} } }\n\n${content}`
}

/** Escape a string for use in a RegExp literal. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove a robots.txt disallow rule that matches the page's path. Handles the
 * Next.js `disallow: ['/path/']` array form and a plain `Disallow: /path/`
 * line. Returns the original string unchanged when no matching rule exists
 * (the block may live in a CDN/static robots.txt the repo doesn't own).
 */
export function fixRobotsTxtDirective(content: string, url: string): string {
  let path: string
  try {
    path = new URL(url).pathname.replace(/\/+$/, '')
  } catch {
    return content
  }
  if (!path) return content
  const p = escapeRe(path)
  let out = content

  // quoted array entries:  '/path/',  or  "/path",
  out = out.replace(new RegExp(`^\\s*['"]${p}\\/?['"]\\s*,?\\s*\\n`, 'gm'), '')
  // plain Disallow: lines
  out = out.replace(new RegExp(`^\\s*[Dd]isallow\\s*:\\s*${p}\\/?\\s*\\n`, 'gm'), '')
  return out
}

// ── Compute (no GitHub writes) ──────────────────────────────────────────────

/** Deterministic per-file fix actions that open a PR. */
const PER_FILE_ACTIONS: Set<GscFixAction> = new Set([
  'REMOVE_NOINDEX',
  'ADD_CANONICAL',
  'FIX_CANONICAL',
  'FIX_ROBOTS_TXT',
])

function outcome(
  item: IndexFixItem,
  status: FixStatus,
  detail: string,
  extra?: { newContent?: string | null; prUrl?: string | null },
): FixOutcome {
  return {
    url: item.issue.url,
    repo: item.page.repo,
    path: item.page.path,
    action: item.issue.fixAction,
    status,
    detail,
    prUrl: extra?.prUrl ?? null,
    newContent: extra?.newContent ?? null,
  }
}

/**
 * Decide what a fix looks like for one issue, without touching GitHub.
 * `newContent` is set when the page source should be rewritten in a PR.
 */
export function computeIndexFix(item: IndexFixItem): FixOutcome {
  const { issue, page } = item
  const content = page.content ?? ''

  switch (issue.fixAction) {
    case 'REMOVE_NOINDEX': {
      if (!hasNoIndexFlag(content)) {
        return outcome(item, 'skipped', 'No noindex directive found — already indexable')
      }
      if (!isFullyExpanded(content)) {
        return outcome(item, 'recommended', `Page too thin to index (${wordCount(content)} words) — expand before removing noindex`)
      }
      const next = stripNoIndex(content)
      if (next === content) return outcome(item, 'skipped', 'No change after stripping noindex')
      return outcome(item, 'fixed', `Remove noindex (${wordCount(content)} words, fully expanded)`, { newContent: next })
    }

    case 'ADD_CANONICAL':
    case 'FIX_CANONICAL': {
      const next = ensureCanonical(content, page.url)
      if (next === content) return outcome(item, 'skipped', 'Canonical already correct')
      return outcome(item, 'fixed', issue.fixAction === 'ADD_CANONICAL' ? 'Add self-referencing canonical' : 'Correct canonical target', { newContent: next })
    }

    case 'FIX_ROBOTS_TXT': {
      const next = fixRobotsTxtDirective(content, page.url)
      if (next === content) {
        return outcome(item, 'recommended', 'No matching robots.txt rule in repo — check CDN/static robots override')
      }
      return outcome(item, 'fixed', 'Remove robots.txt disallow for this path', { newContent: next })
    }

    case 'ADD_INTERNAL_LINK':
      return outcome(item, 'delegated', 'Orphan page — Site Health repair will link it from an indexed hub')

    case 'ADD_SITEMAP':
      return outcome(item, 'delegated', 'Not in sitemap / unknown to Google — sitemap sync + request indexing')

    case 'EXPAND_THIN_CONTENT':
      return outcome(item, 'recommended', `Content too thin (${wordCount(content)} words) — re-draft/expand before requesting indexing`)

    case 'IMPROVE_QUALITY':
      return outcome(item, 'recommended', 'Improve uniqueness + internal links + canonical, then request indexing')

    case 'FIX_ROUTE':
      return outcome(item, 'recommended', '404/5xx — fix the route or restore the page')

    case 'FIX_REDIRECT':
      return outcome(item, 'recommended', 'Fix or remove the redirect chain')

    case 'FIX_ACCESS':
      return outcome(item, 'recommended', 'Fix the 401/403/4xx access block')

    case 'REQUEST_INDEXING':
      return outcome(item, 'requested', 'Request re-indexing')

    case 'NONE':
    default:
      return outcome(item, 'skipped', 'No action needed')
  }
}

// ── GitHub writes ───────────────────────────────────────────────────────────

/** Open one PR per repo containing the given file rewrites. */
async function openRepoFixPr(
  repo: string,
  files: Array<{ path: string; content: string; message: string }>,
  title: string,
  body: string,
): Promise<string | null> {
  try {
    const branch = `seo/index-fix-${Date.now().toString(36)}`.slice(0, 200)
    const mainSha = await getBranchHeadSha('kylemwalkerpr-ship-it', repo, 'main')
    await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: mainSha }),
    })
    for (const f of files) {
      await putRepoFile({
        owner: 'kylemwalkerpr-ship-it',
        repo,
        path: f.path,
        branch,
        content: f.content,
        message: f.message,
      })
    }
    const pr = await openPullRequest({
      owner: 'kylemwalkerpr-ship-it',
      repo,
      head: branch,
      base: 'main',
      title,
      body,
    })
    return pr.html_url
  } catch (err) {
    console.error(`[indexCoverageFixes] PR for ${repo} failed`, err)
    return null
  }
}

// ── Resolve (bulk) ──────────────────────────────────────────────────────────

/**
 * Resolve a batch of index-coverage issues:
 *   1. deterministic per-file fixes (noindex / canonical / robots) → PRs
 *   2. orphan + sitemap issues → Site Health repair (covers both per repo)
 *   3. request re-indexing for every page that was fixed or explicitly asked
 */
export async function resolveIndexCoverage(
  items: IndexFixItem[],
  opts: { requestIndexing?: boolean } = {},
): Promise<ResolveResult> {
  const requestIndexing = opts.requestIndexing !== false
  const outcomes: FixOutcome[] = []
  const prUrls: string[] = []
  const requestedIndexing: Array<{ url: string; ok: boolean; detail: string }> = []
  const warnings: string[] = []

  // Partition.
  const perFile: IndexFixItem[] = []
  const delegatedRepos = new Set<SiteHealthScope>()
  for (const item of items) {
    const o = computeIndexFix(item)
    outcomes.push(o)
    if (o.status === 'fixed' && o.newContent != null && PER_FILE_ACTIONS.has(o.action)) {
      perFile.push(item)
    }
    if (o.status === 'delegated') {
      delegatedRepos.add(item.page.repo)
    }
  }

  // 1) per-file fixes — batch one PR per repo.
  const byRepo = new Map<string, Array<{ item: IndexFixItem; outcome: FixOutcome }>>()
  for (const item of perFile) {
    const o = outcomes.find((x) => x.url === item.issue.url && x.status === 'fixed')!
    const list = byRepo.get(item.page.repo) ?? []
    list.push({ item, outcome: o })
    byRepo.set(item.page.repo, list)
  }
  for (const [repo, list] of byRepo.entries()) {
    const files = list.map(({ item, outcome }) => ({
      path: item.page.path,
      content: outcome.newContent!,
      message: `seo: ${outcome.detail.toLowerCase()}`,
    }))
    const labels = [...new Set(list.map(({ outcome: o }) => o.action))]
    const prUrl = await openRepoFixPr(
      repo,
      files,
      `[Content Studio] Fix indexing on ${list.length} page(s) — ${labels.join(', ')}`,
      `- Files: ${list.map(({ item }) => item.page.path).join(', ')}\n- Reasons: ${labels.join(', ')}\n- Generated by the GSC Index Coverage resolver.`,
    )
    if (prUrl) {
      prUrls.push(prUrl)
      for (const { outcome: o } of list) o.prUrl = prUrl
    } else {
      for (const { outcome: o } of list) {
        o.status = 'failed'
        o.detail = 'PR creation failed'
      }
    }
  }

  // 2) orphan + sitemap delegated items → Site Health repair (once per repo).
  for (const repo of delegatedRepos) {
    try {
      const report = await repairSiteHealth(repo, false)
      const prs = report.pullRequests?.map((p) => p.prUrl) ?? []
      if (prs.length) prUrls.push(...prs)
      for (const o of outcomes) {
        if (o.status === 'delegated' && o.repo === repo) {
          o.status = 'fixed'
          o.detail = prs.length
            ? `Site Health repair opened (orphan link + sitemap sync)`
            : 'Site Health repair ran (no PR needed)'
          if (prs.length) o.prUrl = prs[0]
        }
      }
    } catch (err) {
      warnings.push(`Site Health repair failed for ${repo}: ${err instanceof Error ? err.message.slice(0, 120) : err}`)
      for (const o of outcomes) {
        if (o.status === 'delegated' && o.repo === repo) o.status = 'failed'
      }
    }
  }

  // 3) nudge re-crawl for fixed + requested pages. Google exposes no public
  //    request-indexing API for general pages (the UI button is not in the
  //    REST API, and the Indexing API is job-postings/live-video only), so we
  //    submit to IndexNow (Bing/Yandex/Seznam/Naver) — Google reads the same
  //    crawl-scheduling signals — and rely on the sitemap sync from step 2.
  if (requestIndexing) {
    const toRequest = outcomes.filter((o) => o.status === 'fixed' || o.status === 'requested')
    const urls = [...new Set(toRequest.map((o) => o.url))]
    if (urls.length) {
      try {
        const r = await submitUrlsToIndexNow(urls)
        for (const u of urls) {
          requestedIndexing.push({ url: u, ok: true, detail: `indexnow ${r?.status ?? 'submitted'}` })
        }
        warnings.push("Google's Request Indexing is UI-only; submitted to IndexNow — Google re-crawl follows sitemap freshness + internal links.")
      } catch (e) {
        for (const u of urls) {
          requestedIndexing.push({ url: u, ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : String(e) })
        }
      }
    }
  }

  const summary = {
    fixed: outcomes.filter((o) => o.status === 'fixed').length,
    delegated: outcomes.filter((o) => o.status === 'delegated').length,
    recommended: outcomes.filter((o) => o.status === 'recommended').length,
    skipped: outcomes.filter((o) => o.status === 'skipped').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    requested: requestedIndexing.filter((r) => r.ok).length,
  }

  return { outcomes, prUrls, requestedIndexing, summary, warnings }
}
