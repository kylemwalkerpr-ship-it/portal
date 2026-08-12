/**
 * Canonical GitHub Contents API helpers for Content Studio / SEO Factory.
 *
 * RULE: Every create-or-update of a repo file MUST go through `putRepoFile`.
 * Never raw-PUT `/repos/.../contents/...` from route handlers.
 *
 * Why: GitHub returns HTTP 422 `"sha" wasn't supplied` when the path already
 * exists (common on approve→main re-ships and PR branches forked from main).
 * This module always resolves the blob SHA and retries on 422/409.
 */

import { Buffer } from 'node:buffer'

const API_VERSION = '2022-11-28'
const DEFAULT_UA = 'yousafe-portal-github-contents'

function token(): string {
  const t = process.env.GITHUB_TOKEN || process.env.CONTENT_STUDIO_GITHUB_TOKEN
  if (!t) throw new Error('GITHUB_TOKEN (or CONTENT_STUDIO_GITHUB_TOKEN) not set')
  return t
}

function apiBase(): string {
  return process.env.GITHUB_API_BASE ?? 'https://api.github.com'
}

/** Encode each path segment for the Contents API. */
export function encodeRepoPath(filePath: string): string {
  return String(filePath || '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/** True when GitHub is complaining about missing/stale file blob sha. */
export function isGithubShaRequiredError(message: string): boolean {
  const msg = String(message || '')
  if (/422/.test(msg) && (/sha/i.test(msg) || /Invalid request/i.test(msg) || /already exists/i.test(msg))) {
    return true
  }
  if (/409/.test(msg) || /does not match/i.test(msg) || /is at .+ but expected/i.test(msg)) {
    return true
  }
  // Raw API body without status prefix
  if (/"sha"\s*wasn't supplied/i.test(msg) || /"sha" wasn't supplied/i.test(msg)) {
    return true
  }
  return false
}

export async function githubFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': DEFAULT_UA,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 400)}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function getBranchHeadSha(
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  try {
    const ref = await githubFetch(
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    )
    return ref.object.sha as string
  } catch {
    const branches = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=100`)
    const b = (branches as Array<{ name: string; commit: { sha: string } }>).find(
      (x) => x.name === branch,
    )
    if (!b) throw new Error(`Branch '${branch}' not found in ${owner}/${repo}`)
    return b.commit.sha
  }
}

export async function createBranchFrom(
  owner: string,
  repo: string,
  branchName: string,
  fromSha: string,
): Promise<void> {
  await githubFetch(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  })
}

/**
 * Blob SHA of an existing file on a branch, or undefined if the path is free (404).
 */
export async function getFileBlobSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const file = await githubFetch(
      `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    )
    if (Array.isArray(file)) {
      throw new Error(`Path is a directory, not a file: ${path}`)
    }
    const sha = file?.sha as string | undefined
    if (!sha) {
      throw new Error(`GitHub contents response missing blob sha for ${path} @ ${branch}`)
    }
    return sha
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // GitHub 404 means the path doesn't exist yet — treat as undefined
    if (/^GitHub 404:/.test(msg)) return undefined
    throw e
  }
}

/**
 * Decode the text content of an existing repo file on a branch, or undefined
 * when the path does not exist. Used to append index entries (blog-data.ts)
 * to existing files during a ship.
 */
export async function getRepoFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const file = await githubFetch(
      `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(branch)}`,
    )
    if (Array.isArray(file)) {
      throw new Error(`Path is a directory, not a file: ${path}`)
    }
    if (!file?.content) return undefined
    return Buffer.from(String(file.content).replace(/\n/g, ''), 'base64').toString('utf8')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // GitHub 404 means the path doesn't exist yet — treat as undefined
    if (/^GitHub 404:/.test(msg)) return undefined
    throw e
  }
}

export interface PutRepoFileOpts {
  owner: string
  repo: string
  path: string
  branch: string
  content: string
  message: string
  /** Optional hint; ignored if stale — we always re-resolve on failure. */
  sha?: string
  /** Max attempts including the first try (default 3). */
  maxAttempts?: number
}

