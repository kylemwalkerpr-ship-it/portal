/**
 * POST /api/cron/reconcile-content-jobs
 *
 * Production safeguard against the "jobs keep failing" issue:
 *   * Picks up jobs stuck in 'drafting' past STUCK_DRAFTING_MIN  → retry via
 *     the seo-factory pipeline (resume from saved content when available).
 *   * Picks up 'failed' jobs whose next_attempt_at is due OR defaulted via
 *     the backoff ladder → retry.
 *   * Detects orphan PRs (pr_url set, merged_at null, created > 14d ago) →
 *     refresh_pr via GitHub API and transition to 'closed' if PR is gone.
 *   * Marks ship_error rows with a clear last_failure_kind so dashboards can
 *     group them.
 *
 * Self-healing policy: this cron never deletes content. It only transitions
 * status / schedules the next attempt. Operators can still inspect history
 * via the War Room merge + event_log timelines.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * Schedule: every 15 minutes via GitHub Actions.
 */
import { createClient } from '@supabase/supabase-js'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'
import { fetchPullRequest, parseRepoSlug } from '@/lib/seoFactory/ship'

const STUCK_DRAFTING_MIN = 30 // give the live SSE + checkpoints room to recover
const ORPHAN_PR_DAYS = 14
const MAX_AUTOMATIC_ATTEMPTS = 5
const BATCH_SIZE = 5
// Backoff ladder, in minutes: attempt 0..MAX_AUTOMATIC_ATTEMPTS.
const BACKOFF_MIN = [5, 15, 45, 120, 360]

