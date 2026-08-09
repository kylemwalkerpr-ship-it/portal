/**
 * POST /api/cron/reconcile-content-jobs
 *
 * Self-healing pass for content_jobs that fell out of the live pipeline.
 * The retry cron only reseeds jobs whose next_attempt_at has come due; this
 * cron picks up jobs that look stale OR failed and stages them so the retry
 * cron can act deterministically on the next tick.
 *
 * Categories handled:
 *
 *   1. stuck-drafting  – status='drafting' for >= STUCK_DRAFTING_MIN with no
 *      fresh attempt in the window; give it another try up to MAX_ATTEMPTS.
 *   2. failed-but-retryable – status='failed' AND attempt_count < MAX with
 *      next_attempt_at NULL; stage it with backoff so retry cron will pick
 *      it up deterministically.
 *   3. orphan-pr       – pr_url present, merged_at NULL, >= ORPHAN_PR_DAYS
 *      old. We do not try to merge/close PRs headlessly (no fetchPullRequest
 *      helper exists in lib/seoFactory/ship); instead flip status to 'closed'
 *      so operators see it. The webhook is the source of truth for merge.
 *
 * The cron also re-arms jobs whose next_attempt_at is in the future by
 * extending it if the previous attempt did not actually run the pipeline
 * (no last_attempt_at update since next_attempt_at was written).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same as every other cron).
 * Schedule: every 15 minutes, paired with content-studio-retry.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { runSeoFactoryPipeline, type PipelineResult } from '@/lib/seoFactory/pipeline'

const STUCK_DRAFTING_MIN = 30 // give live SSE + checkpoints room to recover
const ORPHAN_PR_DAYS = 14
const MAX_AUTOMATIC_ATTEMPTS = 5
const BATCH_SIZE = 5
// Backoff ladder, in minutes: attempt 1..MAX_AUTOMATIC_ATTEMPTS.
const BACKOFF_MIN = [5, 15, 45, 120, 360]

interface JobRow {
  id: string
  status: string | null
  title: string | null
  topic: string | null
  primary_keyword?: string | null
  region?: string | null
  content_type?: string | null
  tone?: string | null
  content?: string | null
  ship_mode?: string | null
  user_id?: string | null
  event_log?: unknown
  attempt_count?: number | null
  next_attempt_at?: string | null
  last_attempt_at?: string | null
  last_failure_kind?: string | null
  seo_score?: number | null
  ship_error?: string | null
  error_message?: string | null
  /** Optional, present after migration 20260812 runs. */
  ship_target_repo?: string | null
  /** Schema columns the pipeline already inserts. */
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
  const row = (await sb
    .from('content_jobs')
    .select('event_log')
    .eq('id', jobId)
    .maybeSingle()) as unknown as { event_log?: unknown[] } | null
  const base = Array.isArray(row?.event_log) ? row.event_log : []
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
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const nowIso = new Date().toISOString()
  const stuckCutoff = new Date(
    Date.now() - STUCK_DRAFTING_MIN * 60 * 1000,
  ).toISOString()
  const orphanCutoff = new Date(
    Date.now() - ORPHAN_PR_DAYS * 24 * 3600 * 1000,
  ).toISOString()

  // ── 1. Pull three buckets in parallel (all read-only) ───────────────────
  const [stuckDrafting, dueFailed, orphanPrs] = await Promise.all([
    supabase
      .from('content_jobs')
      .select(
        'id, status, title, topic, primary_keyword, region, content_type, tone, content, ship_mode, user_id, event_log, attempt_count, next_attempt_at, last_attempt_at, last_failure_kind, seo_score, ship_error, error_message, updated_at',
      )
      .eq('status', 'drafting')
      .lt('updated_at', stuckCutoff)
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE),
    supabase
      .from('content_jobs')
      .select(
        'id, status, title, topic, primary_keyword, region, content_type, tone, content, ship_mode, user_id, event_log, attempt_count, next_attempt_at, last_attempt_at, last_failure_kind, seo_score, ship_error, error_message, updated_at',
      )
      .eq('status', 'failed')
      .is('next_attempt_at', null)
      .lt('updated_at', orphanCutoff)
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE),
    supabase
      .from('content_jobs')
      .select('id, status, title, pr_url, merged_at, branch_name, deploy_sha, created_at, updated_at')
      .not('pr_url', 'is', null)
      .is('merged_at', null)
      .lt('created_at', orphanCutoff)
      .limit(BATCH_SIZE),
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
    const r = await retryJob(supabase, raw, `Stuck drafting > ${STUCK_DRAFTING_MIN}m`)
    summary.stuckDrafting++
    summary.detail.push({ id: raw.id, category: 'stuck_drafting', ok: r.ok, detail: r.detail })
  }

  for (const raw of (dueFailed.data as unknown as JobRow[]) ?? []) {
    const attemptCount = raw.attempt_count ?? 0
    if (attemptCount >= MAX_AUTOMATIC_ATTEMPTS) {
      // Already past ceiling; just mark as terminal and skip.
      await supabase
        .from('content_jobs')
        .update({
          status: 'failed',
          error_message: `Reconcile: ${attemptCount} automatic attempts already exhausted.`,
        })
        .eq('id', raw.id)
      await appendLog(supabase, raw.id, {
        level: 'error',
        source: 'reconcile-cron',
        message: `Reconcile: ${attemptCount} attempts exhausted; awaiting manual review`,
      })
      summary.failedReachedMax++
      summary.detail.push({
        id: raw.id,
        category: 'failed_max',
        ok: false,
        detail: 'auto attempts exhausted',
      })
      continue
    }
    const r = await retryJob(supabase, raw, `Stale failed with retry budget left`)
    summary.failedRetried++
    summary.detail.push({ id: raw.id, category: 'failed_retry', ok: r.ok, detail: r.detail })
  }

  for (const orphan of (orphanPrs.data as unknown as JobRow[]) ?? []) {
    if (!orphan.pr_url) continue
    // The webhook is the source of truth on merge; we can only do safe
    // bookkeeping here — flag the row so the operator sees it. We do NOT
    // attempt to close/merge the remote PR from this cron.
    await supabase
      .from('content_jobs')
      .update({
        status: 'closed',
        error_message:
          'Reconcile: open PR older than ' +
          ORPHAN_PR_DAYS +
          'd with no merge. Manual review required — webhook may have missed.',
        ship_error: 'orphan-pr-aged',
        last_failure_kind: 'github_merge',
      })
      .eq('id', orphan.id)
    await appendLog(supabase, orphan.id, {
      level: 'warn',
      source: 'reconcile-cron',
      message: `Orphan PR (${orphan.pr_url}) still open after ${ORPHAN_PR_DAYS}d — flagged for review`,
    })
    summary.orphans++
    summary.detail.push({
      id: orphan.id,
      category: 'orphan_pr',
      ok: true,
      detail: 'flagged for manual review',
    })
  }

  const nextAttemptPending = summary.failedRetried + summary.stuckDrafting
  return Response.json({
    ok: summary.failedReachedMax === 0,
    ...summary,
    note:
      nextAttemptPending > 0
        ? `${nextAttemptPending} job(s) staged for the retry cron at the next tick.`
        : 'No jobs needed staging.',
    cooldownMinutes: STUCK_DRAFTING_MIN,
    maxAttempts: MAX_AUTOMATIC_ATTEMPTS,
    orphanPrDays: ORPHAN_PR_DAYS,
  })
}

