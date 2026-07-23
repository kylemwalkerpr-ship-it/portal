/**
 * Post-ship deploy / CI monitor.
 *
 * Watches GitHub check-runs after approve→main (or PR merge). On failure,
 * uses Workers AI (free tier path already configured) to diagnose and either:
 *  - open a GitHub issue with a remediation plan, or
 *  - suggest a concrete fix in the job event_log for the admin.
 *
 * Not GitHub Copilot (paid product) — uses the same content AI stack as the factory.
 */

import { createClient } from '@supabase/supabase-js'
import { generateContentText } from '@/lib/contentAiProvider'
import { gh, parseRepoSlug } from './ship'

export interface CheckSnapshot {
  name: string
  status: string
  conclusion: string | null
  html_url?: string
  output_summary?: string
}

export interface MonitorResult {
  ok: boolean
  jobId: string
  repo: string
  sha: string | null
  prNumber: number | null
  checkState: 'success' | 'failure' | 'pending' | 'none' | 'unknown'
  checks: CheckSnapshot[]
  diagnosis?: string
  issueUrl?: string
  action: 'healthy' | 'pending' | 'diagnosed' | 'issue_opened' | 'no_sha' | 'error'
  message: string
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function fetchChecks(
  owner: string,
  repo: string,
  sha: string,
): Promise<{ state: MonitorResult['checkState']; checks: CheckSnapshot[] }> {
  const [checksRes, statusRes] = await Promise.all([
    gh(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`).catch(() => null),
    gh(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null),
  ])

  const checks: CheckSnapshot[] = []
  if (checksRes?.check_runs) {
    for (const r of checksRes.check_runs as any[]) {
      checks.push({
        name: String(r.name || 'check'),
        status: String(r.status || 'queued'),
        conclusion: r.conclusion != null ? String(r.conclusion) : null,
        html_url: r.html_url || r.details_url,
        output_summary: r.output?.summary || r.output?.title || undefined,
      })
    }
  }

  let state: MonitorResult['checkState'] = 'none'
  if (checks.length) {
    const failure = checks.some((c) =>
      ['failure', 'timed_out', 'cancelled', 'action_required'].includes(c.conclusion || ''),
    )
    const pending = checks.some((c) => c.status !== 'completed' || !c.conclusion)
    state = failure ? 'failure' : pending ? 'pending' : 'success'
  } else if (statusRes) {
    const st = String(statusRes.state || 'unknown')
    state =
      st === 'success'
        ? 'success'
        : st === 'pending' || st === 'expected'
          ? 'pending'
          : st === 'failure' || st === 'error'
            ? 'failure'
            : 'unknown'
    if (Array.isArray(statusRes.statuses)) {
      for (const s of statusRes.statuses.slice(0, 20)) {
        checks.push({
          name: String(s.context || 'status'),
          status: 'completed',
          conclusion: String(s.state || 'unknown'),
          html_url: s.target_url,
          output_summary: s.description,
        })
      }
    }
  }

  return { state, checks }
}

async function diagnoseWithAi(opts: {
  title: string
  path?: string
  repo: string
  checks: CheckSnapshot[]
  errorMessage?: string | null
}): Promise<string> {
  const failed = opts.checks.filter((c) =>
    ['failure', 'timed_out', 'error', 'cancelled', 'action_required'].includes(
      (c.conclusion || '').toLowerCase(),
    ),
  )
  const checklist = (failed.length ? failed : opts.checks)
    .slice(0, 12)
    .map(
      (c) =>
        `- ${c.name}: ${c.conclusion || c.status}${c.output_summary ? ` — ${c.output_summary.slice(0, 280)}` : ''}${c.html_url ? ` (${c.html_url})` : ''}`,
    )
    .join('\n')

  try {
    const ai = await generateContentText({
      system: [
        'You are a senior release engineer for YouSafe immigration content repos on Cloudflare Pages/Workers.',
        'Diagnose CI/deploy failures briefly and give actionable fixes.',
        'Prefer free/simple remediations: content path typos, front-matter YAML, invalid MDX/markdown, broken imports, Worker size.',
        'Never invent secrets. Output markdown with: Summary, Likely cause, Fix steps (numbered), When to re-approve.',
      ].join(' '),
      prompt: [
        `Repo: ${opts.repo}`,
        `Content title: ${opts.title}`,
        opts.path ? `Path: ${opts.path}` : '',
        opts.errorMessage ? `Job error: ${opts.errorMessage}` : '',
        'Checks:',
        checklist || '(no check details)',
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: 900,
      temperature: 0.2,
    })
    return ai.text
  } catch (e) {
    return [
      '## Automated diagnosis unavailable',
      '',
      `AI provider error: ${e instanceof Error ? e.message : String(e)}`,
      '',
      '### Checks',
      checklist || '- none',
      '',
      '### Manual steps',
      '1. Open the failed check URL on GitHub.',
      '2. Fix content or config, re-approve from Content Studio.',
      '3. Confirm Cloudflare deploy for the target repo.',
    ].join('\n')
  }
}

async function openGithubIssue(opts: {
  owner: string
  repo: string
  title: string
  body: string
}): Promise<string | null> {
  try {
    const issue = await gh(`/repos/${opts.owner}/${opts.repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts.title.slice(0, 240),
        body: opts.body,
        labels: ['seo-factory', 'deploy-monitor'],
      }),
    })
    return issue.html_url || null
  } catch {
    // Labels may not exist — retry without labels
    try {
      const issue = await gh(`/repos/${opts.owner}/${opts.repo}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: opts.title.slice(0, 240),
          body: opts.body,
        }),
      })
      return issue.html_url || null
    } catch {
      return null
    }
  }
}

async function appendJobLog(
  jobId: string,
  entry: {
    level: string
    source: string
    message: string
    detail?: string
  },
) {
  try {
    const supabase = sb()
    const { data: job } = await supabase
      .from('content_jobs')
      .select('event_log')
      .eq('id', jobId)
      .single()
    const prev = Array.isArray(job?.event_log) ? job!.event_log : []
    const next = [
      ...prev,
      {
        id: `mon-${Date.now()}`,
        ts: Date.now(),
        level: entry.level,
        source: entry.source,
        message: entry.message,
        detail: entry.detail,
      },
    ].slice(-300)
    await supabase.from('content_jobs').update({ event_log: next }).eq('id', jobId)
  } catch {
    /* soft */
  }
}

/**
 * Monitor a single content_jobs row after ship/merge.
 */
export async function monitorContentJob(
  jobId: string,
  opts?: { openIssueOnFailure?: boolean; waitMs?: number },
): Promise<MonitorResult> {
  const openIssueOnFailure = opts?.openIssueOnFailure !== false
  const supabase = sb()
  const { data: job, error } = await supabase.from('content_jobs').select('*').eq('id', jobId).single()
  if (error || !job) {
    return {
      ok: false,
      jobId,
      repo: '',
      sha: null,
      prNumber: null,
      checkState: 'unknown',
      checks: [],
      action: 'error',
      message: 'Job not found',
    }
  }

  const { owner, repo } = parseRepoSlug(String(job.target_repo || ''))
  let sha: string | null =
    (job.deploy_sha as string) ||
    null

  // Resolve SHA from PR if needed
  if (!sha && job.pr_number) {
    try {
      const pr = await gh(`/repos/${owner}/${repo}/pulls/${job.pr_number}`)
      sha = pr.merge_commit_sha || pr.head?.sha || null
    } catch {
      /* ignore */
    }
  }

  if (!sha) {
    await appendJobLog(jobId, {
      level: 'warn',
      source: 'monitor',
      message: 'No commit SHA to monitor yet',
    })
    return {
      ok: true,
      jobId,
      repo: `${owner}/${repo}`,
      sha: null,
      prNumber: job.pr_number || null,
      checkState: 'none',
      checks: [],
      action: 'no_sha',
      message: 'No commit SHA yet — ship or merge first',
    }
  }

  // Optional short wait for CI to start
  if (opts?.waitMs && opts.waitMs > 0) {
    await new Promise((r) => setTimeout(r, Math.min(opts.waitMs!, 15000)))
  }

  const { state, checks } = await fetchChecks(owner, repo, sha)

  if (state === 'success' || state === 'none') {
    await appendJobLog(jobId, {
      level: 'success',
      source: 'monitor',
      message: state === 'success' ? `CI healthy on ${sha.slice(0, 7)}` : `No checks on ${sha.slice(0, 7)} (may still deploy)`,
      detail: JSON.stringify(checks.slice(0, 10), null, 2),
    })
    return {
      ok: true,
      jobId,
      repo: `${owner}/${repo}`,
      sha,
      prNumber: job.pr_number || null,
      checkState: state,
      checks,
      action: 'healthy',
      message:
        state === 'success'
          ? 'All checks green — Cloudflare deploy should proceed from main'
          : 'No CI checks registered; main commit is live for Pages/Workers if auto-deploy is on',
    }
  }

  if (state === 'pending') {
    await appendJobLog(jobId, {
      level: 'info',
      source: 'monitor',
      message: `CI still running on ${sha.slice(0, 7)}`,
      detail: JSON.stringify(checks.slice(0, 10), null, 2),
    })
    return {
      ok: true,
      jobId,
      repo: `${owner}/${repo}`,
      sha,
      prNumber: job.pr_number || null,
      checkState: 'pending',
      checks,
      action: 'pending',
      message: 'Checks still pending — re-run monitor in a minute',
    }
  }

  // Failure path — AI diagnosis
  const diagnosis = await diagnoseWithAi({
    title: job.title || job.topic || jobId,
    path: job.content_path || undefined,
    repo: `${owner}/${repo}`,
    checks,
    errorMessage: job.error_message,
  })

  let issueUrl: string | undefined
  if (openIssueOnFailure) {
    const url = await openGithubIssue({
      owner,
      repo,
      title: `[SEO Factory] Deploy/CI failure: ${job.title || job.topic || sha.slice(0, 7)}`,
      body: [
        '## Automated deploy monitor',
        '',
        `- **Job:** \`${jobId}\``,
        `- **SHA:** \`${sha}\``,
        job.pr_number ? `- **PR:** #${job.pr_number}` : '',
        job.canonical_url ? `- **Canonical:** ${job.canonical_url}` : '',
        job.content_path ? `- **Path:** \`${job.content_path}\`` : '',
        '',
        diagnosis,
        '',
        '_Opened by YouSafe Content Studio deploy monitor (Workers AI)._',
      ]
        .filter(Boolean)
        .join('\n'),
    })
    if (url) issueUrl = url
  }

  await appendJobLog(jobId, {
    level: 'error',
    source: 'monitor',
    message: issueUrl
      ? `CI failure — issue opened ${issueUrl}`
      : `CI failure on ${sha.slice(0, 7)} — see diagnosis`,
    detail: diagnosis.slice(0, 4000),
  })

  await supabase
    .from('content_jobs')
    .update({
      error_message: `CI failure on ${sha.slice(0, 7)}${issueUrl ? ` · ${issueUrl}` : ''}`,
    })
    .eq('id', jobId)

  return {
    ok: false,
    jobId,
    repo: `${owner}/${repo}`,
    sha,
    prNumber: job.pr_number || null,
    checkState: 'failure',
    checks,
    diagnosis,
    issueUrl,
    action: issueUrl ? 'issue_opened' : 'diagnosed',
    message: issueUrl
      ? `CI failed — diagnosis issue: ${issueUrl}`
      : 'CI failed — diagnosis stored on job log',
  }
}

/**
 * Scan recent non-terminal / recently-merged jobs and monitor any with SHAs.
 */
export async function monitorRecentJobs(limit = 8): Promise<MonitorResult[]> {
  const supabase = sb()
  const since = new Date(Date.now() - 3 * 864e5).toISOString()
  const { data } = await supabase
    .from('content_jobs')
    .select('id, status, deploy_sha, pr_number, updated_at')
    .gte('updated_at', since)
    .in('status', ['merged', 'pr_created', 'failed', 'publishing'])
    .order('updated_at', { ascending: false })
    .limit(limit)

  const out: MonitorResult[] = []
  for (const row of data || []) {
    if (!row.deploy_sha && !row.pr_number) continue
    out.push(await monitorContentJob(row.id, { openIssueOnFailure: true, waitMs: 0 }))
  }
  return out
}
