import { Buffer } from 'node:buffer'
import { githubFetch, getBranchHeadSha, openPullRequest, putRepoFile } from '@/lib/githubContents'
import { type SiteHealthScope } from './siteHealth'

type RepoId = Exclude<SiteHealthScope, 'all'>

/** Minimum word count for a page to be considered "fully expanded" and safe to index. */
export const FULLY_EXPANDED_MIN_WORDS = 400

export type NoIndexCandidate = {
  repo: RepoId
  path: string
  url: string
  title: string
  words: number
}

export type SiteHealthFixRecord = {
  id: string
  timestamp: string
  action: 'interlink' | 'noindex' | 'sitemap' | 'orphan'
  repo: RepoId
  path: string
  url?: string
  detail: string
  prUrl?: string
}

const FIX_LOG_PATH = '.content-studio/site-health-fixes.json'
const FIX_LOG_REPO: RepoId = 'portal'

/** True when page content carries an explicit noindex robots directive. */
export function hasNoIndexFlag(content: string): boolean {
  return /robots\s*[:=][\s\S]{0,160}(?:index\s*:\s*false|['"]noindex['"]|noindex\b)/i.test(content)
}

/** Rough word count of the visible prose (strips code, imports, JSX plumbing). */
export function wordCount(content: string): number {
  const body = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"]/g, ' ')
    .replace(/[{}\[\]()<>=,;:.?!|&*+_'"`#@%^~\\/-]+/g, ' ')
  return body.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length
}

/** True when the page has enough real prose to be indexable. */
export function isFullyExpanded(content: string): boolean {
  return wordCount(content) >= FULLY_EXPANDED_MIN_WORDS
}

/**
 * Remove the noindex directive so the page becomes indexable.
 * Handles the common Next.js patterns found across the repos:
 *   robots: { index: false, follow: false }  →  robots: { index: true, follow: true }
 *   robots: 'noindex' / 'noindex, nofollow'  →  robots: 'index, follow'
 *   export const robots = ... noindex
 * Returns the original string unchanged when no directive is found.
 */
export function stripNoIndex(content: string): string {
  let out = content

  // robots: { index: false, ... } → robots: { index: true, ... }
  out = out.replace(
    /(robots\s*:\s*\{)([\s\S]*?)(\})/g,
    (block, head: string, inner: string, tail: string) => {
      const fixed = inner.replace(/index\s*:\s*false/g, 'index: true')
      return fixed === inner ? block : `${head}${fixed}${tail}`
    },
  )

  // robots: 'noindex' / "noindex" / 'noindex, nofollow' / "noindex, follow" → index, follow
  out = out.replace(
    /(robots\s*:\s*['"])(noindex(?:\s*,\s*(?:nofollow|follow))?)(['"])/gi,
    "$1index, follow$3",
  )

  // meta robots name="robots" content="noindex" style tags
  out = out.replace(
    /(<meta[^>]*name=["']robots["'][^>]*content=["'])(noindex(?:\s*,\s*nofollow)?)(["'])/gi,
    '$1index, follow$3',
  )

  // export const robots = 'noindex' style
  out = out.replace(
    /(const\s+robots\s*=\s*['"])(noindex(?:\s*,\s*(?:nofollow|follow))?)(['"])/gi,
    "$1index, follow$3",
  )

  return out
}

// ---------- Persisted fix history (stored in the portal repo) ----------

export async function readFixHistory(): Promise<SiteHealthFixRecord[]> {
  try {
    const file = await githubFetch(
      `/repos/kylemwalkerpr-ship-it/${FIX_LOG_REPO}/contents/${FIX_LOG_PATH}?ref=main`,
    )
    const raw = Buffer.from(String(file.content || ''), 'base64').toString('utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SiteHealthFixRecord[]) : []
  } catch {
    return []
  }
}

/**
 * Append fix records to the persisted history. Caps the log at the newest 2000 entries.
 * Commits directly to the portal repo main so the log is always current.
 */
export async function appendFixHistory(entries: SiteHealthFixRecord[]): Promise<void> {
  if (!entries.length) return
  const existing = await readFixHistory()
  const merged = [...existing, ...entries].slice(-2000)
  let sha: string | undefined
  try {
    const file = await githubFetch(
      `/repos/kylemwalkerpr-ship-it/${FIX_LOG_REPO}/contents/${FIX_LOG_PATH}?ref=main`,
    )
    sha = file.sha as string
  } catch {
    /* first write — no sha needed */
  }
  const b64 = Buffer.from(JSON.stringify(merged, null, 2), 'utf8').toString('base64')
  await githubFetch(
    `/repos/kylemwalkerpr-ship-it/${FIX_LOG_REPO}/contents/${FIX_LOG_PATH}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'chore(seo): append site health fix history',
        content: b64,
        branch: 'main',
        ...(sha ? { sha } : {}),
      }),
    },
  )
}

// ---------- Chunked noindex removal ----------

/**
 * Remove the noindex directive from fully-expanded pages in batches.
 * The audit phase already collected candidates; here we only fetch the
 * files being fixed (plus a few hub/sitemap writes), keeping well under
 * the Cloudflare Workers 50-subrequest limit.
 */
export async function fixNoIndexPagesChunked(
  scope: SiteHealthScope,
  batchStart: number,
  batchSize: number,
  candidates: NoIndexCandidate[],
  dryRun: boolean,
): Promise<{
  fixed: Array<{ repo: RepoId; path: string; url: string; title: string }>
  skipped: Array<{ repo: RepoId; path: string; words: number }>
  totalCandidates: number
  nextBatch: number | null
  prUrl: string | null
}> {
  const batch = candidates.slice(batchStart, batchStart + batchSize)
  if (!batch.length) {
    return { fixed: [], skipped: [], totalCandidates: candidates.length, nextBatch: null, prUrl: null }
  }

  const fixed: Array<{ repo: RepoId; path: string; url: string; title: string }> = []
  const skipped: Array<{ repo: RepoId; path: string; words: number }> = []
  const logEntries: SiteHealthFixRecord[] = []
  const filesToWrite: Array<{ repo: RepoId; path: string; content: string; message: string }> = []

  for (const c of batch) {
    let source: string
    try {
      const file = await githubFetch(
        `/repos/kylemwalkerpr-ship-it/${c.repo}/contents/${c.path}?ref=main`,
      )
      source = Buffer.from(String(file.content || ''), 'base64').toString('utf8')
    } catch {
      skipped.push({ repo: c.repo, path: c.path, words: c.words })
      continue
    }
    const stripped = stripNoIndex(source)
    if (stripped === source) {
      skipped.push({ repo: c.repo, path: c.path, words: c.words })
      continue
    }
    if (!dryRun) {
      filesToWrite.push({
        repo: c.repo,
        path: c.path,
        content: stripped,
        message: `seo: enable indexing — page fully expanded (${c.words} words)`,
      })
    }
    fixed.push({ repo: c.repo, path: c.path, url: c.url, title: c.title })
    logEntries.push({
      id: `noindex-${Date.now()}-${c.path}`,
      timestamp: new Date().toISOString(),
      action: 'noindex',
      repo: c.repo,
      path: c.path,
      url: c.url,
      detail: `Removed noindex — ${c.words} words, now indexable`,
    })
  }

  let prUrl: string | null = null
  if (!dryRun && filesToWrite.length) {
    const byRepo = new Map<RepoId, typeof filesToWrite>()
    for (const f of filesToWrite) {
      const list = byRepo.get(f.repo) ?? []
      list.push(f)
      byRepo.set(f.repo, list)
    }
    for (const [repo, files] of byRepo.entries()) {
      try {
        const branch = `seo/enable-indexing-${Date.now().toString(36)}`.slice(0, 200)
        const sha = await getBranchHeadSha('kylemwalkerpr-ship-it', repo, 'main')
        await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/git/refs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
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
          title: `[Content Studio] Enable indexing on ${files.length} fully expanded page(s)`,
          body: `- Files: ${files.map((f) => f.path).join(', ')}\n- Reason: fully expanded (≥ ${FULLY_EXPANDED_MIN_WORDS} words)`,
        })
        prUrl = pr.html_url
        for (const entry of logEntries.filter((e) => e.repo === repo)) {
          entry.prUrl = pr.html_url
        }
      } catch (err) {
        console.error(`[site-health-fixes] PR for ${repo} failed`, err)
      }
    }
  }

  if (!dryRun && logEntries.length) {
    try {
      await appendFixHistory(logEntries)
    } catch (err) {
      console.error('[site-health-fixes] history append failed', err)
    }
  }

  const nextBatch = batchStart + batchSize < candidates.length ? batchStart + batchSize : null
  return { fixed, skipped, totalCandidates: candidates.length, nextBatch, prUrl }
}

// ---------- Repair that logs to history (replaces the un-logged chunked repair) ----------

export type RepairRequest = {
  repo: RepoId
  hubPath: string
  links: Array<{ url: string; title: string }>
  sitemapPaths: string[]
  orphanPaths: string[]
}

/** Persist a batch of interlink/orphan repairs to the fix history. */
export async function logRepairs(repairs: Array<{
  repo: RepoId
  hubPath: string
  orphanPaths: string[]
  prUrl?: string | null
}>): Promise<void> {
  const entries: SiteHealthFixRecord[] = []
  for (const r of repairs) {
    for (const path of r.orphanPaths) {
      entries.push({
        id: `interlink-${Date.now()}-${path}`,
        timestamp: new Date().toISOString(),
        action: 'interlink',
        repo: r.repo,
        path,
        detail: `Linked from hub ${r.hubPath}`,
        prUrl: r.prUrl ?? undefined,
      })
    }
  }
  if (entries.length) {
    try {
      await appendFixHistory(entries)
    } catch (err) {
      console.error('[site-health-fixes] repair history append failed', err)
    }
  }
}

/** Export CONFIGS re-export for convenience. */
export const SITE_HEALTH_SCOPES: SiteHealthScope[] = ['all', 'caseworks', 'yousafe-consultancy', 'portal']

// ── Single-page repair ────────────────────────────────────────────

/** Targeted repair for one page: remove noindex or add to interlink hub. */
export async function repairSinglePage(
  repo: RepoId,
  path: string,
  action: 'remove-noindex' | 'add-interlink' | 'ping-live',
): Promise<{ ok: boolean; detail: string; prUrl?: string }> {
  try {
    const file = await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/contents/${path}?ref=main`)
    let content = Buffer.from(String(file.content || ''), 'base64').toString('utf8')
    const sha = file.sha as string
    let message = ''
    if (action === 'remove-noindex') {
      const stripped = stripNoIndex(content)
      if (stripped === content) return { ok: true, detail: 'No noindex directive found — already indexable' }
      content = stripped
      message = 'seo: enable indexing on single page'
    } else if (action === 'add-interlink') {
      // Append a thin interlink block at bottom if not already present
      if (!content.includes('You might also find helpful')) {
        content = content.trimEnd() + '\n\n---\n\n*You might also find helpful:* [Browse all articles](/)'
      }
      message = 'seo: add interlink hook to orphan page'
    } else {
      // ping-live — no file change, just verify the live URL
      const url = inferUrl(repo, path)
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      return { ok: res.ok, detail: res.ok ? `Live URL ${url} — HTTP ${res.status}` : `Live URL ${url} — HTTP ${res.status}` }
    }
    const branch = `seo/single-fix-${Date.now().toString(36)}`.slice(0, 200)
    const headSha = await getBranchHeadSha('kylemwalkerpr-ship-it', repo, 'main')
    await githubFetch(`/repos/kylemwalkerpr-ship-it/${repo}/git/refs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: headSha }),
    })
    await putRepoFile({ owner: 'kylemwalkerpr-ship-it', repo, path, branch, content, message })
    const pr = await openPullRequest({
      owner: 'kylemwalkerpr-ship-it', repo, head: branch, base: 'main',
      title: `[Content Studio] ${action} — ${path.split('/').pop()?.replace(/\.tsx?$/, '') || path}`,
      body: `- File: ${path}\n- Action: ${action}`,
    })
    
    await appendFixHistory([{
      id: `single_${action}_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      action: action === 'remove-noindex' ? 'noindex' : 'interlink',
      repo, path, detail: `${action}: ${path}`, prUrl: pr.html_url,
    }])
    
    return { ok: true, detail: `${action} PR opened: ${pr.html_url}`, prUrl: pr.html_url }
  } catch (e: any) {
    return { ok: false, detail: String(e?.message ?? e).slice(0, 300) }
  }
}

function inferUrl(repo: RepoId, path: string): string {
  const configs: Record<string, string> = {
    caseworks: 'https://legal.yousafeconsultancy.com',
    portal: 'https://portal.yousafeconsultancy.com',
    'yousafe-consultancy': 'https://yousafeconsultancy.com',
  }
  const base = configs[repo] || 'https://yousafeconsultancy.com'
  const route = path.replace(/^app\//, '').replace(/\/page\.tsx$/, '')
  return `${base}/${route}`.replace(/\/+/g, '/').replace(':/', '://')
}

// ── Batch repair all ─────────────────────────────────────────────

/** One-call fix-all: orphans + noindex + sitemap sync across scoped repos. */
export async function batchRepairAll(
  scope: SiteHealthScope,
  dryRun: boolean,
): Promise<{
  orphanFixCount: number
  noindexFixCount: number
  sitemapUpdateCount: number
  prUrls: string[]
  errors: string[]
}> {
  const result = { orphanFixCount: 0, noindexFixCount: 0, sitemapUpdateCount: 0, prUrls: [] as string[], errors: [] as string[] }
  // Delegate to the full orchestrator (siteHealthComplete) when called from UI;
  // here we provide a lightweight standalone version for route handlers.
  // The heavy lifting is in siteHealthComplete.runFullSiteHealthCheck.
  try {
    const { runFullSiteHealthCheck } = await import('./siteHealthComplete')
    const report = await runFullSiteHealthCheck({
      scope, dryRun, fixOrphans: !dryRun, fixNoindex: !dryRun, fixSitemaps: !dryRun,
      batchSize: 20,
    })
    result.orphanFixCount = report.repairs.orphansFixed
    result.noindexFixCount = report.repairs.noindexFixed
    result.sitemapUpdateCount = report.repairs.sitemapsUpdated
    result.prUrls = report.repairs.prUrls
    result.errors = report.repairs.errors
  } catch (e: any) {
    result.errors.push(String(e?.message ?? e).slice(0, 300))
  }
  return result
}
