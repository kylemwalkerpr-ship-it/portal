/**
 * portal-patch/lib/seoFactory/siteHealthComplete.ts
 * Full-featured site health orchestrator.
 *
 * Ties together: tree scan → page audit → interlink analysis →
 * orphan classification → noindex detection → sitemap diff →
 * repair (orphans + noindex + sitemap) → live URL verify →
 * health scoring → fix history → export.
 *
 * Every function below can be called individually by the UI panel
 * or chained via `runFullSiteHealthCheck()` for a one-click fix-all.
 */
import { Buffer } from 'node:buffer'
import { githubFetch, putRepoFile } from '@/lib/githubContents'
import { verifyLiveUrl, type LiveVerifyResult } from './liveVerify'
import type {
  SiteHealthScope,
  SiteHealthPage,
} from './siteHealth'
import {
  CONFIGS,
  auditSiteHealthChunked,
  repairSiteHealthChunked,
} from './siteHealth'
import {
  fixNoIndexPagesChunked,
  collectShippedNoIndexContent,
  readFixHistory,
  appendFixHistory,
  hasNoIndexFlag,
  wordCount,
  isFullyExpanded,
  stripNoIndex,
  type NoIndexCandidate,
  type SiteHealthFixRecord,
} from './siteHealthFixes'

type RepoId = Exclude<SiteHealthScope, 'all'>

// ── Types ──────────────────────────────────────────────────────────

