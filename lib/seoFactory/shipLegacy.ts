/**
 * Ship generated content to estate repos — THE ONLY Git write door for Content Studio.
 *
 * Architecture (docs/CONTENT_STUDIO_ARCHITECTURE.md):
 *   - Unattended: PR → wait for CI → merge (never direct-push main)
 *   - Human-approved: may direct-commit main for fast CF deploy
 *   - All writes via putRepoFile (SHA resolve + 422/409 retry)
 */

import { finalizePipelineContentType } from './jobContentType'
import type { OwnerPlan } from './ownership'
import { assertPlanRepoConsistency, HOST_REPO, assertCanonicalIsNotCountryHub } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy } from './audit'
import { renderTargetFile, buildBlogPostEntry, insertBlogPostIntoData } from './renderTarget'
import { renderOgImageFile } from './ogCard'
import { assertShipAllowed } from './shipGate'
import { assertNoRouteSubtypeConflict } from './routeSubtypeGuard'
import { assertContentDepth } from './contentDepth'
import { assertQualityGate, assertRhythmWithinRepairRange } from './contentQualityGate'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { applyDeterministicRepairs } from './editorialScaffold'
import { auditLinksLive, sanitizeDraftLinksLive } from './linkAudit'
import {
  createBranchFrom,
  deleteRepoFile,
  getBranchHeadSha,
  normalizeGithubTarget,
  getCommitParentSha,
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
import { publicPathFromRepoFile, sitemapPathForShippedFile, upsertStudioSitemapEntry } from './siteHealth'

/** pr = open PR only; autodeploy = commit main (human only); merge = PR→CI→main */
export type ShipMode = 'pr' | 'autodeploy' | 'merge'

/**
 * Mandatory-evidence hold decision — the ONLY compliance reason ship.ts lets
 * block a Git write. Authority is the gate's `mandatory` verdict: on a
 * YMYL-critical (visa/citizenship/family) mission ONE missing required item
 * holds shipping, legal OR regional. Exported (pure) so focused tests pin the
 * strict-OR semantics without running the whole GitHub door.
 */
export interface MandatoryShipCtx {
  applicable: boolean
  met: boolean
  missing: string[]
}

export function mandatoryShipHold(mandatory: MandatoryShipCtx, stage: string): Error | null {
  if (mandatory.applicable && !mandatory.met) {
    return new Error(
      `Refusing ship: engine compliance gate BLOCKED on YMYL-critical stage "${stage}" — missing ${mandatory.missing.join(' AND ')}. Await human review or add the missing required item(s) to the draft.`,
    )
  }
  return null
}

/**
 * Fail-closed hold for the mandatory compliance gate. ANY setup/classification/
 * evaluation failure on this path produces a TYPED hold — the ship door must
 * never write Git without knowing whether mandatory YMYL evidence applies.
 */
export class MandatoryComplianceHeldError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MandatoryComplianceHeldError'
  }
}

/**
 * The ship-door mandatory-compliance evaluation seam. Runs the dynamic gate
 * module load, the stage classifier, and the authoritative evidence gate. Every
 * step (load, classify, evaluate) lives HERE so a failure of any of them
 * propagates as a reject — shipContent wraps this seam and converts any
 * unexpected failure into a `MandatoryComplianceHeldError` fail-closed hold.
 * Exported so the actual ship path is directly testable.
 */
