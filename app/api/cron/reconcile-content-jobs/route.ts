/**
 * POST /api/cron/reconcile-content-jobs
 *
 * Self-healing bookkeeping pass. It NEVER authors content. Stale/failed jobs
 * are staged with bounded backoff; content-studio-retry is the only cron that
 * executes a stored job, and it chooses the contract-bound runner whenever a
 * writing contract is attached.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STUCK_DRAFTING_MIN = 30
const ORPHAN_PR_DAYS = 14
const MAX_AUTOMATIC_ATTEMPTS = 5
const BATCH_SIZE = 5
const BACKOFF_MIN = [5, 15, 45, 120, 360]

interface JobRow {
  id: string
  status: string | null
  title: string | null
  topic: string | null
  event_log?: unknown
  attempt_count?: number | null
  next_attempt_at?: string | null
  last_attempt_at?: string | null
  last_failure_kind?: string | null
  ship_error?: string | null
  error_message?: string | null
  pr_url?: string | null
  merged_at?: string | null
  deploy_sha?: string | null
  branch_name?: string | null
  updated_at?: string | null
  created_at?: string | null
}

type FailureKind =
  | 'compliance_gate'
  | 'ai_provider'
  | 'github_push'
  | 'github_merge'
  | 'cloudflare_deploy'
  | 'schema'
  | 'config'
  | 'timeout'
  | 'unknown'

function classifyText(msg: string | null | undefined): FailureKind {
  const s = (msg || '').toString()
  if (/rate.?limit|quota|429|exceeded/i.test(s)) return 'ai_provider'
  if (/branch|sha|conflict|github.*file/i.test(s)) return 'github_push'
  if (/merge|pr.*closed|cannot.*merge/i.test(s)) return 'github_merge'
  if (/timeout|abort|deadline|ETIMEDOUT/i.test(s)) return 'timeout'
  if (/schema|column.*does not exist|relation.*does not exist/i.test(s)) return 'schema'
  if (/env|config|missing/i.test(s)) return 'config'
  return 'unknown'
}

async function appendLog(sb: SupabaseClient, jobId: string, ...parts: Array<{ [k: string]: unknown }>) {
  const result = await sb.from('content_jobs').select('event_log').eq('id', jobId).maybeSingle()
  const row = result.data as { event_log?: unknown[] } | null
  const base = Array.isArray(row?.event_log) ? row!.event_log! : []
  const next = [
    ...base.slice(-200),
    ...parts.map((p) => ({
      id: `recon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      ...p,
    })),
  ]
  await sb.from('content_jobs').update({ event_log: next }).eq('id', jobId)
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const nowIso = new Date().toISOString()
  const stuckCutoff = new Date(Date.now() - STUCK_DRAFTING_MIN * 60 * 1000).toISOString()
  const orphanCutoff = new Date(Date.now() - ORPHAN_PR_DAYS * 24 * 3600 * 1000).toISOString()

  const [stuckDrafting, dueFailed, orphanPrs] = await Promise.all([
    supabase.from('content_jobs')
      .select('id,status,title,topic,event_log,attempt_count,next_attempt_at,last_attempt_at,last_failure_kind,ship_error,error_message,updated_at')
      .eq('status', 'drafting').lt('updated_at', stuckCutoff).order('updated_at', { ascending: true }).limit(BATCH_SIZE),
    supabase.from('content_jobs')
      .select('id,status,title,topic,event_log,attempt_count,next_attempt_at,last_attempt_at,last_failure_kind,ship_error,error_message,updated_at')
      .eq('status', 'failed').is('next_attempt_at', null).lt('updated_at', orphanCutoff).order('updated_at', { ascending: true }).limit(BATCH_SIZE),
    supabase.from('content_jobs')
      .select('id,status,title,pr_url,merged_at,branch_name,deploy_sha,created_at,updated_at')
      .not('pr_url', 'is', null).is('merged_at', null).lt('created_at', orphanCutoff).limit(BATCH_SIZE),
  ])

  const summary = {
    scannedAt: nowIso,
    stuckDrafting: 0,
    failedRetried: 0,
    failedReachedMax: 0,
    orphans: 0,
    detail: [] as Array<{ id: string; category: string; ok: boolean; detail: string }>,
  }

  for (const raw of (stuckDrafting.data as unknown as JobRow[]) ?? []) {
    const r = await stageRetry(supabase, raw, `Stuck drafting > ${STUCK_DRAFTING_MIN}m`)
    summary.stuckDrafting++
    summary.detail.push({ id: raw.id, category: 'stuck_drafting', ok: r.ok, detail: r.detail })
  }

  for (const raw of (dueFailed.data as unknown as JobRow[]) ?? []) {
    const attemptCount = raw.attempt_count ?? 0
    if (attemptCount >= MAX_AUTOMATIC_ATTEMPTS) {
      await supabase.from('content_jobs').update({
        status: 'failed',
        error_message: `Reconcile: ${attemptCount} automatic attempts already exhausted.`,
      }).eq('id', raw.id)
      await appendLog(supabase, raw.id, {
        level: 'error', source: 'reconcile-cron',
        message: `Reconcile: ${attemptCount} attempts exhausted; awaiting manual review`,
      })
      summary.failedReachedMax++
      summary.detail.push({ id: raw.id, category: 'failed_max', ok: false, detail: 'auto attempts exhausted' })
      continue
    }
    const r = await stageRetry(supabase, raw, 'Stale failed with retry budget left')
    summary.failedRetried++
    summary.detail.push({ id: raw.id, category: 'failed_retry', ok: r.ok, detail: r.detail })
  }

  for (const orphan of (orphanPrs.data as unknown as JobRow[]) ?? []) {
    if (!orphan.pr_url) continue
    await supabase.from('content_jobs').update({
      status: 'closed',
      error_message: `Reconcile: open PR older than ${ORPHAN_PR_DAYS}d with no merge. Manual review required — webhook may have missed.`,
      ship_error: 'orphan-pr-aged',
      last_failure_kind: 'github_merge',
    }).eq('id', orphan.id)
    await appendLog(supabase, orphan.id, {
      level: 'warn', source: 'reconcile-cron',
      message: `Orphan PR (${orphan.pr_url}) still open after ${ORPHAN_PR_DAYS}d — flagged for review`,
    })
    summary.orphans++
    summary.detail.push({ id: orphan.id, category: 'orphan_pr', ok: true, detail: 'flagged for manual review' })
  }

  const nextAttemptPending = summary.failedRetried + summary.stuckDrafting
  return Response.json({
    ok: summary.failedReachedMax === 0,
    ...summary,
    note: nextAttemptPending > 0
      ? `${nextAttemptPending} job(s) staged for contract-aware retry cron.`
      : 'No jobs needed staging.',
    cooldownMinutes: STUCK_DRAFTING_MIN,
    maxAttempts: MAX_AUTOMATIC_ATTEMPTS,
    orphanPrDays: ORPHAN_PR_DAYS,
  })
}

async function stageRetry(
  supabase: SupabaseClient,
  job: JobRow,
  reason: string,
): Promise<{ ok: boolean; detail: string }> {
  const attemptCount = (job.attempt_count ?? 0) + 1
  if (attemptCount > MAX_AUTOMATIC_ATTEMPTS) {
    await supabase.from('content_jobs').update({
      status: 'failed',
      error_message: `Reconcile: max automatic attempts (${MAX_AUTOMATIC_ATTEMPTS}) exceeded. Manual review required.`,
      last_failure_kind: classifyText(job.ship_error || job.error_message),
      attempt_count: attemptCount,
      next_attempt_at: null,
    }).eq('id', job.id)
    await appendLog(supabase, job.id, {
      level: 'error', source: 'reconcile-cron',
      message: `Reconcile aborted: exceeded ${MAX_AUTOMATIC_ATTEMPTS} attempts`,
    })
    return { ok: false, detail: 'max attempts exceeded' }
  }

  const ladder = BACKOFF_MIN[Math.min(attemptCount - 1, BACKOFF_MIN.length - 1)]
  const jitter = Math.round(Math.random() * Math.max(2, ladder * 0.2))
  const next = new Date(Date.now() + (ladder + jitter) * 60 * 1000).toISOString()
  await supabase.from('content_jobs').update({
    status: 'drafting',
    attempt_count: attemptCount,
    // Do not claim an execution occurred here. The retry cron owns last_attempt_at
    // and all authoring; this pass only schedules the row.
    next_attempt_at: next,
    last_failure_kind: classifyText(job.ship_error || job.error_message),
  }).eq('id', job.id)
  await appendLog(supabase, job.id, {
    level: 'info', source: 'reconcile-cron',
    message: `Staged for contract-aware retry: ${reason} · attempt ${attemptCount} · ${ladder + jitter}m`,
  })
  return { ok: true, detail: 'staged for contract-aware retry cron' }
}