interface Row {
  id: string
  status: string
  title: string | null
  topic: string | null
  content: string | null
  content_type: string | null
  tone: string | null
  region: string | null
  primary_keyword: string | null
  ship_mode: string | null
  indexable: boolean | null
  target_repo: string | null
  pr_url: string | null
  pr_number: number | null
  branch_name: string | null
  attempt_count: number | null
  next_attempt_at: string | null
  ship_error: string | null
  ship_target_repo: string | null
  updated_at: string | null
  created_at: string | null
  event_log: unknown
  last_failure_kind: string | null
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function appendLog(supabase: ReturnType<typeof sb>, jobId: string, level: string, source: string, message: string, detail?: string) {
  try {
    const { data, error } = await supabase.from('content_jobs').select('event_log').eq('id', jobId).single()
    if (error) return
    const prev = Array.isArray(data?.event_log) ? data.event_log : []
    const next = [...prev, {
      id: `reconcile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      level,
      source,
      message: message.slice(0, 1800),
      detail: detail ? detail.slice(0, 3500) : undefined,
    }].slice(-300)
    await supabase.from('content_jobs').update({ event_log: next }).eq('id', jobId)
  } catch (e) {
    /* event_log column may not exist yet — non-fatal */
    console.warn('[reconcile-content-jobs] could not append log', e)
  }
}

function scheduleNextAttempt(attempt: number): string | null {
  const idx = Math.min(attempt, BACKOFF_MIN.length - 1)
  return new Date(Date.now() + BACKOFF_MIN[idx] * 60_000 + Math.floor(Math.random() * 30_000)).toISOString()
}

function categorizeFailure(message: string | null): string {
  if (!message) return 'unknown'
  const m = message.toLowerCase()
  if (/ship refused|quality gate|gate/.test(m)) return 'compliance_gate'
  if (/credit|api key|provider|rate|quota|timeout|fetch/.test(m)) return 'ai_provider'
  if (/github|pr|push|merge conflict|merge failed|branch/.test(m)) return 'github_push'
  if (/cloudflare|deploy|wrangler|page /.test(m)) return 'cloudflare_deploy'
  if (/column|relation|sql|schema/.test(m)) return 'schema'
  if (/env|missing|not configured/.test(m)) return 'config'
  if (/exceed|max retries|aborted/.test(m)) return 'timeout'
  return 'unknown'
}

async function retryJob(supabase: ReturnType<typeof sb>, job: Row, reason: string): Promise<{ ok: boolean; detail: string }> {
  const attemptCount = (job.attempt_count ?? 0) + 1
  if (attemptCount > MAX_AUTOMATIC_ATTEMPTS) {
    await supabase.from('content_jobs').update({
      status: 'failed',
      error_message: `Reconcile: max automatic attempts (${MAX_AUTOMATIC_ATTEMPTS}) exceeded. Manual review required.`,
      last_failure_kind: categorizeFailure(job.ship_error || job.error_message_for_kind || null),
      attempt_count: attemptCount,
      next_attempt_at: null,
    }).eq('id', job.id)
    await appendLog(supabase, job.id, 'error', 'reconcile-cron', `Reconcile aborted: exceeded ${MAX_AUTOMATIC_ATTEMPTS} attempts`)
    return { ok: false, detail: 'max attempts exceeded' }
  }
  try {
    const contentType =
      job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'
    const title = String(job.title || job.topic || 'Untitled')
    const topic = String(job.topic || title)
    const primaryKeyword = String(job.primary_keyword || topic)
    const result = await runSeoFactoryPipeline({
      topic,
      title,
      primaryKeyword,
      region: String(job.region || 'US'),
      contentType,
      tone: String(job.tone || 'educational'),
      resumeContent: job.content ? String(job.content) : undefined,
      shipMode: (job.ship_mode || 'pr') as 'pr' | 'merge' | 'auto' | 'autodeploy' | 'none',
      minAuditScore: 55,
      maxRefine: 10,
      attempt: attemptCount,
      userId: 'system:reconcile',
    } as any)

    const newStatus = result.ok ? 'pr_created' : 'drafting'
    const nextAttempt = result.ok ? null : scheduleNextAttempt(attemptCount)
    const lastFailureKind = result.ok ? null : categorizeFailure(result.shipError || result.error)
    await supabase.from('content_jobs').update({
      status: newStatus,
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: nextAttempt,
      last_failure_kind: lastFailureKind,
      ship_error: result.shipError || null,
      ship_provider: result.provider || null,
      error_message: result.ok ? null : (result.shipError || result.error || null),
    }).eq('id', job.id)
    await appendLog(
      supabase, job.id, result.ok ? 'success' : 'warn', 'reconcile-cron',
      `${reason} · attempt ${attemptCount} · ${result.ok ? 'succeeded' : 'still pending'} · score=${result.audit?.score ?? '?'}`,
      result.ok ? undefined : (result.shipError || result.error || ''),
    )
    return {
      ok: result.ok,
      detail: result.ok ? 'recovered' : (result.shipError || result.error || 'still failing'),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reconcile retry crashed'
    await supabase.from('content_jobs').update({
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: scheduleNextAttempt(attemptCount),
      last_failure_kind: categorizeFailure(msg),
      error_message: msg.slice(0, 500),
    }).eq('id', job.id)
    await appendLog(supabase, job.id, 'error', 'reconcile-cron', `Reconcile retry crashed: ${msg.slice(0, 200)}`, msg)
    return { ok: false, detail: msg }
  }
}

async function inspectOrphanPr(supabase: ReturnType<typeof sb>, job: Row): Promise<{ ok: boolean; detail: string }> {
  if (!job.pr_url || !job.target_repo || !job.pr_number) {
    return { ok: false, detail: 'no pr metadata' }
  }
  const { owner, repo } = parseRepoSlug(String(job.target_repo))
  try {
    const pr = await fetchPullRequest(owner, repo, job.pr_number)
    if (pr.state === 'closed' && !pr.merged) {
      await supabase.from('content_jobs').update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        error_message: 'PR closed without merge after 14+ days — orphan. Operator review.',
        last_failure_kind: 'github_push',
      }).eq('id', job.id)
      await appendLog(supabase, job.id, 'warn', 'reconcile-cron', `Orphan PR marked closed (was open ${ORPHAN_PR_DAYS}d+)`)
      return { ok: true, detail: 'orphan closed' }
    }
    if (pr.merged && !job.merged_at) {
      await supabase.from('content_jobs').update({
        status: 'merged',
        merged_at: pr.merged_at || new Date().toISOString(),
        deploy_sha: pr.merge_commit_sha || job.branch_name || null,
      }).eq('id', job.id)
      await appendLog(supabase, job.id, 'success', 'reconcile-cron', 'Orphan PR found merged — status corrected')
      return { ok: true, detail: 'merged caught up' }
    }
    return { ok: true, detail: `pr ${pr.state}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'PR inspect failed'
    await appendLog(supabase, job.id, 'warn', 'reconcile-cron', `PR inspect failed: ${msg.slice(0, 200)}`)
    return { ok: false, detail: msg }
  }
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = sb()

  // ── 1. Stuck 'drafting' jobs (silent process death) ────────────────────
  const stuckCutoff = new Date(Date.now() - STUCK_DRAFTING_MIN * 60_000).toISOString()
  const { data: stuckDrafting, error: stuckErr } = await supabase
    .from('content_jobs')
    .select('id, status, title, topic, content, content_type, tone, region, primary_keyword,' +
            'ship_mode, indexable, target_repo, pr_url, pr_number, branch_name,' +
            'attempt_count, next_attempt_at, ship_error, ship_target_repo, updated_at,' +
            'created_at, event_log, last_failure_kind')
    .eq('status', 'drafting')
    .lt('updated_at', stuckCutoff)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (stuckErr) {
    return Response.json({ ok: false, error: stuckErr.message }, { status: 500 })
  }

  // ── 2. Failed jobs whose retry window has elapsed ───────────────────────
  //         (`next_attempt_at` may be null on old rows: backstop with the
  //         fallback cooldown for jobs older than 30 minutes.)
  const nowIso = new Date().toISOString()
  const { data: dueFailed, error: dueErr } = await supabase
    .from('content_jobs')
    .select('id, status, title, topic, content, content_type, tone, region, primary_keyword,' +
            'ship_mode, indexable, target_repo, pr_url, pr_number, branch_name,' +
            'attempt_count, next_attempt_at, ship_error, ship_target_repo, updated_at,' +
            'created_at, event_log, last_failure_kind')
    .eq('status', 'failed')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .lt('updated_at', stuckCutoff)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (dueErr) {
    return Response.json({ ok: false, error: dueErr.message }, { status: 500 })
  }

  // ── 3. Orphan PRs ───────────────────────────────────────────────────────
  const orphanCutoff = new Date(Date.now() - ORPHAN_PR_DAYS * 86_400_000).toISOString()
  const { data: orphanPrs, error: orphanErr } = await supabase
    .from('content_jobs')
    .select('id, status, title, topic, content, content_type, tone, region, primary_keyword,' +
            'ship_mode, indexable, target_repo, pr_url, pr_number, branch_name,' +
            'attempt_count, next_attempt_at, ship_error, ship_target_repo, updated_at,' +
            'created_at, event_log, last_failure_kind')
    .eq('status', 'pr_created')
    .not('pr_url', 'is', null)
    .lt('created_at', orphanCutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (orphanErr) {
    return Response.json({ ok: false, error: orphanErr.message }, { status: 500 })
  }

  const summary = {
    ok: true,
    scannedAt: nowIso,
    stuckDrafting: 0,
    failedRetried: 0,
    failedReachedMax: 0,
    orphans: 0,
    detail: [] as Array<{ id: string; category: string; ok: boolean; detail: string }>,
  }

  for (const job of (stuckDrafting ?? []) as Row[]) {
    const r = await retryJob(supabase, job, `Stuck drafting > ${STUCK_DRAFTING_MIN}m`)
    summary.stuckDrafting++
    summary.detail.push({ id: job.id, category: 'stuck_drafting', ok: r.ok, detail: r.detail })
  }
  for (const job of (dueFailed ?? []) as Row[]) {
    const attemptCount = job.attempt_count ?? 0
    if (attemptCount >= MAX_AUTOMATIC_ATTEMPTS) {
      // Already past ceiling; just mark as terminal and skip.
      await supabase.from('content_jobs').update({
        status: 'failed',
        error_message: `Reconcile: ${attemptCount} automatic attempts already exhausted.`,
      }).eq('id', job.id)
      summary.failedReachedMax++
      summary.detail.push({ id: job.id, category: 'failed_max', ok: false, detail: 'cap reached' })
      continue
    }
    const r = await retryJob(supabase, job, 'Failed retry window elapsed')
    if (r.ok) summary.failedRetried++
    summary.detail.push({ id: job.id, category: 'failed_retry', ok: r.ok, detail: r.detail })
  }
  for (const job of (orphanPrs ?? []) as Row[]) {
    const r = await inspectOrphanPr(supabase, job)
    if (r.ok) summary.orphans++
    summary.detail.push({ id: job.id, category: 'orphan_pr', ok: r.ok, detail: r.detail })
  }

  return Response.json({
    ...summary,
    backoffMinutes: BACKOFF_MIN,
    maxAttempts: MAX_AUTOMATIC_ATTEMPTS,
    stuckThresholdMinutes: STUCK_DRAFTING_MIN,
    orphanPrDays: ORPHAN_PR_DAYS,
  })
}