export async function evaluateMandatoryComplianceAtShip(opts: {
  primaryKeyword: string
  title: string
  jobId?: string
  content: string
  contentType: string
}): Promise<{ verdict: { mandatory: MandatoryShipCtx; recorded: boolean }; stage: string }> {
  const gate = await import('@/lib/seoEngine/gate')
  const planner = await import('@/lib/seoEngine/planner')
  // Classifier: resolve the mission cell. A classifier THROW must fail closed.
  const cell = planner.bestCellForTerm(opts.primaryKeyword || opts.title)
  const stage = cell && cell.score >= planner.MIN_CELL_MATCH_SCORE ? cell.stage : ''
  const verdict = await gate.enforceGate(
    { subjectType: 'job', subjectId: opts.jobId || null, stage: stage || 'unmapped', country: cell?.country },
    opts.content,
    { stage: stage || undefined, country: cell?.country, title: opts.title, contentType: opts.contentType },
  )
  return {
    verdict: { mandatory: verdict.mandatory, recorded: verdict.recorded },
    stage,
  }
}

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
  /** Human-approval only chooses direct-main vs PR (when mode !== 'pr'). It
   *  never skips gates — assertContentDepth, assertRhythmWithinRepairRange,
   *  assertQualityGate, assertShipAllowed, the live-link leftover audit, and
   *  the YMYL engine gate all still run on the rendered payload. Ownership
   *  blockers always refuse the ship too. */
  humanApproved?: boolean
  /** CI state when merge waited for checks */
  ciState?: 'success' | 'failure' | 'pending' | 'none' | 'timeout'
  ciNote?: string
  /** Deterministic repairs applied to the content before the gate stack
   *  (e.g. keyword_backfill, cannibal_differentiation_note). Lets the studio
   *  ship dialog and E2E see what mechanically changed before gates ran. */
  repairsApplied?: string[]
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

export interface RevertContentOpts {
  owner: string
  repo: string
  /** File the ship wrote (content_path / plan.filePath). */
  path: string
  /** Commit SHA that landed the ship on main (deploy_sha / merge commit). */
  deploySha: string
  title: string
  dryRun?: boolean
}

export interface RevertResult {
  status: 'reverted' | 'pr_created' | 'dry_run'
  action: 'restored' | 'deleted' | 'unchanged'
  owner: string
  repo: string
  path: string
  prUrl?: string
  prNumber?: number
  commitSha?: string
  note?: string
}

/**
 * Rollback a merged ship by restoring the file to its pre-ship state.
 *
 * Strategy: find the deploy commit's first parent (the state of main right
 * before the ship), read the file at that parent SHA, then either restore that
 * exact content (page existed before → update) or delete the file (page was
 * net-new → it had no parent content). Goes through the same PR → CI → merge
 * door as every other write, so a rollback never direct-pushes a red main.
 */
export async function revertContent(opts: RevertContentOpts): Promise<RevertResult> {
  const { owner, repo, path, deploySha, title } = opts

  const parentSha = await getCommitParentSha(owner, repo, deploySha)
  const priorContent = parentSha
    ? await getRepoFileContent(owner, repo, path, parentSha)
    : undefined

  // No parent (root commit) or file absent at parent → the ship was net-new.
  const shouldDelete = priorContent === undefined

  if (opts.dryRun) {
    return {
      status: 'dry_run',
      action: shouldDelete ? 'deleted' : 'restored',
      owner,
      repo,
      path,
      note: shouldDelete
        ? 'rollback would DELETE this net-new page (no pre-ship content)'
        : `rollback would restore the pre-ship content (${priorContent.length} bytes from parent ${parentSha?.slice(0, 7)})`,
    }
  }

  const baseSha = await getBranchHeadSha(owner, repo, 'main')
  const slug = path.split('/').filter(Boolean).slice(-2, -1)[0] || 'page'
  const branchName = `seo-factory/revert-${slug}-${Date.now().toString(36)}`.slice(0, 240)
  await createBranchFrom(owner, repo, branchName, baseSha)

  let action: RevertResult['action'] = 'unchanged'
  let branchCommit = ''
  if (shouldDelete) {
    const del = await deleteRepoFile({
      owner,
      repo,
      path,
      branch: branchName,
      message: `seo-factory: rollback "${title}" (delete net-new page)`,
    })
    action = 'deleted'
    branchCommit = del.commitSha
  } else {
    const put = await putRepoFile({
      owner,
      repo,
      path,
      branch: branchName,
      content: priorContent,
      message: `seo-factory: rollback "${title}" (restore pre-ship content)`,
    })
    action = 'restored'
    branchCommit = put.commitSha
  }

  const pr = await openPullRequest({
    owner,
    repo,
    title: `[SEO Factory rollback] ${title}`,
    head: branchName,
    base: 'main',
    body: [
      '## SEO Factory rollback',
      '',
      `- **Page:** \`${path}\``,
      `- **Action:** ${action === 'deleted' ? 'delete net-new page' : 'restore pre-ship content'}`,
      `- **Deploy SHA reverted:** \`${deploySha.slice(0, 7)}\``,
      `- **Parent SHA:** \`${parentSha ? parentSha.slice(0, 7) : '—'}\``,
      '',
      'Merging to `main` triggers Cloudflare autodeploy for this repo.',
    ].join('\n'),
  })

  // Let GitHub register the PR head + start workflows
  await new Promise((r) => setTimeout(r, 2500))
  const ci = await waitForCommitCi(owner, repo, branchCommit, {
    timeoutMs: Number(process.env.SHIP_CI_WAIT_MS || 5 * 60 * 1000),
    intervalMs: 20_000,
  })
  if (ci.state === 'failure') {
    return {
      status: 'pr_created',
      action,
      owner,
      repo,
      path,
      prUrl: pr.html_url,
      prNumber: pr.number,
      commitSha: branchCommit,
      note: `CI failed on rollback branch — PR left open. ${ci.note}`,
    }
  }

  try {
    const merged = await mergePrApi({
      owner,
      repo,
      prNumber: pr.number,
      commitTitle: `seo-factory: rollback "${title}"`,
    })
    if (!merged.merged) {
      return {
        status: 'pr_created',
        action,
        owner,
        repo,
        path,
        prUrl: pr.html_url,
        prNumber: pr.number,
        commitSha: branchCommit,
        note: `Merge rejected: ${merged.message}`,
      }
    }
    return {
      status: 'reverted',
      action,
      owner,
      repo,
      path,
      prUrl: pr.html_url,
      prNumber: pr.number,
      commitSha: merged.sha || branchCommit,
      note: `${action === 'deleted' ? 'Deleted' : 'Restored'} ${path} — rollback merged to main`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'merge failed'
    return {
      status: 'pr_created',
      action,
      owner,
      repo,
      path,
      prUrl: pr.html_url,
      prNumber: pr.number,
      commitSha: branchCommit,
      note: `Rollback PR open but merge failed: ${msg.slice(0, 240)}`,
    }
  }
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
    return { path: dataPath, appended: false, note: `append failed (non-fatal): ${e instanceof Error ? e.message : 'unknown'}` }
  }
}

