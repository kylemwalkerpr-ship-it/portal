/**
 * POST /api/cron/content-studio-retry
 *
 * Re-queues content_jobs that have reached their scheduled retry window.
 * Works in concert with:
 *   - POST /api/cron/reconcile-content-jobs (heals stuck/failed jobs and stages them with
 *     exponential backoff via content_jobs.next_attempt_at + attempt_count).
 *   - lib/seoFactory/contentQualityGate (writes last_failure_kind + increments attempt_count).
 *
 * Selection logic:
 *   1. status IN ('drafting','pending','failed')
 *   2. (next_attempt_at IS NULL AND updated_at < now() - 15min)   -- legacy path
 *      OR (next_attempt_at <= now())                              -- staged path
 *   3. attempt_count < MAX_ATTEMPTS  (default 6)
 *
 * On each attempt we:
 *   - set status='drafting', clear next_attempt_at
 *   - re-run the pipeline with the resumeContent snapshot from the previous run
 *   - on success: mark merged/pr_created and null next_attempt_at
 *   - on failure: increment attempt_count, recompute next_attempt_at with
 *     exponential backoff + jitter (cap 6h), and surface last_failure_kind so
 *     the War Room can group failures.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 * Schedule: every 15 minutes.
 */
import { createClient } from '@supabase/supabase-js'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'

const BATCH_SIZE = 3
const COOLDOWN_MINUTES = 15
const MAX_ATTEMPTS = 6

/** Exponential backoff with jitter (capped at 6h). */
function backoffMinutes(attempt: number): number {
  const base = Math.min(360, Math.pow(2, attempt) * 5) // 5,10,20,40,80,160,… capped 360
  const jitter = Math.random() * Math.max(2, base * 0.25) // up to 25% of base, min 2m
  return Math.round(base + jitter)
}

interface RetryResult {
  id: string
  ok: boolean
  title: string
  topic: string
  attempt: number
  score: number | null
  nextAttemptAt?: string
  failureKind?: string
  error?: string
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

