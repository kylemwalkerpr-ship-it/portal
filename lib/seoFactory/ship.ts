/**
 * Ship generated content to estate repos via PR or direct main commit (autodeploy).
 */

import { Buffer } from 'node:buffer'
import type { OwnerPlan } from './ownership'
import { assertPlanRepoConsistency, HOST_REPO } from './ownership'
import type { SeoFactoryAudit } from './audit'
import { canAutodeploy } from './audit'
import { renderTargetFile } from './renderTarget'

export type ShipMode = 'pr' | 'autodeploy'

export interface ShipResult {
  mode: ShipMode
  repo: string
  owner: string
  path: string
  branch?: string
  prUrl?: string
  prNumber?: number
  commitSha?: string
  canonicalUrl: string
  status: 'pr_created' | 'deployed' | 'dry_run'
  dryRun?: boolean
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

async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const file = await gh(
      `/repos/${owner}/${repo}/contents/${encodeURI(path).replace(/^\//, '')}?ref=${encodeURIComponent(branch)}`,
    )
    return file.sha as string
  } catch {
    return undefined
  }
}

async function putContent(opts: {
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
  const res = await gh(`/repos/${opts.owner}/${opts.repo}/contents/${encodeURI(opts.path).replace(/^\//, '')}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { commitSha: res.commit?.sha || res.content?.sha || '' }
}

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

  if (opts.dryRun) {
    return {
      mode: opts.mode,
      owner,
      repo,
      path: filePath,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'dry_run',
      dryRun: true,
    }
  }

  if (opts.mode === 'autodeploy') {
    if (opts.plan.blockers.length > 0) {
      throw new Error(`Cannot autodeploy: ${opts.plan.blockers[0]}`)
    }
    if (!canAutodeploy(opts.audit, opts.plan.ymy)) {
      throw new Error(
        `Audit score ${opts.audit.score} (${opts.audit.grade}) or blockers prevent autodeploy. Use ship_mode=pr.`,
      )
    }

    const existingSha = await getFileSha(owner, repo, filePath, branchMain)
    const { commitSha } = await putContent({
      owner,
      repo,
      path: filePath,
      branch: branchMain,
      content: fileContent,
      message: `seo-factory: ship "${opts.title}" [${opts.primaryKeyword || 'content'}]`,
      sha: existingSha,
    })

    return {
      mode: 'autodeploy',
      owner,
      repo,
      path: filePath,
      commitSha,
      canonicalUrl: opts.plan.canonicalUrl,
      status: 'deployed',
    }
  }

  // PR mode
  const baseSha = await getMainSha(owner, repo, branchMain)
  const slug = filePath.split('/').filter(Boolean).slice(-2, -1)[0] || 'page'
  const branchName = `seo-factory/${slug}-${Date.now().toString(36)}`.slice(0, 240)

  await gh(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  })

  await putContent({
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
        '',
        opts.audit.blockers.length
          ? `### Blockers\n${opts.audit.blockers.map((b) => `- ${b.message}`).join('\n')}`
          : '### Blockers\n- none',
        '',
        'Merging to `main` triggers Cloudflare autodeploy for this repo.',
      ].join('\n'),
    }),
  })

  return {
    mode: 'pr',
    owner,
    repo,
    path: filePath,
    branch: branchName,
    prUrl: pr.html_url,
    prNumber: pr.number,
    canonicalUrl: opts.plan.canonicalUrl,
    status: 'pr_created',
  }
}