export interface PutRepoFileResult {
  commitSha: string
  /** Whether this was an update (had blob sha) vs create. */
  updated: boolean
  path: string
  branch: string
  attempts: number
}

/**
 * Create or update a single file. Safe for:
 * - first ship (create)
 * - re-approve / merge overwrite (update with sha)
 * - PR branch forked from main where path already exists
 * - concurrent stale-sha races (retry with fresh sha)
 */
export async function putRepoFile(opts: PutRepoFileOpts): Promise<PutRepoFileResult> {
  const maxAttempts = Math.min(5, Math.max(1, opts.maxAttempts ?? 3))
  let lastError: Error | null = null
  let updated = false

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Always resolve SHA from the target branch — never trust a stale caller sha alone.
    // Exception: on first attempt, prefer a fresh GET; caller sha is only a hint if GET fails
    // (it should not fail for auth — GET throws).
    let sha: string | undefined
    try {
      sha = await getFileBlobSha(opts.owner, opts.repo, opts.path, opts.branch)
    } catch (e) {
      // Transient GET failure: fall back to caller sha on first try only
      if (attempt === 1 && opts.sha) {
        sha = opts.sha
      } else {
        throw e
      }
    }
    updated = Boolean(sha)

    const body: Record<string, string> = {
      message: opts.message,
      branch: opts.branch,
      content: Buffer.from(opts.content, 'utf8').toString('base64'),
    }
    if (sha) body.sha = sha

    try {
      const res = await githubFetch(
        `/repos/${opts.owner}/${opts.repo}/contents/${encodeRepoPath(opts.path)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      return {
        commitSha: (res.commit?.sha || res.content?.sha || '') as string,
        updated,
        path: opts.path,
        branch: opts.branch,
        attempts: attempt,
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      const msg = lastError.message
      if (attempt < maxAttempts && isGithubShaRequiredError(msg)) {
        // Brief pause so branch tip can settle after concurrent writes
        await new Promise((r) => setTimeout(r, 200 * attempt))
        continue
      }
      // Non-sha errors: rethrow immediately
      if (!isGithubShaRequiredError(msg)) throw lastError
    }
  }

  throw new Error(
    `putRepoFile failed for ${opts.owner}/${opts.repo}:${opts.path}@${opts.branch} after ${maxAttempts} attempt(s): ${lastError?.message || 'unknown'}`,
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Fetch PR details including GitHub's mergeability flags. */
export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<{
  number: number
  state: string
  merged: boolean
  mergeable: boolean | null
  mergeable_state: string
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  html_url: string
}> {
  const pr = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`)
  return {
    number: pr.number as number,
    state: String(pr.state || ''),
    merged: Boolean(pr.merged),
    mergeable: pr.mergeable == null ? null : Boolean(pr.mergeable),
    mergeable_state: String(pr.mergeable_state || 'unknown'),
    head: { ref: String(pr.head?.ref || ''), sha: String(pr.head?.sha || '') },
    base: { ref: String(pr.base?.ref || ''), sha: String(pr.base?.sha || '') },
    html_url: String(pr.html_url || ''),
  }
}

/**
 * Merge the base branch into the PR head — the GitHub API behind the
 * "Update branch" button. Lets us auto-resolve "dirty" PRs (stale branch)
 * instead of failing merges with 405 "merge conflicts".
 */
export async function updatePullRequestBranch(
  owner: string,
  repo: string,
  prNumber: number,
  expectedHeadSha?: string,
): Promise<{ message: string; url?: string }> {
  const body: Record<string, string> = {}
  if (expectedHeadSha) body.expected_head_sha = expectedHeadSha
  const res = await githubFetch(
    `/repos/${owner}/${repo}/pulls/${prNumber}/update-branch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  return {
    message: String(res.message || 'updated'),
    url: res.url as string | undefined,
  }
}

async function callMerge(
  owner: string,
  repo: string,
  prNumber: number,
  commitTitle: string | undefined,
  method: 'merge' | 'squash' | 'rebase',
): Promise<{ merged: boolean; sha?: string; message: string }> {
  const res = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commit_title: commitTitle || `merge PR #${prNumber}`,
      merge_method: method,
    }),
  })
  return {
    merged: Boolean(res.merged),
    sha: res.sha as string | undefined,
    message: String(res.message || 'merged'),
  }
}