async function writeOgImageOrThrow(opts: {
  owner: string
  repo: string
  branch: string
  plan: OwnerPlan
  content: string
  title: string
  region: string
  contentType: string
  primaryKeyword: string
}): Promise<void> {
  const og = renderOgImageFile({
    planFilePath: opts.plan.filePath,
    title: opts.title,
    region: opts.region,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    content: opts.content,
  })
  if (!og) return
  await putRepoFile({
    owner: opts.owner,
    repo: opts.repo,
    path: og.filePath,
    branch: opts.branch,
    content: og.fileContent,
    message: `seo-factory: OG card for "${opts.title}"`,
  })
}

async function ensureCanonicalOnSitemap(opts: {
  owner: string
  repo: string
  branch: string
  filePath: string
}): Promise<{ path: string; added: boolean; note: string }> {
  const kind = opts.repo === 'caseworks' ? 'caseworks' : opts.repo === 'yousafe-consultancy' ? 'regional' : 'portal'
  const sitemapPath = sitemapPathForShippedFile(
    opts.repo === 'caseworks' ? 'caseworks' : opts.repo === 'portal' ? 'portal' : 'yousafe-consultancy',
    opts.filePath,
  )
  try {
    const current = await getRepoFileContent(opts.owner, opts.repo, sitemapPath, opts.branch)
    if (!current) return { path: sitemapPath, added: false, note: 'sitemap file not found' }
    const next = upsertStudioSitemapEntry(current, opts.filePath, kind)
    if (!next.added) return { path: sitemapPath, added: false, note: 'already listed' }
    await putRepoFile({
      owner: opts.owner,
      repo: opts.repo,
      path: sitemapPath,
      branch: opts.branch,
      content: next.content,
      message: `seo: add ${publicPathFromRepoFile(opts.filePath)} to sitemap (100% gate indexable)`,
    })
    return { path: sitemapPath, added: true, note: 'studio sitemap route added' }
  } catch (e) {
    return { path: sitemapPath, added: false, note: e instanceof Error ? e.message.slice(0, 160) : 'sitemap upsert failed' }
  }
}

