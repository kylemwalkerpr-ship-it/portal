/**
 * Ship generated content to estate repos — THE ONLY Git write door for Content Studio.
 *
 * Architecture (docs/CONTENT_STUDIO_ARCHITECTURE.md):
 *   - Unattended: PR → wait for CI → merge (never direct-push main)
 *   - Human-approved: may direct-commit main for fast CF deploy
 *   - All writes via putRepoFile (SHA resolve + 422/409 retry)
 */

import type { OwnerPlan } from './ownership'
import { assertPlanRepoConsistency, HOST_REPO } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy } from './audit'
import { renderTargetFile, buildBlogPostEntry, insertBlogPostIntoData } from './renderTarget'
import { assertShipAllowed } from './shipGate'
import { assertNoRouteSubtypeConflict } from './routeSubtypeGuard'
import { assertContentDepth } from './contentDepth'
import { assertQualityGate, assertRhythmWithinRepairRange } from './contentQualityGate'
import { applyDeterministicRepairs } from './editorialScaffold'
import {
  createBranchFrom,
  getBranchHeadSha,
  getFileBlobSha,
  getRepoFileContent,
  githubFetch,
  mergePullRequest as mergePrApi,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'
import { submitUrlsToIndexNow } from '@/lib/indexNow'
import { verifyLiveInBackground } from './liveVerify'
import { stripNoIndex } from './siteHealthFixes'

/** pr = open PR only; autodeploy = commit main (human only); merge = PR→CI→main */
export type ShipMode = 'pr' | 'autodeploy' | 'merge'

export interface ShipResult {
  mode: ShipMode
  repo: string
  owner: string
  path: string
  branch?: string
  prUrl?: string
  prNumber?: number
  commitSha?: string
  mergeCommitSha?: string
  canonicalUrl: string
  status: 'pr_created' | 'deployed' | 'merged' | 'dry_run'
  dryRun?: boolean
  /** Human-approved ships skip automated audit gates (still refuse hard ownership blockers). */
  humanApproved?: boolean
  /** CI state when merge waited for checks */
  ciState?: 'success' | 'failure' | 'pending' | 'none' | 'timeout'
  ciNote?: string
}

/** Poll GitHub check-runs / combined status until green, red, or timeout. */
async function waitForCommitCi(
  owner: string,
  repo: string,
  sha: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<{ state: NonNullable<ShipResult['ciState']>; note: string }> {
  const timeoutMs = opts?.timeoutMs ?? 3 * 60 * 1000
  const intervalMs = opts?.intervalMs ?? 15_000
  const deadline = Date.now() + timeoutMs
  let lastNote = 'no checks yet'
  let emptyPolls = 0

  while (Date.now() < deadline) {
    try {
      const [checksRes, statusRes] = await Promise.all([
        githubFetch(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`).catch(
          () => null,
        ),
        githubFetch(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null),
      ])

      const runs = (checksRes?.check_runs || []) as Array<{
        name?: string
        status?: string
        conclusion?: string | null
      }>
      if (runs.length) {
        emptyPolls = 0
        const pending = runs.some((r) => r.status !== 'completed')
        const failed = runs.some((r) =>
          ['failure', 'timed_out', 'cancelled', 'action_required'].includes(
            String(r.conclusion || ''),
          ),
        )
        const names = runs.map((r) => `${r.name}:${r.conclusion || r.status}`).join(', ')
        lastNote = names.slice(0, 280)
        if (failed) return { state: 'failure', note: lastNote }
        if (!pending) return { state: 'success', note: lastNote }
      } else if (statusRes && statusRes.state && statusRes.state !== 'pending') {
        const st = String(statusRes.state)
        lastNote = `combined:${st}`
        if (st === 'success') return { state: 'success', note: lastNote }
        if (st === 'failure' || st === 'error') return { state: 'failure', note: lastNote }
      } else {
        emptyPolls++
        lastNote = 'waiting for check-runs to appear'
        // After ~6 polls (~2 min) with zero checks, treat as "no required CI" and allow merge attempt.
        // GitHub Actions can take 30-90s to start runners, so 3 polls was too early.
        if (emptyPolls >= 6) {
          return { state: 'none', note: 'no check-runs registered — merge allowed' }
        }
      }
    } catch (e) {
      lastNote = e instanceof Error ? e.message : 'CI poll error'
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  // Timeout with pending checks: still try merge (branch protection may enforce)
  return { state: 'timeout', note: lastNote }
}

// ── Back-compat re-exports (tests / older imports) ──────────────────────────
export const gh = githubFetch
export const getMainSha = getBranchHeadSha
export const getFileSha = getFileBlobSha
export async function putContent(opts: {
  owner: string
  repo: string
  path: string
  branch: string
  content: string
  message: string
  sha?: string
}): Promise<{ commitSha: string }> {
  const r = await putRepoFile(opts)
  return { commitSha: r.commitSha }
}

export async function mergePullRequest(opts: {
  owner: string
  repo: string
  prNumber: number
  commitTitle?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
}): Promise<{ merged: boolean; sha?: string; message: string }> {
  return mergePrApi(opts)
}

/**
 * Blog ships write TWO files: the static page.tsx (rendered by renderTargetFile)
 * AND an index entry in landing-page/lib/blog-data.ts so the blog index page
 * and the [slug] fallback renderer list the new post. Appends the entry to the
 * existing file on the branch, creating a second commit on the same branch.
 */
async function maybeAppendBlogIndex(opts: {
  owner: string
  repo: string
  branch: string
  plan: OwnerPlan
  content: string
  title: string
  region: string
  primaryKeyword: string
}): Promise<{ path: string; appended: boolean; note?: string; commitSha?: string }> {
  // Only apex yousafe-consultancy blog pages get index entries
  const isBlog =
    opts.repo === 'yousafe-consultancy' &&
    /app\/blog\/[^/]+\/page\.tsx$/.test(opts.plan.filePath)
  if (!isBlog) {
    return { path: 'landing-page/lib/blog-data.ts', appended: false, note: 'not a blog' }
  }

  const dataPath = 'landing-page/lib/blog-data.ts'
  try {
    const current = await getRepoFileContent(opts.owner, opts.repo, dataPath, opts.branch)
    if (!current) {
      return { path: dataPath, appended: false, note: 'blog-data.ts not found on branch' }
    }
    const entry = buildBlogPostEntry({
      plan: opts.plan,
      content: opts.content,
      title: opts.title,
      region: opts.region,
    })
    const updated = insertBlogPostIntoData(current, entry)
    const put = await putRepoFile({
      owner: opts.owner,
      repo: opts.repo,
      path: dataPath,
      branch: opts.branch,
      content: updated,
      message: `seo-factory: index blog "${opts.title}" in blog-data.ts`,
    })
    return { path: dataPath, appended: true, note: `entry added (${put.attempts} attempt(s))`, commitSha: put.commitSha }
  } catch (e) {
    return {
      path: dataPath,
      appended: false,
      note: `append failed (non-fatal): ${e instanceof Error ? e.message : 'unknown'}`,
    }
  }
}

/**
 * Human-approved path: commit straight to main when possible.
 * Skips automated score gates (admin already reviewed content in the studio).
 * Still refuses hard ownership/host mismatches.
 */
export async function shipContent(opts: {
  mode: ShipMode
  plan: OwnerPlan
  content: string
  title: string
  region: string
  contentType: string
  primaryKeyword: string
  audit: SeoFactoryAudit
  dryRun?: boolean
  jobId?: string
  /** Admin explicitly approved in Content Studio — prefer main deploy */
  humanApproved?: boolean
  /** Required short keywords (≤3 words each). The master gate fails ship if any are missing. */
  requiredShortKeywords?: string[]
  /** Required long-tail keywords (≥4 words each). The master gate fails ship if any are missing. */
  requiredLongTailKeywords?: string[]
  /** Competing estate pages for cannibalization detection (from the coverage map
   *  / radar). Passed through to the quality gate and deterministic repair. */
  competingUrls?: Array<{url: string; title: string; primaryKeyword?: string | null}>
  /** Hard max body words for the content type — passed to the deterministic
   *  repair so over-long drafts are trimmed into their window before gates. */
  maxWords?: number
}): Promise<ShipResult> {
  // Hard gate: strategy host → repo must match HOST_REPO table
  assertPlanRepoConsistency(opts.plan)
  if (HOST_REPO[opts.plan.host] !== opts.plan.repo) {
    throw new Error(
      `Refusing ship: host ${opts.plan.host} is not mapped to repo ${opts.plan.repo}`,
    )
  }

  const owner = process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it'
  const repo = opts.plan.repo
  const branchMain = 'main'

  // Auto index: this article passed every gate — strip any stale noindex
  // directive so the shipped page is indexable by default.
  let shipContent_ = opts.plan.indexable ? stripNoIndex(opts.content) : opts.content

  // Deterministic compliance repair BEFORE the master gate stack. A missing
  // disclaimer or broken reader TOC must never block a ship that a mechanical
  // fix can resolve — the studio's "Fix & regenerate" and manual ship both
  // converge on the same repaired content instead of failing forever.
  {
    const repaired = applyDeterministicRepairs({
      content: shipContent_,
      title: opts.title,
      primaryKeyword: opts.primaryKeyword,
      region: opts.region,
      indexable: opts.plan.indexable,
      contentType: opts.contentType,
      requiredShortKeywords: opts.requiredShortKeywords,
      requiredLongTailKeywords: opts.requiredLongTailKeywords,
      competingUrls: opts.competingUrls,
      targetUrl: (opts.plan as any)?.canonicalUrl || undefined,
      maxWords: opts.maxWords,
    })
    if (repaired.applied.length) {
      shipContent_ = repaired.content
      console.info(
        `[ship] deterministic repair applied before gates: ${repaired.applied.join(', ')}`,
      )
    }
  }

  const { filePath, fileContent } = renderTargetFile({
    plan: opts.plan,
    content: shipContent_,
    title: opts.title,
    region: opts.region,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
    canonicalUrl: opts.plan.canonicalUrl,
  })

  // ── Master gate stack (approve / merge cannot skip any layer) ────────────
  // Provider-agnostic: DeepSeek, Cloudflare, or any fallback may draft the
  // markdown — only the rendered file path is written to GitHub, and it must
  // always pass the same build-safe contract so main never red-X's deploy.
  // 1) Google depth floor (prose word count)
  assertContentDepth({
    content: shipContent_,
    contentType: opts.contentType,
    indexable: opts.plan.indexable,
  })
  // 2) Rhythm beyond the deterministic repair's clearing range — the repair
  // ran above on shipContent_ (mechanical fixes applied); if robotic sentence
  // openings STILL fire, the mechanical repair cannot clear them and only the
  // AI targeted sweep can. Refuse ship rather than ship robotic rhythm.
  // Runs BEFORE assertQualityGate so even the ≥7× blocker case surfaces this
  // actionable message instead of the generic "Same sentence opening repeated"
  // line — the exact opener + count + sweep direction.
  assertRhythmWithinRepairRange({
    content: shipContent_,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
  })
  // 2b) Voice, tonality, AI-slop, outcome promises, human cadence, keyword coverage
  assertQualityGate({
    content: shipContent_,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
    requiredShortKeywords: opts.requiredShortKeywords,
    requiredLongTailKeywords: opts.requiredLongTailKeywords,
  })
  // 3) Host · path · format + build-safe payload (CTAPanel, balanced JSX, FM)
  assertShipAllowed({
    plan: opts.plan,
    contentType: opts.contentType,
    title: opts.title,
    primaryKeyword: opts.primaryKeyword,
    filePath,
    fileContent,
  })

  if (opts.dryRun) {
    return {
      mode: opts.mode,
      owner,
      repo,
      path: filePath,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'dry_run',
      dryRun: true,
      humanApproved: opts.humanApproved,
    }
  }

  // ── Route-subtype overwrite guard (last line of defence) ─────────────────
  // Refuse to overwrite an existing page whose route subtype differs from this
  // article's (the 2026-08 spouse-visa overwrite root). New pages pass through.
  await assertNoRouteSubtypeConflict({
    owner,
    repo,
    filePath,
    primaryKeyword: opts.primaryKeyword,
    branch: branchMain,
  })

  // ── Direct main ONLY for human-approved ships (architecture I4) ─────────
  // Unattended factory / War Room must never red-X main without a PR + CI gate.
  const useMainCommit = Boolean(opts.humanApproved && opts.mode !== 'pr')

  if (useMainCommit) {
    if (opts.plan.blockers.length > 0) {
      throw new Error(`Cannot ship to main: ${opts.plan.blockers[0]}`)
    }

    const put = await putRepoFile({
      owner,
      repo,
      path: filePath,
      branch: branchMain,
      content: fileContent,
      message: `seo-factory: approve & deploy "${opts.title}" [${opts.primaryKeyword || 'content'}]`,
    })

    // Blog ships also append an index entry to blog-data.ts (index + [slug] fallback)
    const blogIdx = await maybeAppendBlogIndex({
      owner,
      repo,
      branch: branchMain,
      plan: opts.plan,
      content: shipContent_,
      title: opts.title,
      region: opts.region,
      primaryKeyword: opts.primaryKeyword,
    })
    if (blogIdx.appended) {
      console.info(`[ship] blog index updated on main: ${blogIdx.path}`)
    }

    // Fire-and-forget IndexNow submission for the new/updated page
    if (opts.plan.canonicalUrl) {
      submitUrlsToIndexNow([opts.plan.canonicalUrl]).catch((e) => {
        console.warn('[indexnow] auto-submit failed:', e instanceof Error ? e.message : e)
      })
    }

    if (opts.plan.canonicalUrl) { try { verifyLiveInBackground({ canonicalUrl: opts.plan.canonicalUrl, title: opts.title, primaryKeyword: opts.primaryKeyword, contentType: opts.contentType, jobId: (opts as any).jobId || null, commitSha: put.commitSha, host: opts.plan.host, repo, requiredShortKeywords: opts.requiredShortKeywords, requiredLongTailKeywords: opts.requiredLongTailKeywords }) } catch {} }
    return {
      mode: 'autodeploy',
      owner,
      repo,
      path: filePath,
      commitSha: put.commitSha,
      mergeCommitSha: put.commitSha,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'deployed',
      humanApproved: true,
    }
  }

  // Unattended autodeploy without human approval → force PR path (CI gate)
  const effectiveMode: ShipMode =
    opts.mode === 'autodeploy' && !opts.humanApproved ? 'merge' : opts.mode

  if (effectiveMode === 'autodeploy' && !opts.humanApproved) {
    if (!canAutodeploy(opts.audit, opts.plan.ymy)) {
      // fall through to PR/merge path below
    }
  }

  // PR path (and merge: PR → wait CI → merge)
  const baseSha = await getBranchHeadSha(owner, repo, branchMain)
  const slug = filePath.split('/').filter(Boolean).slice(-2, -1)[0] || 'page'
  const branchName = `seo-factory/${slug}-${Date.now().toString(36)}`.slice(0, 240)

  await createBranchFrom(owner, repo, branchName, baseSha)

  const put = await putRepoFile({
    owner,
    repo,
    path: filePath,
    branch: branchName,
    content: fileContent,
    message: `seo-factory: add "${opts.title}"`,
  })

  // Blog ships also append an index entry to blog-data.ts on the same branch
  // so the PR carries both the static page and its index listing.
  const blogIdx = await maybeAppendBlogIndex({
    owner,
    repo,
    branch: branchName,
    plan: opts.plan,
    content: shipContent_,
    title: opts.title,
    region: opts.region,
    primaryKeyword: opts.primaryKeyword,
  })
  if (blogIdx.appended) {
    console.info(`[ship] blog index appended on branch ${branchName}: ${blogIdx.path}`)
  }
  // CI polls the TRUE branch head — the blog-data append commit when present,
  // otherwise the page commit. Polling a stale parent SHA could report green
  // while the head commit's check-runs are still pending.
  const branchCommit = blogIdx.commitSha ?? put.commitSha

  const pr = await openPullRequest({
    owner,
    repo,
    title: `[SEO Factory] ${opts.title}`,
    head: branchName,
    base: branchMain,
    body: [
      '## SEO Factory ship',
      '',
      `- **Keyword:** ${opts.primaryKeyword || '—'}`,
      `- **Host:** ${opts.plan.host}`,
      `- **Path:** \`${filePath}\``,
      `- **Canonical:** ${opts.plan.canonicalUrl}`,
      `- **Indexable:** ${opts.plan.indexable}`,
      `- **Audit:** ${opts.audit.score} (${opts.audit.grade})`,
      `- **Job:** ${opts.jobId || '—'}`,
      `- **Git write:** ${put.updated ? 'update (sha resolved)' : 'create'} · ${put.attempts} attempt(s)`,
      blogIdx.appended ? `- **Blog index:** ${blogIdx.path} (appended)` : '',
      effectiveMode === 'merge'
        ? '- **Auto-merge:** after CI green (or timeout with merge attempt)'
        : '',
      '',
      opts.audit.blockers.length
        ? `### Blockers\n${opts.audit.blockers.map((b) => `- ${b.message}`).join('\n')}`
        : '### Blockers\n- none',
      '',
      'Merging to `main` triggers Cloudflare autodeploy for this repo.',
      'Unattended ships wait for GitHub check-runs so a bad page.tsx cannot red-X main.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  if (effectiveMode === 'merge' || effectiveMode === 'autodeploy') {
    // Let GitHub register the PR head + start workflows
    await new Promise((r) => setTimeout(r, 2500))

    const ci = await waitForCommitCi(owner, repo, branchCommit, {
      // Stay under typical Worker/cron budgets; 5 min covers most caseworks builds
      timeoutMs: Number(process.env.SHIP_CI_WAIT_MS || 5 * 60 * 1000),
      intervalMs: 20_000,
    })

    if (ci.state === 'failure') {
      console.warn('[ship] CI failed on PR head — leaving PR open', ci.note)
      return {
        mode: 'merge',
        owner,
        repo,
        path: filePath,
        branch: branchName,
        prUrl: pr.html_url,
        prNumber: pr.number,
        commitSha: branchCommit,
        canonicalUrl: opts.plan.canonicalUrl,
        status: 'pr_created',
        humanApproved: opts.humanApproved,
        ciState: 'failure',
        ciNote: `CI failed — not merged. ${ci.note}`,
      }
    }

    try {
      const merged = await mergePrApi({
        owner,
        repo,
        prNumber: pr.number,
        commitTitle: `seo-factory: merge "${opts.title}"`,
      })
      if (merged.merged) {
        // Fire-and-forget IndexNow submission for the merged page
        if (opts.plan.canonicalUrl) {
          submitUrlsToIndexNow([opts.plan.canonicalUrl]).catch(() => {})
        }
        if (opts.plan.canonicalUrl) { try { verifyLiveInBackground({ canonicalUrl: opts.plan.canonicalUrl, title: opts.title, primaryKeyword: opts.primaryKeyword, contentType: opts.contentType, jobId: (opts as any).jobId || null, commitSha: merged.sha, host: opts.plan.host, repo, requiredShortKeywords: opts.requiredShortKeywords, requiredLongTailKeywords: opts.requiredLongTailKeywords }) } catch {} }
        return {
          mode: 'merge',
          owner,
          repo,
          path: filePath,
          branch: branchName,
          prUrl: pr.html_url,
          prNumber: pr.number,
          commitSha: branchCommit,
          mergeCommitSha: merged.sha,
          canonicalUrl: opts.plan.canonicalUrl,
          status: 'merged',
          humanApproved: opts.humanApproved,
          ciState: ci.state,
          ciNote: ci.note,
        }
      }
    } catch (mergeErr) {
      console.warn(
        '[ship] auto-merge failed, PR left open:',
        mergeErr instanceof Error ? mergeErr.message : mergeErr,
      )
      return {
        mode: 'merge',
        owner,
        repo,
        path: filePath,
        branch: branchName,
        prUrl: pr.html_url,
        prNumber: pr.number,
        commitSha: branchCommit,
        canonicalUrl: opts.plan.canonicalUrl,
        status: 'pr_created',
        humanApproved: opts.humanApproved,
        ciState: ci.state,
        ciNote: `merge blocked: ${mergeErr instanceof Error ? mergeErr.message : 'unknown'} · CI ${ci.state}`,
      }
    }

    return {
      mode: 'merge',
      owner,
      repo,
      path: filePath,
      branch: branchName,
      prUrl: pr.html_url,
      prNumber: pr.number,
      commitSha: branchCommit,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'pr_created',
      humanApproved: opts.humanApproved,
      ciState: ci.state,
      ciNote: ci.note,
    }
  }

  return {
    mode: 'pr',
    owner,
    repo,
    path: filePath,
    branch: branchName,
    prUrl: pr.html_url,
    prNumber: pr.number,
    commitSha: branchCommit,
    canonicalUrl: opts.plan.canonicalUrl,
    status: 'pr_created',
    humanApproved: opts.humanApproved,
  }
}

/** Parse "owner/repo" or bare repo name with default owner. */
export function parseRepoSlug(targetRepo: string): { owner: string; repo: string } {
  const cleaned = String(targetRepo || '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
  if (cleaned.includes('/')) {
    const [owner, repo] = cleaned.split('/')
    return { owner, repo }
  }
  return {
    owner: process.env.GITHUB_CONTENT_OWNER ?? 'kylemwalkerpr-ship-it',
    repo: cleaned,
  }
}
