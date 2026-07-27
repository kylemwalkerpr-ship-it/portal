/**
 * Ship generated content to estate repos via PR or direct main commit (autodeploy).
 *
 * All GitHub file writes go through lib/githubContents.putRepoFile so create vs
 * update always supplies the blob SHA (prevents 422 "sha wasn't supplied").
 */

import type { OwnerPlan } from './ownership'
import { assertPlanRepoConsistency, HOST_REPO } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy } from './audit'
import { renderTargetFile } from './renderTarget'
import { assertShipAllowed } from './shipGate'
import { assertContentDepth } from './contentDepth'
import { assertQualityGate } from './contentQualityGate'
import {
  createBranchFrom,
  getBranchHeadSha,
  getFileBlobSha,
  githubFetch,
  mergePullRequest as mergePrApi,
  openPullRequest,
  putRepoFile,
} from '@/lib/githubContents'

/** pr = open PR only; autodeploy = commit main; merge = PR then merge to main */
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
  const { filePath, fileContent } = renderTargetFile({
    plan: opts.plan,
    content: opts.content,
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
    content: opts.content,
    contentType: opts.contentType,
    indexable: opts.plan.indexable,
  })
  // 2) Voice, tonality, AI-slop, outcome promises, human cadence
  assertQualityGate({
    content: opts.content,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword,
    indexable: opts.plan.indexable,
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

  // Human approve or explicit autodeploy → commit main (fast path for CF deploy)
  const useMainCommit =
    opts.mode === 'autodeploy' || Boolean(opts.humanApproved && opts.mode !== 'pr')

  if (useMainCommit) {
    if (opts.plan.blockers.length > 0) {
      throw new Error(`Cannot ship to main: ${opts.plan.blockers[0]}`)
    }
    // Automated autodeploy still needs audit gate; human-approved does not
    if (!opts.humanApproved && !canAutodeploy(opts.audit, opts.plan.ymy)) {
      throw new Error(
        `Audit score ${opts.audit.score} (${opts.audit.grade}) or blockers prevent autodeploy. Approve in Studio or use ship_mode=pr.`,
      )
    }

    // putRepoFile always GET→sha then PUT (create or update) + 422/409 retry
    const put = await putRepoFile({
      owner,
      repo,
      path: filePath,
      branch: branchMain,
      content: fileContent,
      message: opts.humanApproved
        ? `seo-factory: approve & deploy "${opts.title}" [${opts.primaryKeyword || 'content'}]`
        : `seo-factory: ship "${opts.title}" [${opts.primaryKeyword || 'content'}]`,
    })

    return {
      mode: useMainCommit ? 'autodeploy' : opts.mode,
      owner,
      repo,
      path: filePath,
      commitSha: put.commitSha,
      mergeCommitSha: put.commitSha,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'deployed',
      humanApproved: opts.humanApproved,
    }
  }

  // PR mode (and merge mode: open PR then merge)
  const baseSha = await getBranchHeadSha(owner, repo, branchMain)
  const slug = filePath.split('/').filter(Boolean).slice(-2, -1)[0] || 'page'
  const branchName = `seo-factory/${slug}-${Date.now().toString(36)}`.slice(0, 240)

  await createBranchFrom(owner, repo, branchName, baseSha)

  // Branch is forked from main — path often already exists → must send blob sha.
  const put = await putRepoFile({
    owner,
    repo,
    path: filePath,
    branch: branchName,
    content: fileContent,
    message: `seo-factory: add "${opts.title}"`,
  })
  const branchCommit = put.commitSha

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
      opts.mode === 'merge' ? '- **Auto-merge:** yes (to main → Cloudflare deploy)' : '',
      '',
      opts.audit.blockers.length
        ? `### Blockers\n${opts.audit.blockers.map((b) => `- ${b.message}`).join('\n')}`
        : '### Blockers\n- none',
      '',
      'Merging to `main` triggers Cloudflare autodeploy for this repo.',
    ]
      .filter(Boolean)
      .join('\n'),
  })

  if (opts.mode === 'merge') {
    // Brief pause so GitHub indexes the PR head
    await new Promise((r) => setTimeout(r, 800))
    try {
      const merged = await mergePrApi({
        owner,
        repo,
        prNumber: pr.number,
        commitTitle: `seo-factory: merge "${opts.title}"`,
      })
      if (merged.merged) {
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
        }
      }
    } catch (mergeErr) {
      // Leave PR open for human/monitor if merge blocked (branch protection, etc.)
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
      }
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
