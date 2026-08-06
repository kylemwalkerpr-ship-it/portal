/**
 * portal-patch/lib/seoFactory/deployMonitor.ts — P0-3 Deploy monitor (portal/Supabase)
 * Polls GitHub check-runs + combined status for the PR head SHA.
 * On failure → flags content_jobs.needs_revert + revert_reason so the dashboard
 * can surface a revert / re-open CTA. On success → clears the flag.
 * Best-effort; never throws to caller. Portal variant uses Supabase, not Convex.
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

export async function checkDeployHealthForJob(jobId: string): Promise<DeployHealthResult> {
  const db = dbc()
  const { data: job } = await (db as any).from('content_jobs').select('branch_name, pr_number, target_repo, needs_revert').eq('id', jobId).single()
  if (!job?.branch_name || !job?.pr_number) return { checked: false, reason: 'no branch/pr' }
  const owner = (process.env.GITHUB_CONTENT_OWNER ?? process.env.GITHUB_REPO_OWNER ?? 'kylemwalkerpr-ship-it').trim()
  const repo = String(job.target_repo ?? process.env.GITHUB_REPO_NAME ?? '').trim()
  if (!repo) return { checked: false, reason: 'no repo' }
  const prNumber = Number(job.pr_number)
  try {
    const pr: any = await githubFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`)
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
    if (failed) {
      const detail = runs.filter((r) => r.conclusion === 'failure').map(() => 'failure').join(', ') || statusState || 'checks failed'
      await (db as any).from('content_jobs').update({
        needs_revert: true,
        revert_reason: `CI failure on ${sha.slice(0,7)} — ${String(detail).slice(0,180)}`,
        event_log: await appendEvent(jobId, 'warn', 'deployMonitor', `Needs revert: CI failure on ${sha.slice(0,7)}`),
      }).eq('id', jobId)
      return { checked: true, failed: true, sha }
    }
    if (job.needs_revert) {
      const allSuccess = runs.length > 0 && runs.every((r) => ['success','neutral','skipped'].includes(String(r.conclusion||'')))
      if (allSuccess || statusState === 'success') {
        await (db as any).from('content_jobs').update({ needs_revert: false, revert_reason: null }).eq('id', jobId)
      }
    }
    return { checked: true, failed: false, sha }
  } catch (e: any) {
    return { checked: false, reason: String(e?.message ?? e).slice(0, 200) }
  }
}

async function appendEvent(jobId: string, level: 'info'|'warn'|'error'|'success', source: string, message: string) {
  try {
    const db = dbc()
    const { data } = await db.from('content_jobs').select('event_log').eq('id', jobId).single()
    const log = Array.isArray((data as any)?.event_log) ? (data as any).event_log : []
    return [...log, { id: `log_${Date.now().toString(36)}`, ts: new Date().toISOString(), level, source, message }]
  } catch { return undefined }
}