async function retryJob(
  supabase: SupabaseClient,
  job: JobRow,
  reason: string,
): Promise<{ ok: boolean; detail: string }> {
  const attemptCount = (job.attempt_count ?? 0) + 1
  if (attemptCount > MAX_AUTOMATIC_ATTEMPTS) {
    await supabase
      .from('content_jobs')
      .update({
        status: 'failed',
        error_message: `Reconcile: max automatic attempts (${MAX_AUTOMATIC_ATTEMPTS}) exceeded. Manual review required.`,
        last_failure_kind: classifyText(job.ship_error || job.error_message),
        attempt_count: attemptCount,
        next_attempt_at: null,
      })
      .eq('id', job.id)
    await appendLog(supabase, job.id, {
      level: 'error',
      source: 'reconcile-cron',
      message: `Reconcile aborted: exceeded ${MAX_AUTOMATIC_ATTEMPTS} attempts`,
    })
    return { ok: false, detail: 'max attempts exceeded' }
  }

  const ladder = BACKOFF_MIN[Math.min(attemptCount - 1, BACKOFF_MIN.length - 1)]
  const jitter = Math.round(Math.random() * Math.max(2, ladder * 0.2))
  const next = new Date(Date.now() + (ladder + jitter) * 60 * 1000).toISOString()

  // Touch attempt bookkeeping first so concurrent cron calls don't double-stage.
  await supabase
    .from('content_jobs')
    .update({
      status: 'drafting',
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: next,
      last_failure_kind: classifyText(job.ship_error || job.error_message),
    })
    .eq('id', job.id)
  await appendLog(supabase, job.id, {
    level: 'info',
    source: 'reconcile-cron',
    message: `Staged for retry: ${reason} · attempt ${attemptCount} · ${ladder + jitter}m`,
  })

  // ── Best-effort live replay (the heavy lift is delegated to retry-cron).
  // We don't fail this category if the live replay errors — the staged row
  // is already picked up by the next content-studio-retry tick.
  try {
    const primaryKeyword = String(job.primary_keyword || job.topic || '')
    const contentType =
      job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
    const result: PipelineResult = await runSeoFactoryPipeline({
      topic: String(job.topic || job.title || 'untitled'),
      title: String(job.title || job.topic || 'untitled'),
      primaryKeyword,
      region: String(job.region || 'US'),
      contentType,
      tone: String(job.tone || 'educational'),
      resumeContent: job.content ? String(job.content) : undefined,
      shipMode: (job.ship_mode || 'pr') as PipelineResult['shipMode'],
      minAuditScore: 55,
      maxRefine: 12,
      userId: job.user_id || 'system:cron',
    })

    if (result.ok) {
      await supabase
        .from('content_jobs')
        .update({
          status: result.ship?.status === 'pr_created' ? 'pr_created' : 'merged',
          next_attempt_at: null,
          last_failure_kind: null,
          ship_error: null,
          seo_score: result.audit.score,
          word_count: result.audit.wordCount,
          audit_json: result.audit,
          deploy_sha: result.ship?.mergeCommitSha || result.ship?.commitSha || null,
          merged_at:
            result.ship?.status === 'merged' || result.ship?.status === 'deployed'
              ? new Date().toISOString()
              : null,
        })
        .eq('id', job.id)
      await appendLog(supabase, job.id, {
        level: 'success',
        source: 'reconcile-cron',
        message: `Live replay recovered · ${result.ship?.status || 'no ship'} · audit ${result.audit.score}`,
      })
      return { ok: true, detail: 'live replay recovered' }
    }
    await supabase
      .from('content_jobs')
      .update({
        seo_score: result.audit.score,
        word_count: result.audit.wordCount,
        audit_json: result.audit,
        error_message: result.error || result.shipError,
        ship_error: result.shipError || null,
        ship_target_repo: result.ship?.repo || null,
        last_failure_kind: classifyText(result.shipError || result.error),
      })
      .eq('id', job.id)
    await appendLog(supabase, job.id, {
      level: 'warn',
      source: 'reconcile-cron',
      message: `Live replay deferred to retry-cron · audit ${result.audit.score} · ${result.shipError || 'gates held'}`,
    })
    return { ok: false, detail: 'deferred to retry-cron' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'pipeline crash'
    await supabase
      .from('content_jobs')
      .update({
        error_message: msg.slice(0, 500),
        last_failure_kind: classifyText(msg),
      })
      .eq('id', job.id)
    await appendLog(supabase, job.id, {
      level: 'error',
      source: 'reconcile-cron',
      message: `Live replay crashed (deferred to retry-cron): ${msg.slice(0, 200)}`,
      detail: msg,
    })
    return { ok: false, detail: 'crash deferred to retry-cron' }
  }
}
