/**
 * Ship generated content to estate repos via PR or direct main commit (autodeploy).
 */

import { Buffer } from 'node:buffer'
import type { OwnerPlan } from './ownership'
import { assertPlanRepoConsistency, HOST_REPO } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy } from './audit'
import { renderTargetFile } from './renderTarget'
import { assertShipAllowed } from './shipGate'

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

async function gh(path: string, init: RequestInit = {}): Promise<any> {
  const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN (or CONTENT_STUDIO_GITHUB_TOKEN) not set')
  const base = process.env.GITHUB_API_BASE ?? 'https://api.github.com'
  // GitHub requires a User-Agent on every REST call. Cloudflare Workers'
  // default fetch UA is rejected with 403 "Request forbidden by administrative rules".
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yousafe-portal-seo-factory',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function getMainSha(owner: string, repo: string, branch: string): Promise<string> {
  const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`)
  return ref.object.sha
}

/** Encode path segments for GitHub Contents API (encodeURI leaves some chars unescaped). */
function encodeRepoPath(filePath: string): string {
  return String(filePath || '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/**
 * Blob SHA of an existing file on a branch, or undefined if the path is free (404).
 * Required when updating — GitHub Contents API returns 422 if "sha" wasn't supplied.
 */
async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  const token = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN (or CONTENT_STUDIO_GITHUB_TOKEN) not set')
  const base = process.env.GITHUB_API_BASE ?? 'https://api.github.com'
  const url = `${base}/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'yousafe-portal-seo-factory',
    },
  })
  if (res.status === 404) return undefined
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status} getFileSha: ${text.slice(0, 300)}`)
  }
  const file = await res.json()
  // Directory listing — never treat as a file blob
  if (Array.isArray(file)) {
    throw new Error(`Path is a directory, not a file: ${path}`)
  }
  const sha = file?.sha as string | undefined
  if (!sha) {
    throw new Error(`GitHub contents response missing blob sha for ${path} @ ${branch}`)
  }
  return sha
}

async function putContentOnce(opts: {
  owner: string
  repo: string
  path: string
  branch: string
  content: string
  message: string
  sha?: string
}): Promise<{ commitSha: string }> {
  const body: Record<string, string> = {
    message: opts.message,
    branch: opts.branch,
    content: Buffer.from(opts.content, 'utf8').toString('base64'),
  }
  if (opts.sha) body.sha = opts.sha
  const res = await gh(`/repos/${opts.owner}/${opts.repo}/contents/${encodeRepoPath(opts.path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { commitSha: res.commit?.sha || res.content?.sha || '' }
}

/**
 * Create or update a file. Always resolves blob SHA when the path already exists
 * (on main or on a feature branch forked from main). Retries once on 422/409
 * when GitHub says the file exists or the SHA is stale.
 */
async function putContent(opts: {
  owner: string
  repo: string
  path: string
  branch: string
  content: string
  message: string
  sha?: string
}): Promise<{ commitSha: string }> {
  let sha = opts.sha
  if (sha === undefined) {
    sha = await getFileSha(opts.owner, opts.repo, opts.path, opts.branch)
  }

  try {
    return await putContentOnce({ ...opts, sha })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const needsSha =
      /422/.test(msg) &&
      (/sha/i.test(msg) || /Invalid request/i.test(msg) || /already exists/i.test(msg))
    const staleSha = /409/.test(msg) || /does not match/i.test(msg) || /is at .+ but expected/i.test(msg)
    if (!needsSha && !staleSha) throw e

    const retrySha = await getFileSha(opts.owner, opts.repo, opts.path, opts.branch)
    if (!retrySha) {
      throw new Error(
        `GitHub refused update for ${opts.path} on ${opts.branch} (missing sha) and re-fetch found no file. Original: ${msg.slice(0, 280)}`,
      )
    }
    return await putContentOnce({ ...opts, sha: retrySha })
  }
}

/** Merge an open PR into main (squash or merge per repo defaults). */
export async function mergePullRequest(opts: {
  owner: string
  repo: string
  prNumber: number
  commitTitle?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
}): Promise<{ merged: boolean; sha?: string; message: string }> {
  const method = opts.mergeMethod || 'squash'
  try {
    const res = await gh(
      `/repos/${opts.owner}/${opts.repo}/pulls/${opts.prNumber}/merge`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commit_title: opts.commitTitle || `seo-factory: merge PR #${opts.prNumber}`,
          merge_method: method,
        }),
      },
    )
    return {
      merged: Boolean(res.merged),
      sha: res.sha as string | undefined,
      message: String(res.message || 'merged'),
    }
  } catch (e) {
    // Retry with merge if squash rejected
    if (method === 'squash') {
      try {
        const res = await gh(
          `/repos/${opts.owner}/${opts.repo}/pulls/${opts.prNumber}/merge`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commit_title: opts.commitTitle || `seo-factory: merge PR #${opts.prNumber}`,
              merge_method: 'merge',
            }),
          },
        )
        return {
          merged: Boolean(res.merged),
          sha: res.sha as string | undefined,
          message: String(res.message || 'merged'),
        }
      } catch (e2) {
        throw e2
      }
    }
    throw e
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

  // Hard gate: host subdomain · content type · path layout · rendered format
  // Refuse before any GitHub write (including dry-run so operators see the block).
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

    const existingSha = await getFileSha(owner, repo, filePath, branchMain)
    const { commitSha } = await putContent({
      owner,
      repo,
      path: filePath,
      branch: branchMain,
      content: fileContent,
      message: opts.humanApproved
        ? `seo-factory: approve & deploy "${opts.title}" [${opts.primaryKeyword || 'content'}]`
        : `seo-factory: ship "${opts.title}" [${opts.primaryKeyword || 'content'}]`,
      sha: existingSha,
    })

    return {
      mode: useMainCommit ? 'autodeploy' : opts.mode,
      owner,
      repo,
      path: filePath,
      commitSha,
      mergeCommitSha: commitSha,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'deployed',
      humanApproved: opts.humanApproved,
    }
  }

  // PR mode (and merge mode: open PR then merge)
  const baseSha = await getMainSha(owner, repo, branchMain)
  const slug = filePath.split('/').filter(Boolean).slice(-2, -1)[0] || 'page'
  const branchName = `seo-factory/${slug}-${Date.now().toString(36)}`.slice(0, 240)

  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  })

  // Branch is forked from main — if path already exists, GitHub requires blob sha.
  // putContent resolves SHA automatically (create vs update).
  const { commitSha: branchCommit } = await putContent({
    owner,
    repo,
    path: filePath,
    branch: branchName,
    content: fileContent,
    message: `seo-factory: add "${opts.title}"`,
  })

  const pr = await gh(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
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
    }),
  })

  if (opts.mode === 'merge') {
    // Brief pause so GitHub indexes the PR head
    await new Promise((r) => setTimeout(r, 800))
    try {
      const merged = await mergePullRequest({
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

export { gh, getMainSha, getFileSha, putContent }