/**
 * Conflict-aware merge:
 *  1. try squash (fallback plain merge) as before
 *  2. if GitHub reports merge conflicts (405), sync the PR branch with base
 *     via the update-branch API and retry (up to opts.syncAttempts)
 *  3. if the conflict survives the sync (same-file changes on both sides),
 *     throw a distinct "could not be auto-resolved / forceNewShip" error so
 *     callers can fall back to committing approved content directly to main.
 */
export async function mergePullRequest(opts: {
  owner: string
  repo: string
  prNumber: number
  commitTitle?: string
  mergeMethod?: 'merge' | 'squash' | 'rebase'
  /** How many branch-sync attempts to allow before giving up (default 1). */
  syncAttempts?: number
}): Promise<{ merged: boolean; sha?: string; message: string }> {
  const { owner, repo, prNumber, commitTitle } = opts
  const method = opts.mergeMethod || 'squash'
  const syncAttempts = Math.min(2, Math.max(0, opts.syncAttempts ?? 1))
  const mergeMethods: Array<'merge' | 'squash' | 'rebase'> =
    method === 'squash' ? ['squash', 'merge'] : [method]
  const errors: string[] = []

  for (let attempt = 0; attempt <= syncAttempts; attempt++) {
    let conflictDetected = false

    for (const m of mergeMethods) {
      try {
        const res = await callMerge(owner, repo, prNumber, commitTitle, m)
        if (res.merged) return res
        errors.push(`${m}: ${res.message}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${m}: ${msg}`)
        const conflict =
          /conflict/i.test(msg) || /405/.test(msg) || /not mergeable/i.test(msg)
        if (!conflict) {
          // Auth / not found / branch protection — terminal, do not loop.
          throw new Error(`Merge PR #${prNumber} failed: ${errors.join('; ')}`)
        }
        conflictDetected = true
        break // conflicts can't be fixed by trying another merge method
      }
    }

    if (!conflictDetected || attempt >= syncAttempts) break

    // Sync the PR branch with base (merges base into head), then retry.
    try {
      const pr = await getPullRequest(owner, repo, prNumber)
      if (pr.merged) {
        return { merged: true, message: 'already merged on GitHub' }
      }
      await updatePullRequestBranch(owner, repo, prNumber, pr.head.sha || undefined)
      // GitHub recomputes mergeability asynchronously — poll briefly.
      const deadline = Date.now() + 45_000
      let resolved = false
      while (Date.now() < deadline && !resolved) {
        await sleep(10_000)
        try {
          const p = await getPullRequest(owner, repo, prNumber)
          if (p.merged) {
            return { merged: true, message: 'merged during branch sync' }
          }
          resolved = p.mergeable_state !== 'dirty' && p.mergeable_state !== 'unknown'
        } catch {
          /* transient — keep polling */
        }
      }
      if (!resolved) {
        errors.push(
          'sync-branch: base could not be merged into PR head (real file conflict)',
        )
      }
    } catch (syncErr) {
      errors.push(
        `sync-branch: ${syncErr instanceof Error ? syncErr.message : 'failed'}`,
      )
      break // sync itself failed — retrying is pointless
    }
  }

  const unresolved = errors.some((e) => /conflict/i.test(e) || /sync-branch/i.test(e))
  throw new Error(
    `Merge PR #${prNumber} failed: ${errors.join('; ')}` +
      (unresolved
        ? ' — could not be auto-resolved: PR has file conflicts with base. Use forceNewShip to commit approved content directly to main.'
        : ''),
  )
}

export async function openPullRequest(opts: {
  owner: string
  repo: string
  title: string
  head: string
  base: string
  body: string
}): Promise<{ html_url: string; number: number; created_at?: string }> {
  const pr = await githubFetch(`/repos/${opts.owner}/${opts.repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: opts.title,
      head: opts.head,
      base: opts.base,
      body: opts.body,
      draft: false,
    }),
  })
  return { html_url: pr.html_url as string, number: pr.number as number, created_at: pr.created_at as string | undefined }
}