export interface SiteHealthScore {
  repo: RepoId
  score: number          // 0-100
  pages: number
  orphans: number
  noindex: number
  thinPages: number      // < 400 words
  healthy: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface FullSiteHealthReport {
  scope: SiteHealthScope
  scannedAt: string
  totalPages: number
  totalOrphans: number
  totalNoindex: number
  totalThinPages: number
  pages: SiteHealthPage[]
  orphans: SiteHealthPage[]
  noindexPages: SiteHealthPage[]
  thinPages: SiteHealthPage[]
  scores: SiteHealthScore[]
  repairs: FullRepairResult
  liveResults: LiveVerifyResult[]
  sitemapDiffs: SitemapDiffResult[]
  fixHistory: SiteHealthFixRecord[]
  exportFormats?: ('json' | 'csv')[]
}

export interface FullRepairResult {
  orphansFixed: number
  noindexFixed: number
  sitemapsUpdated: number
  prUrls: string[]
  errors: string[]
  dryRun: boolean
}

export interface SitemapDiffResult {
  repo: RepoId
  liveReachable: boolean
  liveUrlCount: number
  expectedCount: number
  missing: string[]
  stale: string[]
  status: 'ok' | 'drift' | 'error'
  detail: string
}

export interface SiteHealthCheckOptions {
  /** If true, only scan/audit; no repairs or Git writes. */
  dryRun?: boolean
  /** Maximum pages to scan per batch (chunked scan). */
  batchSize?: number
  /** Scope to run on (default 'all'). */
  scope?: SiteHealthScope
  /** If true, run live URL verification after repairs. */
  verifyLive?: boolean
  /** If true, auto-remove noindex from fully-expanded pages. */
  fixNoindex?: boolean
  /** If true, auto-repair orphan pages with interlinks. */
  fixOrphans?: boolean
  /** If true, auto-sync sitemaps after repairs. */
  fixSitemaps?: boolean
}

// ── Scoring ────────────────────────────────────────────────────────

/** Weighted health score per repo: fewer orphans+noindex+thin = higher score. */
export function computeSiteHealthScore(pages: SiteHealthPage[]): SiteHealthScore | null {
  if (!pages.length) return null
  const repo = pages[0].repo
  const total = pages.length
  const orphans = pages.filter((p) => (p.inboundLinks ?? 0) === 0 && !p.url.endsWith('/')).length
  const noindex = pages.filter((p) => p.noindex === true).length
  const thin = pages.filter((p) => (p.words ?? 0) > 0 && (p.words ?? 0) < 400).length
  const healthy = total - orphans - noindex - thin
  const score = Math.max(0, Math.round(100 - (orphans * 3) - (noindex * 5) - (thin * 2)))
  let grade: SiteHealthScore['grade'] = 'F'
  if (score >= 90) grade = 'A'
  else if (score >= 75) grade = 'B'
  else if (score >= 55) grade = 'C'
  else if (score >= 35) grade = 'D'
  return { repo, score, pages: total, orphans, noindex, thinPages: thin, healthy, grade }
}

// ── Sitemap diff ───────────────────────────────────────────────────

/** Compare expected sitemap entries from the audit against the live sitemap.xml. */
export async function generateSitemapDiff(repo: SiteHealthScope, expectedUrls: string[]): Promise<SitemapDiffResult | null> {
  const configs = repo === 'all'
    ? [CONFIGS.caseworks, CONFIGS['yousafe-consultancy'], CONFIGS.portal]
    : [CONFIGS[repo as RepoId]]
  const results: SitemapDiffResult[] = []
  for (const config of configs) {
    const base = config.baseUrl
    try {
      const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) {
        results.push({ repo: config.repo, liveReachable: false, liveUrlCount: 0, expectedCount: expectedUrls.length, missing: [], stale: [], status: 'error', detail: `sitemap HTTP ${res.status}` })
        continue
      }
      const text = await res.text()
      const locs = [...text.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map((m) => m[1].replace(/\/+$/, '/'))
      const expSet = new Set(expectedUrls.filter((u) => u.includes(new URL(base).hostname)).map((u) => u.replace(/\/+$/, '/')))
      const liveSet = new Set(locs)
      const missing = [...expSet].filter((u) => !liveSet.has(u)).slice(0, 30)
      const stale = [...liveSet].filter((u) => !expSet.has(u)).slice(0, 30)
      results.push({
        repo: config.repo, liveReachable: true, liveUrlCount: locs.length,
        expectedCount: expSet.size, missing, stale,
        status: missing.length + stale.length === 0 ? 'ok' : 'drift',
        detail: missing.length ? `${missing.length} missing, ${stale.length} stale` : 'in sync',
      })
    } catch {
      results.push({ repo: config.repo, liveReachable: false, liveUrlCount: 0, expectedCount: expectedUrls.length, missing: [], stale: [], status: 'error', detail: 'sitemap fetch failed' })
    }
  }
  return results[0] ?? null
}

// ── Live verify helper ──────────────────────────────────────────────

/** Ping a set of URLs and return live verification results (up to 10). */
export async function liveVerifyPages(urls: string[]): Promise<LiveVerifyResult[]> {
  const results: LiveVerifyResult[] = []
  const batch = urls.slice(0, 10)
  const settled = await Promise.allSettled(
    batch.map((url) => verifyLiveUrl({ canonicalUrl: url }))
  )
  for (const r of settled) {
    if (r.status === 'fulfilled') results.push(r.value)
    else results.push({ ok: false, liveUrl: '', httpStatus: null, verifiedAt: new Date().toISOString(), wordCount: null, auditScore: null, humanScore: null, hasNoIndex: null, purgeStatus: null, sitemapStatus: null, indexNowStatus: null, error: String((r as any).reason ?? 'unknown').slice(0, 200) })
  }
  return results
}

// ── Full orchestrator ────────────────────────────────────────────────

/**
 * Run a complete site health check: scan → classify → score → (optional) repair → verify.
 * Designed so the UI panel can call this with `dryRun: true` for a preview,
 * then call it again with `fixOrphans / fixNoindex / fixSitemaps: true` for the fix-all.
 */
export async function runFullSiteHealthCheck(opts: SiteHealthCheckOptions = {}): Promise<FullSiteHealthReport> {
  const scope = opts.scope ?? 'all'
  const batchSize = Math.min(50, Math.max(10, opts.batchSize ?? 30))

  // ── Phase 1: Scan all pages (chunked) ────────────────────────────
  const allPages: SiteHealthPage[] = []
  let cursor: number | null = 0
  while (cursor !== null) {
    const batch = await auditSiteHealthChunked(scope, cursor, batchSize)
    allPages.push(...batch.pages)
    cursor = batch.nextBatch
  }

  // ── Phase 2: Classify ────────────────────────────────────────────
  const orphans = allPages.filter((p) => (p.inboundLinks ?? 0) === 0 && !p.url.endsWith('/'))
  const noindexPages = allPages.filter((p) => p.noindex === true)
  const thinPages = allPages.filter((p) => (p.words ?? 0) > 0 && (p.words ?? 0) < 400)

  // ── Phase 3: Score per repo ──────────────────────────────────────
  const scores: SiteHealthScore[] = []
  const seenRepos = new Set<RepoId>()
  for (const p of allPages) {
    if (seenRepos.has(p.repo)) continue
    seenRepos.add(p.repo)
    const repoPages = allPages.filter((x) => x.repo === p.repo)
    const s = computeSiteHealthScore(repoPages)
    if (s) scores.push(s)
  }

  // ── Phase 4: Repairs ─────────────────────────────────────────────
  const repairResult: FullRepairResult = { orphansFixed: 0, noindexFixed: 0, sitemapsUpdated: 0, prUrls: [], errors: [], dryRun: opts.dryRun !== false }
  const logEntries: SiteHealthFixRecord[] = []

  if (opts.fixOrphans && orphans.length && !opts.dryRun) {
    try {
      let oc: number | null = 0
      while (oc !== null) {
        const r = await repairSiteHealthChunked(scope, oc, batchSize, false)
        repairResult.orphansFixed += r.orphansFixed
        if (r.prUrl) repairResult.prUrls.push(r.prUrl)
        oc = r.nextBatch
      }
      for (const o of orphans.slice(0, 20)) {
        logEntries.push({
          id: `orphan_${Date.now().toString(36)}_${o.path.replace(/\//g, '_').slice(0, 30)}`,
          timestamp: new Date().toISOString(),
          action: 'orphan', repo: o.repo, path: o.path, url: o.url,
          detail: `Repaired orphan page: ${o.title || o.path}`,
        })
      }
    } catch (e: any) {
      repairResult.errors.push(`orphan repair: ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }

  if (opts.fixNoindex && !opts.dryRun) {
    try {
      const candidates: NoIndexCandidate[] = noindexPages
        .filter((p) => (p.words ?? 0) >= 400)
        .map((p) => ({ repo: p.repo, path: p.path, url: p.url, title: p.title, words: p.words! }))
      // Batch backfill: already-shipped content files (md/mdx) that are fully
      // expanded but still carry a noindex directive become fix candidates too.
      let contentCursor: number | null = 0
      while (contentCursor !== null) {
        const contentBatch = await collectShippedNoIndexContent(scope, contentCursor, batchSize)
        candidates.push(...contentBatch.candidates)
        contentCursor = contentBatch.nextBatch
      }
      if (candidates.length) {
        let nc: number | null = 0
        while (nc !== null) {
          const r = await fixNoIndexPagesChunked(scope, nc, batchSize, candidates, false)
          repairResult.noindexFixed += r.fixed.length
          if (r.prUrl) repairResult.prUrls.push(r.prUrl)
          nc = r.nextBatch
        }
        for (const f of candidates.slice(0, 20)) {
          logEntries.push({
            id: `idx_${Date.now().toString(36)}_${f.path.replace(/\//g, '_').slice(0, 30)}`,
            timestamp: new Date().toISOString(),
            action: 'noindex', repo: f.repo, path: f.path, url: f.url,
            detail: `Removed noindex from fully-expanded page (${f.words}w): ${f.title || f.path}`,
          })
        }
      }
    } catch (e: any) {
      repairResult.errors.push(`noindex fix: ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }

  if (opts.fixSitemaps && !opts.dryRun) {
    try {
      for (const config of [CONFIGS.caseworks, CONFIGS['yousafe-consultancy'], CONFIGS.portal]) {
        if (scope !== 'all' && config.repo !== scope) continue
        const repoPages = allPages.filter((p) => p.repo === config.repo && p.indexable)
        const urls = repoPages.map((p) => p.url)
        const diff = await generateSitemapDiff(config.repo, urls)
        if (diff && diff.status !== 'ok') {
          // Regenerate sitemap via repairSiteHealthChunked (it handles sitemap writes)
          const r = await repairSiteHealthChunked(config.repo, 0, batchSize, false)
          repairResult.sitemapsUpdated++
          if (r.prUrl) repairResult.prUrls.push(r.prUrl)
        }
      }
    } catch (e: any) {
      repairResult.errors.push(`sitemap sync: ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }

  if (logEntries.length) await appendFixHistory(logEntries).catch(() => {})

  // ── Phase 5: Live verify ─────────────────────────────────────────
  let liveResults: LiveVerifyResult[] = []
  if (opts.verifyLive) {
    const urls = allPages.filter((p) => p.indexable).slice(0, 10).map((p) => p.url)
    liveResults = await liveVerifyPages(urls)
  }

  // ── Phase 6: Sitemap diffs ───────────────────────────────────────
  const sitemapDiffs: SitemapDiffResult[] = []
  for (const config of [CONFIGS.caseworks, CONFIGS['yousafe-consultancy'], CONFIGS.portal]) {
    if (scope !== 'all' && config.repo !== scope) continue
    const repoPages = allPages.filter((p) => p.repo === config.repo)
    const diff = await generateSitemapDiff(config.repo as RepoId, repoPages.map((p) => p.url))
    if (diff) sitemapDiffs.push(diff)
  }

  // ── Phase 7: Fix history ─────────────────────────────────────────
  const fixHistory = await readFixHistory().catch(() => [] as SiteHealthFixRecord[])

  return {
    scope,
    scannedAt: new Date().toISOString(),
    totalPages: allPages.length,
    totalOrphans: orphans.length,
    totalNoindex: noindexPages.length,
    totalThinPages: thinPages.length,
    pages: allPages,
    orphans,
    noindexPages,
    thinPages,
    scores,
    repairs: repairResult,
    liveResults,
    sitemapDiffs,
    fixHistory: fixHistory.slice(-50),
  }
}

/** Export the report as JSON string or CSV of the pages table. */
export function exportSiteHealthReport(report: FullSiteHealthReport, format: 'json' | 'csv' = 'json'): string {
  if (format === 'csv') {
    const header = 'repo,host,path,url,title,indexable,noindex,words,inboundLinks\n'
    const rows = report.pages.map((p) =>
      [p.repo, p.host, p.path, p.url, `"${(p.title || '').replace(/"/g, '""')}"`, p.indexable, p.noindex ?? '', p.words ?? '', p.inboundLinks ?? 0].join(','),
    )
    return header + rows.join('\n')
  }
  const { pages: _, ...summary } = report
  return JSON.stringify({ ...summary, pageCount: report.totalPages }, null, 2)
}