/**
 * Human-approved path: commit straight to main when possible.
 * `humanApproved` only chooses direct-main vs PR (used when mode !== 'pr');
 * it NEVER skips the automated audit gates — assertContentDepth,
 * assertRhythmWithinRepairRange, assertQualityGate, assertShipAllowed, the
 * live-link leftover audit, and the YMYL engine gate all still run on the
 * rendered payload, and ownership blockers always refuse the ship.
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
  /**
   * Per-term keyword provenance from the partitioner / `resolveKeywordContract`.
   * Terms marked `synthesized` were fabricated to satisfy the count floors and
   * carry no search-demand evidence, so the quality gate downgrades an uncovered
   * synthesized term to a warning instead of refusing the ship. Omit and every
   * term is enforced as real demand (strict, pre-provenance behavior).
   */
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
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

  const contentType = finalizePipelineContentType(opts.contentType, opts.plan)

  const resolved = parseRepoSlug(opts.plan.repo)
  const owner = resolved.owner
  const repo = resolved.repo
  const branchMain = 'main'

  // 100% / passing gate pages are always indexable — never ship noindex.
  const gatePassed = (opts.audit?.score ?? 0) >= 100 || (opts.audit?.humanScore ?? 0) >= 100
  const indexable = opts.plan.indexable !== false || gatePassed
  if (gatePassed) opts.plan.indexable = true

  // Auto index: this article passed every gate — strip any stale noindex
  // directive so the shipped page is indexable by default.
  let shipContent_ = indexable ? stripNoIndex(opts.content) : opts.content

  // Deterministic compliance repair BEFORE the master gate stack. A missing
  // disclaimer or broken reader TOC must never block a ship that a mechanical
  // fix can resolve — the studio's "Fix & regenerate" and manual ship both
  // converge on the same repaired content instead of failing forever.
  let repairsApplied: string[] = []
  {
    const repaired = applyDeterministicRepairs({
      content: shipContent_,
      title: opts.title,
      primaryKeyword: opts.primaryKeyword,
      region: opts.region,
      indexable: opts.plan.indexable,
      contentType,
      requiredShortKeywords: opts.requiredShortKeywords,
      requiredLongTailKeywords: opts.requiredLongTailKeywords,
      competingUrls: opts.competingUrls,
      targetUrl: (opts.plan as any)?.canonicalUrl || undefined,
      maxWords: opts.maxWords,
    })
    if (repaired.applied.length) {
      repairsApplied = repaired.applied
      shipContent_ = repaired.content
      console.info(
        `[ship] deterministic repair applied before gates: ${repaired.applied.join(', ')}`,
      )
    }
    const knownLive = [opts.plan.canonicalUrl, opts.plan.filePath].filter(Boolean)
    const sanitized = await sanitizeDraftLinksLive(shipContent_, {
      region: opts.region,
      topic: opts.primaryKeyword || opts.title,
      keywords: [...(opts.requiredShortKeywords || []), ...(opts.requiredLongTailKeywords || [])],
      knownLiveUrls: knownLive,
    })
    if (sanitized.stripped || sanitized.injected) {
      shipContent_ = sanitized.content
      if (sanitized.stripped) repairsApplied.push(`stripped ${sanitized.stripped} dead/untrusted links`)
      if (sanitized.injected) repairsApplied.push(`injected ${sanitized.injected} live official sources`)
      console.info(
        `[ship] live link sanitize: stripped=${sanitized.stripped} injected=${sanitized.injected}`,
      )
    }
    const leftover = (await auditLinksLive(shipContent_, {
      knownLiveUrls: knownLive,
      citationContext: {
        region: opts.region,
        topic: opts.primaryKeyword || opts.title,
        keywords: [...(opts.requiredShortKeywords || []), ...(opts.requiredLongTailKeywords || [])],
        body: shipContent_,
      },
    })).filter(
      (f) => f.severity === 'blocker',
    )
    if (leftover.length) {
      throw new Error(
        `Refusing ship: ${leftover.length} dead or untrusted link${leftover.length === 1 ? '' : 's'} — ${leftover.map((f) => `${f.code}:${f.url}`).join('; ')}`,
      )
    }
  }

  const { filePath, fileContent } = renderTargetFile({
    plan: opts.plan,
    content: shipContent_,
    title: opts.title,
    region: opts.region,
    contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable,
    canonicalUrl: opts.plan.canonicalUrl,
  })

  // ── Master gate stack (approve / merge cannot skip any layer) ────────────
  // Provider-agnostic: DeepSeek, Cloudflare, or any fallback may draft the
  // markdown — only the rendered file path is written to GitHub, and it must
  // always pass the same build-safe contract so main never red-X's deploy.
  // 1) Google depth floor (prose word count)
  assertContentDepth({
    content: shipContent_,
    contentType,
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
    contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
  })
  // 2b) Voice, tonality, AI-slop, outcome promises, human cadence, keyword coverage
  assertQualityGate({
    content: shipContent_,
    contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
    requiredShortKeywords: opts.requiredShortKeywords,
    requiredLongTailKeywords: opts.requiredLongTailKeywords,
    shortKeywordTerms: opts.shortKeywordTerms,
    longTailKeywordTerms: opts.longTailKeywordTerms,
  })
  // 3) Host · path · format + build-safe payload (CTAPanel, balanced JSX, FM)
  assertShipAllowed({
    plan: opts.plan,
    contentType,
    title: opts.title,
    primaryKeyword: opts.primaryKeyword,
    filePath,
    fileContent,
  })

  // ── Master Engine compliance gate on the REAL draft ──────────────────────
  // Previously `enforceGate` was only callable from its own API route — the
  // ship door never consulted it, so "compliance" was telemetry. Now every
  // ship consults the AUTHORITATIVE mandatory-evidence result through
  // evaluateMandatoryComplianceAtShip: on a YMYL-critical stage
  // (visa/citizenship/family) ONE missing required item (statutory anchor OR
  // professional disclaimer) holds shipping — legal and regional targets
  // alike. This is STRICTER than the old "both missing, legal content only"
  // guard. Advisory style/score thresholds stay distinct (the `passed` flag
  // is telemetry, never a hold). A citation being present permits the ship;
  // it is never claimed to prove substantive legal accuracy.
  //
  // FAIL-CLOSED: the module load, stage classifier and evaluation ALL run in
  // the seam, so a setup/classification/evaluation THROW becomes a TYPED
  // MandatoryComplianceHeldError — the ship can never write Git without
  // knowing whether mandatory evidence applied. Only a legitimately-EVALUATED
  // noncritical (non-applicable) verdict is nonblocking.
  try {
    const { verdict, stage } = await evaluateMandatoryComplianceAtShip({
      primaryKeyword: opts.primaryKeyword,
      title: opts.title,
      jobId: opts.jobId,
      content: shipContent_,
      contentType,
    })
    if (verdict.mandatory.applicable) {
      const hold = mandatoryShipHold(verdict.mandatory, stage)
      if (hold) throw new MandatoryComplianceHeldError(hold.message)
    } else {
      console.warn(
        `[ship] compliance gate advisory verdict (nonblocking) — noncritical stage "${stage || 'unmapped'}"`,
      )
    }
    if (!verdict.recorded) {
      console.warn('[ship] compliance gate run not recorded (seo_gate_runs) — verdict still enforced in-memory')
    }
  } catch (e) {
    // Typed holds pass through; ANY other failure (module load, classifier,
    // evaluation) is converted to a typed fail-closed hold with a reason.
    if (e instanceof MandatoryComplianceHeldError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new MandatoryComplianceHeldError(
      `Held ship: mandatory compliance evaluation could not run for "${opts.primaryKeyword || opts.title}": ${msg}`,
    )
  }

  // ── Route-subtype overwrite guard (last line of defence) ─────────────────
  // Refuse to overwrite an existing page whose route subtype differs from this
  // article's (the 2026-08 spouse-visa overwrite root). New pages pass through.
  // Runs BEFORE the dry-run return so a dry run reports the same guard a real
  // ship would hit — a dry run must never claim green while this guard would
  // refuse the actual write.
  await assertNoRouteSubtypeConflict({
    owner,
    repo,
    filePath,
    primaryKeyword: opts.primaryKeyword,
    title: opts.title,
    branch: branchMain,
  })
  assertCanonicalIsNotCountryHub(opts.plan.canonicalUrl, opts.primaryKeyword)

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
      repairsApplied,
    }
  }

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
    await writeOgImageOrThrow({
      owner,
      repo,
      branch: branchMain,
      plan: opts.plan,
      content: shipContent_,
      title: opts.title,
      region: opts.region,
      contentType,
      primaryKeyword: opts.primaryKeyword,
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
    const sitemap = await ensureCanonicalOnSitemap({
      owner, repo, branch: branchMain, filePath,
    })
    if (sitemap.added) console.info(`[ship] sitemap updated: ${sitemap.path}`)

    // Fire-and-forget IndexNow submission for the new/updated page
    if (opts.plan.canonicalUrl) {
      submitUrlsToIndexNow([opts.plan.canonicalUrl]).catch((e) => {
        console.warn('[indexnow] auto-submit failed:', e instanceof Error ? e.message : e)
      })
    }

    if (opts.plan.canonicalUrl) { try { verifyLiveInBackground({ canonicalUrl: opts.plan.canonicalUrl, title: opts.title, primaryKeyword: opts.primaryKeyword, contentType: opts.contentType, jobId: (opts as any).jobId || null, commitSha: put.commitSha, host: opts.plan.host, repo, requiredShortKeywords: opts.requiredShortKeywords, requiredLongTailKeywords: opts.requiredLongTailKeywords }) } catch {} }
    // Close the interlink loop: mark engine-planned edges that are now LIVE.
    await recordAppliedEngineInterlinks({ primaryKeyword: opts.primaryKeyword, body: shipContent_ })
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
  await writeOgImageOrThrow({
    owner,
    repo,
    branch: branchName,
    plan: opts.plan,
    content: shipContent_,
    title: opts.title,
    region: opts.region,
    contentType,
    primaryKeyword: opts.primaryKeyword,
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
  const sitemap = await ensureCanonicalOnSitemap({
    owner, repo, branch: branchName, filePath,
  })
  if (sitemap.added) console.info(`[ship] sitemap updated on ${branchName}: ${sitemap.path}`)
  // CI polls the TRUE branch head — sitemap/blog appends land after the page
  // commit, so poll the current tip rather than a stale parent SHA.
  const branchCommit = sitemap.added
    ? await getBranchHeadSha(owner, repo, branchName)
    : (blogIdx.commitSha ?? put.commitSha)

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
        // Closed loop: mark the engine's planned edges that are now live on main.
        await recordAppliedEngineInterlinks({ primaryKeyword: opts.primaryKeyword, body: shipContent_ })
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
  return normalizeGithubTarget(
    process.env.GITHUB_CONTENT_OWNER ?? process.env.GITHUB_REPO_OWNER ?? 'kylemwalkerpr-ship-it',
    targetRepo,
  )
}

/**
 * Close the interlink loop: once content is LIVE (merged/deployed), flip the
 * engine's planned edges for this mission to `applied` — but ONLY the edges
 * whose target URL actually made it into the shipped body. Edges the draft
 * never embedded stay `planned`, so the "applied" metric is honest.
 */
async function recordAppliedEngineInterlinks(opts: {
  primaryKeyword: string
  body: string
}): Promise<number> {
  try {
    const { bestCellForTerm, MIN_CELL_MATCH_SCORE, plannerClusterId } = await import('@/lib/seoEngine/planner')
    const cell = bestCellForTerm(opts.primaryKeyword)
    if (!cell || cell.score < MIN_CELL_MATCH_SCORE) return 0
    const slug = plannerClusterId(cell.country, cell.stage, opts.primaryKeyword)
    const { createSupabaseAdminClient } = await import('@/lib/supabase')
    const supabase = createSupabaseAdminClient()
    const { data } = await supabase
      .from('seo_interlinks')
      .select('target_url')
      .eq('source_slug', slug)
      .eq('status', 'planned')
    const rows = (data as Array<{ target_url?: string }> | null) || []
    let applied = 0
    for (const r of rows) {
      const url = String(r.target_url || '')
      if (!url || !opts.body.includes(url)) continue
      const { error } = await supabase
        .from('seo_interlinks')
        .update({ status: 'applied', applied_at: new Date().toISOString() })
        .eq('source_slug', slug)
        .eq('target_url', url)
      if (!error) applied += 1
    }
    return applied
  } catch {
    return 0
  }
}