  // ── 1. Find jobs that are due for a retry ──────────────────────────────
  const legacyCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
  // We OR two selection branches via Union-style queries because `.or()` still
  // requires the row to satisfy all of the loose predicates. We keep it
  // simple: query the staged bucket first, then the legacy bucket.
  const { data: stagedJobs, error: stagedErr } = await supabase
    .from('content_jobs')
    .select('*')
    .in('status', ['drafting', 'pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (stagedErr) {
    return Response.json({ ok: false, error: stagedErr.message }, { status: 500 })
  }

  let picked = stagedJobs ?? []
  if (picked.length < BATCH_SIZE) {
    const remainder = BATCH_SIZE - picked.length
    const { data: legacyJobs, error: legacyErr } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('status', 'drafting')
      .is('next_attempt_at', null)
      .lt('updated_at', legacyCutoff)
      // Only take rows that have NOT already exceeded the cap (protect legacy rows)
      .or(`attempt_count.is.null,attempt_count.lt.${MAX_ATTEMPTS}`)
      .order('updated_at', { ascending: true })
      .limit(remainder)

    if (legacyErr) {
      return Response.json(
        { ok: false, staged: picked.length, error: legacyErr.message },
        { status: 500 },
      )
    }
    picked = picked.concat(legacyJobs ?? [])
  }

  if (!picked.length) {
    return Response.json({
      ok: true,
      retried: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      escalated: 0,
      message: 'No retry-due jobs found',
      cooldownMinutes: COOLDOWN_MINUTES,
      maxAttempts: MAX_ATTEMPTS,
    })
  }

  // ── 2. Process each job ─────────────────────────────────────────────────
  const results: RetryResult[] = []
  let succeeded = 0
  let failed = 0
  let escalated = 0

  for (const job of picked) {
    const title = String(job.title || job.topic || 'untitled').slice(0, 120)
    const topic = String(job.topic || title)
    const priorAttempts =
      typeof job.attempt_count === 'number' ? job.attempt_count : 0
    const attemptNumber = priorAttempts + 1

    // Already at max attempts → escalate to permanently failed (operator picks up).
    if (attemptNumber > MAX_ATTEMPTS) {
      await supabase
        .from('content_jobs')
        .update({
          status: 'failed',
          last_failure_kind: job.last_failure_kind || 'unknown',
          error_message: `Exceeded ${MAX_ATTEMPTS} auto-retries. Manual review required.`,
          next_attempt_at: null,
        })
        .eq('id', job.id)
      escalated++
      results.push({
        id: job.id,
        ok: false,
        title,
        topic,
        attempt: priorAttempts,
        score: typeof job.seo_score === 'number' ? job.seo_score : null,
        failureKind: job.last_failure_kind || 'unknown',
        error: 'max attempts exceeded',
      })
      continue
    }

    // ── 3. Mark the job as in-progress for this attempt ───────────────────
    await supabase
      .from('content_jobs')
      .update({
        status: 'drafting',
        attempt_count: attemptNumber,
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: null, // clear scheduled slot — we own the row now
      })
      .eq('id', job.id)

    // ── 4. Re-run the pipeline with the previous draft as resume content ──
    try {
      const primaryKeyword = String(job.primary_keyword || job.topic || '')
      const contentType =
        job.content_type === 'article' ? 'legal_guide' : job.content_type || 'legal_guide'

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
        // More refine attempts on retry to push through quality gates.
        maxRefine: 12,
        userId: job.user_id || 'system:cron',
      })

      const baseLog = Array.isArray(job.event_log) ? job.event_log : []
      const nextLog = [
        ...baseLog.slice(-200),
        {
          id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          level: result.ok ? 'success' : 'warn',
          source: 'retry-cron',
          attempt: attemptNumber,
          message: result.ok
            ? `Retry succeeded · audit ${result.audit.score} · ${result.ship?.status || 'no ship'}`
            : `Retry failed · audit ${result.audit.score} · ${result.shipError || 'gates held'}`,
          detail: result.error || result.shipError || undefined,
          failureKind: result.failureKind || null,
        },
      ]

      if (result.ok) {
        await supabase
          .from('content_jobs')
          .update({
            event_log: nextLog,
            next_attempt_at: null,
            last_failure_kind: null,
            ship_error: null,
          })
          .eq('id', job.id)
        succeeded++
        results.push({
          id: job.id,
          ok: true,
          title,
          topic,
          attempt: attemptNumber,
          score: result.audit.score,
        })
      } else {
        // Pipeline returned but gates held / ship errored.
        // Reschedule the next attempt with exponential backoff.
        const wait = backoffMinutes(attemptNumber)
        const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
        await supabase
          .from('content_jobs')
          .update({
            event_log: nextLog,
            seo_score: result.audit.score,
            word_count: result.audit.wordCount,
            audit_json: result.audit,
            status: 'drafting',
            error_message: result.error || result.shipError || null,
            ship_error: result.shipError || null,
            ship_provider: result.ship?.provider || null,
            last_failure_kind: result.failureKind || 'unknown',
            next_attempt_at: next,
          })
          .eq('id', job.id)
        failed++
        results.push({
          id: job.id,
          ok: false,
          title,
          topic,
          attempt: attemptNumber,
          score: result.audit.score,
          nextAttemptAt: next,
          failureKind: result.failureKind || 'unknown',
          error: result.error || result.shipError || 'gates held',
        })
      }
    } catch (e) {
      // Pipeline crashed (rate limit, timeout, schema mismatch, …).
      const msg = e instanceof Error ? e.message : 'Pipeline crash during retry'
      const baseLog = Array.isArray(job.event_log) ? job.event_log : []
      const failureKind =
        /rate.?limit|quota|429/i.test(msg)
          ? 'ai_provider'
          : /github|branch|sha|conflict/i.test(msg)
            ? 'github_push'
            : /timeout|abort|deadline/i.test(msg)
              ? 'timeout'
              : 'unknown'
      const wait = backoffMinutes(attemptNumber)
      const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
      const nextLog = [
        ...baseLog.slice(-200),
        {
          id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          level: 'error',
          source: 'retry-cron',
          attempt: attemptNumber,
          message: `Retry crashed: ${msg.slice(0, 200)}`,
          detail: msg,
          failureKind,
        },
      ]
      await supabase
        .from('content_jobs')
        .update({
          event_log: nextLog,
          error_message: msg.slice(0, 500),
          last_failure_kind: failureKind,
          next_attempt_at: next,
        })
        .eq('id', job.id)
      failed++
      results.push({
        id: job.id,
        ok: false,
        title,
        topic,
        attempt: attemptNumber,
        score: null,
        nextAttemptAt: next,
        failureKind,
        error: msg,
      })
    }
  }

  return Response.json({
    ok: failed === 0 && escalated === 0,
    processed: results.length,
    succeeded,
    failed,
    escalated,
    cooldownMinutes: COOLDOWN_MINUTES,
    maxAttempts: MAX_ATTEMPTS,
    results: results.map((r) => ({
      id: r.id,
      ok: r.ok,
      title: r.title.slice(0, 60),
      attempt: r.attempt,
      score: r.score,
      nextAttemptAt: r.nextAttemptAt,
      failureKind: r.failureKind,
      error: r.error?.slice(0, 150),
    })),
  })
}
