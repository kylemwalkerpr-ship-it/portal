/**
 * lib/seoFactory/deployMonitor.ts — P0-3 Deploy monitor (portal/Supabase)
 *
 * Polls GitHub check-runs + combined status for a content job's PR head SHA.
 * On failure → flags content_jobs.needs_revert + revert_reason (and optionally
 * opens a GitHub issue). On success → clears the flag.
 *
 * Exports (API contract used by the rest of the portal):
 *   - checkDeployHealthForJob(jobId)      → { checked, failed?, sha?, reason? }
 *   - monitorContentJob(jobId, opts)      → { ok, checkState, action, ... }
 *   - monitorRecentJobs(limit)            → MonitorResult[]
 *
 * Best-effort; never throws to callers.
 */
import { createClient } from '@supabase/supabase-js'
import { githubFetch } from '@/lib/githubContents'

function dbc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export interface DeployHealthResult {
  checked: boolean
  failed?: boolean
  sha?: string
  reason?: string
}

export type CheckState = 'success' | 'failure' | 'pending' | 'none' | 'unknown'
export type MonitorAction = 'healthy' | 'issue_opened' | 'issue_exists' | 'pending' | 'no_ci' | 'none' | 'error'

export interface MonitorOptions {
  /** Open a GitHub issue when CI fails (default false). */
  openIssueOnFailure?: boolean
  /** Extra delay before the first poll so GitHub can register the head SHA (ms). */
  waitMs?: number
  /** Max total polling time (default 5 min). */
  timeoutMs?: number
}

export interface MonitorResult {
  ok: boolean
  jobId: string
  checkState: CheckState
  action: MonitorAction
  sha?: string | null
  checkRuns?: Array<{ name: string; conclusion: string | null; status: string }>
  diagnosis?: string
  note?: string
  issueUrl?: string | null
  error?: string | null
}

/** Fetch one job row from Supabase (best-effort). */
async function loadJob(jobId: string): Promise<any | null> {
  try {
    const db = dbc()
    const { data } = await (db as any)
      .from('content_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    return data ?? null
  } catch {
    return null
  }
}

function ownerRepo(job: any): { owner: string; repo: string } {
  const owner = (process.env.GITHUB_CONTENT_OWNER ?? process.env.GITHUB_REPO_OWNER ?? 'kylemwalkerpr-ship-it').trim()
  const target = String(job?.target_repo || process.env.GITHUB_REPO_NAME || '').trim()
  const cleaned = target.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
  if (cleaned.includes('/')) {
    const [o, r] = cleaned.split('/')
    return { owner: o, repo: r }
  }
  return { owner, repo: cleaned }
}

/** Read a fresh event log + append a new entry (best-effort). */
async function appendEvent(jobId: string, level: 'info' | 'warn' | 'error' | 'success', source: string, message: string, detail?: string) {
  try {
    const db = dbc()
    const { data } = await (db as any).from('content_jobs').select('event_log').eq('id', jobId).single()
    const log = Array.isArray((data as any)?.event_log) ? (data as any).event_log : []
    const next = [...log, { id: `log_${Date.now().toString(36)}`, ts: new Date().toISOString(), level, source, message, detail }]
    await (db as any).from('content_jobs').update({ event_log: next }).eq('id', jobId)
  } catch {}
}

/** Poll GitHub check-runs + combined status until terminal, red, or timeout. */
async function pollChecks(owner: string, repo: string, sha: string, opts: MonitorOptions): Promise<{ state: CheckState; runs: MonitorResult['checkRuns']; note?: string }> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000
  const intervalMs = 12_000
  const deadline = Date.now() + timeoutMs
  let lastNote = 'no checks yet'
  let emptyPolls = 0

  while (Date.now() < deadline) {
    try {
      const [checksRes, statusRes] = await Promise.all([
        githubFetch(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`).catch(() => null),
        githubFetch(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null),
      ])
      const runs = ((checksRes as any)?.check_runs ?? []) as Array<{ name?: string; status?: string; conclusion?: string | null }>
      if (runs.length) {
        emptyPolls = 0
        const mapped = runs.map((r) => ({ name: r.name ?? 'check', conclusion: r.conclusion ?? null, status: r.status ?? 'queued' }))
        const pending = runs.some((r) => r.status !== 'completed')
        const failed = runs.some((r) => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(String(r.conclusion || '')))
        lastNote = runs.map((r) => `${r.name}:${r.conclusion || r.status}`).join(', ').slice(0, 280)
        if (failed) return { state: 'failure', runs: mapped, note: lastNote }
        if (!pending) return { state: 'success', runs: mapped, note: lastNote }
      } else if (statusRes && (statusRes as any).state && (statusRes as any).state !== 'pending') {
        const st = String((statusRes as any).state)
        lastNote = `combined:${st}`
        if (st === 'success') return { state: 'success', runs: [], note: lastNote }
        if (st === 'failure' || st === 'error') return { state: 'failure', runs: [], note: lastNote }
      } else {
        emptyPolls++
        lastNote = 'waiting for check-runs to appear'
        if (emptyPolls >= 6) return { state: 'none', runs: [], note: 'no check-runs registered' }
      }
    } catch (e) {
      lastNote = e instanceof Error ? e.message : 'CI poll error'
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { state: 'pending', runs: [], note: lastNote }
}

/** Open (or reuse) a GitHub issue describing the CI failure. */
async function ensureIssue(owner: string, repo: string, job: any, sha: string, diagnosis: string): Promise<string | null> {
  try {
    const title = `[deploy] CI failed for "${String(job?.title || job?.topic || 'content').slice(0, 90)}"`
    // Reuse an existing open issue with the same title to avoid duplicates
    const existing = await githubFetch(`/repos/${owner}/${repo}/issues?state=open&per_page=100`).catch(() => null)
    const found = Array.isArray(existing) ? existing.find((i: any) => i?.title === title) : null
    if (found?.html_url) return found.html_url
    const body = [
      `**Job:** ${job?.id || '?'}`,
      `**PR:** ${job?.pr_url || job?.pr_number ? `#${job.pr_number}` : '—'}`,
      `**Head SHA:** \`${sha.slice(0, 7)}\``,
      `**Repo:** ${owner}/${repo}`,
      '',
      `### Diagnosis`,
      '```',
      String(diagnosis || 'CI check failed').slice(0, 2000),
      '```',
      '',
      'Auto-opened by the SEO Factory deploy monitor.',
    ].join('\n')
    const issue = await githubFetch(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    })
    return (issue as any)?.html_url ?? null
  } catch {
    return null
  }
}

/**
 * Monitor a single content job: poll CI for its PR head SHA, flag needs_revert
 * on failure, optionally open a GitHub issue, clear the flag on recovery.
 */
export async function monitorContentJob(jobId: string, opts: MonitorOptions = {}): Promise<MonitorResult> {
  const job = await loadJob(jobId)
  if (!job) return { ok: false, jobId, checkState: 'unknown', action: 'error', error: 'job not found' }

  const prNumber = Number(job.pr_number)
  const sha = String(job.deploy_sha || '')
  const { owner, repo } = ownerRepo(job)

  if (!prNumber && !sha) {
    return { ok: false, jobId, checkState: 'none', action: 'no_ci', note: 'job has no PR or deploy SHA', error: 'no PR/SHA to monitor' }
  }

  const db = dbc()
  try {
    // Optional settle delay so GitHub registers the head SHA
    if (opts.waitMs) await new Promise((r) => setTimeout(r, opts.waitMs))

    let headSha = sha
    if (!headSha && prNumber) {
      const pr: any = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`).catch(() => null)
      headSha = String(pr?.head?.sha || '')
    }
    if (!headSha) {
      return { ok: false, jobId, checkState: 'none', action: 'no_ci', note: 'no head SHA', error: 'no head SHA' }
    }

    const { state, runs, note } = await pollChecks(owner, repo, headSha, opts)
    const checkRuns = runs ?? []

    if (state === 'failure') {
      const failedNames = checkRuns.filter((r) => ['failure', 'timed_out', 'cancelled'].includes(String(r.conclusion))).map((r) => r.name).join(', ')
      const diagnosis = `CI failure on ${headSha.slice(0, 7)} — ${failedNames || note || 'checks failed'}`
      await (db as any)
        .from('content_jobs')
        .update({ needs_revert: true, revert_reason: diagnosis.slice(0, 240), status: job.status === 'merged' ? job.status : 'failed' })
        .eq('id', jobId)
      await appendEvent(jobId, 'warn', 'deployMonitor', `Needs revert: ${diagnosis.slice(0, 180)}`)

      let issueUrl: string | null = null
      let action: MonitorAction = 'none'
      if (opts.openIssueOnFailure) {
        issueUrl = await ensureIssue(owner, repo, job, headSha, diagnosis)
        action = issueUrl ? 'issue_opened' : 'issue_exists'
      }
      return { ok: false, jobId, checkState: 'failure', action, sha: headSha, checkRuns, diagnosis, note, issueUrl }
    }

    if (state === 'success') {
      await (db as any).from('content_jobs').update({ needs_revert: false, revert_reason: null, error_message: null }).eq('id', jobId)
      await appendEvent(jobId, 'success', 'deployMonitor', 'Deploy healthy — checks green')
      return { ok: true, jobId, checkState: 'success', action: 'healthy', sha: headSha, checkRuns, note }
    }

    if (state === 'none') {
      return { ok: true, jobId, checkState: 'none', action: 'no_ci', sha: headSha, note: note || 'no checks registered' }
    }

    // pending / timeout — leave as-is
    return { ok: false, jobId, checkState: state, action: 'pending', sha: headSha, checkRuns, note: note || 'CI still running' }
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300)
    return { ok: false, jobId, checkState: 'unknown', action: 'error', error: msg, note: msg }
  }
}

/** Scan the most recent jobs that have PRs / deploy SHAs and monitor each. */
export async function monitorRecentJobs(limit = 8): Promise<MonitorResult[]> {
  try {
    const db = dbc()
    const { data } = await (db as any)
      .from('content_jobs')
      .select('id')
      .in('status', ['merged', 'pr_created', 'publishing', 'deployed'])
      .order('created_at', { ascending: false })
      .limit(limit)
    const ids = (data ?? []).map((r: any) => r.id as string)
    const results: MonitorResult[] = []
    for (const id of ids) {
      results.push(await monitorContentJob(id, { openIssueOnFailure: false, timeoutMs: 20_000 }))
    }
    return results
  } catch (e: any) {
    return [{ ok: false, jobId: '', checkState: 'unknown', action: 'error', error: String(e?.message ?? e).slice(0, 200) }]
  }
}

/**
 * P0-3 legacy helper — lightweight check that flags needs_revert without
 * opening issues. Kept for dashboard one-off "check deploy health" actions.
 */
export async function checkDeployHealthForJob(jobId: string): Promise<DeployHealthResult> {
  const job = await loadJob(jobId)
  if (!job?.branch_name && !job?.pr_number) return { checked: false, reason: 'no branch/pr' }
  const { owner, repo } = ownerRepo(job)
  if (!repo) return { checked: false, reason: 'no repo' }
  const prNumber = Number(job.pr_number)
  try {
    const pr: any = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`).catch(() => null)
    const sha: string | undefined = pr?.head?.sha
    if (!sha) return { checked: false, reason: 'no head sha' }
    const [checksRes, statusRes] = await Promise.all([
      githubFetch(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=50`).catch(() => null),
      githubFetch(`/repos/${owner}/${repo}/commits/${sha}/status`).catch(() => null),
    ])
    const runs: Array<{ conclusion?: string | null; status?: string }> = (checksRes as any)?.check_runs ?? []
    const hasFailure = runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'timed_out' || r.conclusion === 'cancelled')
    const statusState: string | undefined = (statusRes as any)?.state
    const failed = hasFailure || statusState === 'failure'
    const db = dbc()
    if (failed) {
      const detail = runs.filter((r) => r.conclusion === 'failure').map(() => 'failure').join(', ') || statusState || 'checks failed'
      await (db as any).from('content_jobs').update({
        needs_revert: true,
        revert_reason: `CI failure on ${sha.slice(0, 7)} — ${String(detail).slice(0, 180)}`,
      }).eq('id', jobId)
      await appendEvent(jobId, 'warn', 'deployMonitor', `Needs revert: CI failure on ${sha.slice(0, 7)}`)
      return { checked: true, failed: true, sha }
    }
    if (job.needs_revert) {
      const allSuccess = runs.length > 0 && runs.every((r) => ['success', 'neutral', 'skipped'].includes(String(r.conclusion || '')))
      if (allSuccess || statusState === 'success') {
        await (db as any).from('content_jobs').update({ needs_revert: false, revert_reason: null }).eq('id', jobId)
      }
    }
    return { checked: true, failed: false, sha }
  } catch (e: any) {
    return { checked: false, reason: String(e?.message ?? e).slice(0, 200) }
  }
}
