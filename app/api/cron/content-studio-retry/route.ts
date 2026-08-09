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
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { runSeoFactoryPipeline, type PipelineResult } from '@/lib/seoFactory/pipeline'

const BATCH_SIZE = 3
const COOLDOWN_MINUTES = 15
const MAX_ATTEMPTS = 6

/** Exponential backoff with jitter (capped at 6h). */
function backoffMinutes(attempt: number): number {
  const base = Math.min(360, Math.pow(2, attempt) * 5) // 5,10,20,40,80,160,… capped 360
  const jitter = Math.random() * Math.max(2, base * 0.25) // up to 25% of base, min 2m
  return Math.round(base + jitter)
}

/**
 * Classify a PipelineResult that just failed into one of the closed set of
 * last_failure_kind values the schema constraint accepts. This mirrors what
 * the quality gate / ship pipeline already emits, but expressed so the queue
 * band and War Room can group failures without parsing error_message.
 */
const ALLOWED_KINDS = [
  'compliance_gate',
  'ai_provider',
  'github_push',
  'github_merge',
  'cloudflare_deploy',
  'schema',
  'config',
  'timeout',
  'unknown',
] as const

type FailureKind = (typeof ALLOWED_KINDS)[number]

function classifyAuditBlockers(audit: PipelineResult['audit'] | undefined): FailureKind {
  if (!audit) return 'unknown'
  // Ownership / YMYL / hard ship blockers → always compliance_gate.
  if (Array.isArray(audit.blockers) && audit.blockers.length > 0) return 'compliance_gate'
  // Score-wise we can't ship but no blockers → still compliance_gate (dry-report).
  if (typeof audit.score === 'number' && audit.score < 50) return 'compliance_gate'
  return 'unknown'
}

function classifyShipFailure(result: PipelineResult): FailureKind {
  const err = (result.shipError || result.error || '').toString()
  if (/rate.?limit|quota|429|exceeded/i.test(err)) return 'ai_provider'
  if (/branch|sha|conflict|github.*file/i.test(err)) return 'github_push'
  if (/merge|pr.*closed|cannot.*merge/i.test(err)) return 'github_merge'
  if (/timeout|abort|deadline|ETIMEDOUT/i.test(err)) return 'timeout'
  return classifyAuditBlockers(result.audit)
}

interface RetryResult {
  id: string
  ok: boolean
  title: string
  topic: string
  attempt: number
  score: number | null
  nextAttemptAt?: string
  failureKind?: FailureKind
  error?: string
}

interface JobRow {
  id: string
  status?: string | null
  title?: string | null
  topic?: string | null
  primary_keyword?: string | null
  region?: string | null
  content_type?: string | null
  tone?: string | null
  content?: string | null
  ship_mode?: string | null
  event_log?: unknown
  attempt_count?: number | null
  next_attempt_at?: string | null
  last_attempt_at?: string | null
  last_failure_kind?: string | null
  seo_score?: number | null
  user_id?: string | null
  ship_error?: string | null
  error_message?: string | null
  /** Mirrors the columns migration 20260812 adds — present after it runs. */
  ship_provider?: string | null
  ship_target_repo?: string | null
}

async function appendEvent(
  sb: SupabaseClient,
  jobId: string,
  entry: Record<string, unknown>,
) {
  const { data: row } = await sb
    .from('content_jobs')
    .select('event_log')
    .eq('id', jobId)
    .maybeSingle()
  const base = Array.isArray((row as { event_log?: unknown } | null)?.event_log)
    ? ((row as { event_log: unknown[] }).event_log)
    : []
  const next = [
    ...base.slice(-200),
    { id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...entry },
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

  // ── 1. Find jobs that are due for a retry ──────────────────────────────
  const legacyCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
  const { data: stagedRaw, error: stagedErr } = await supabase
    .from('content_jobs')
    .select(
      'id, status, title, topic, primary_keyword, region, content_type, tone, content, ship_mode, user_id, event_log, attempt_count, next_attempt_at, last_failure_kind, seo_score, ship_error, error_message',
    )
    .in('status', ['drafting', 'pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (stagedErr) {
    return Response.json({ ok: false, error: stagedErr.message }, { status: 500 })
  }

  const stagedJobs = (stagedRaw as unknown as JobRow[]) ?? []
  let picked: JobRow[] = stagedJobs
  if (picked.length < BATCH_SIZE) {
    const remainder = BATCH_SIZE - picked.length
    const { data: legacyRaw, error: legacyErr } = await supabase
      .from('content_jobs')
      .select(
        'id, status, title, topic, primary_keyword, region, content_type, tone, content, ship_mode, user_id, event_log, attempt_count, next_attempt_at, last_failure_kind, seo_score, ship_error, error_message',
      )
      .eq('status', 'drafting')
      .is('next_attempt_at', null)
      .lt('updated_at', legacyCutoff)
      .or(`attempt_count.is.null,attempt_count.lt.${MAX_ATTEMPTS}`)
      .order('updated_at', { ascending: true })
      .limit(remainder)

    if (legacyErr) {
      return Response.json(
        { ok: false, staged: picked.length, error: legacyErr.message },
        { status: 500 },
      )
    }
    const legacyJobs = (legacyRaw as unknown as JobRow[]) ?? []
    picked = picked.concat(legacyJobs)
  }

  if (!picked.length) {
    return Response.json({
      ok: true,
      retried: 0,
      succeeded: 0,
      failed: 0,
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
    const priorAttempts = typeof job.attempt_count === 'number' ? job.attempt_count : 0
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
        failureKind: (job.last_failure_kind as FailureKind) || 'unknown',
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

      const result: PipelineResult = await runSeoFactoryPipeline({
        topic,
        title,
        primaryKeyword,
        region: String(job.region || 'US'),
        contentType,
        tone: String(job.tone || 'educational'),
        resumeContent: job.content ? String(job.content) : undefined,
        shipMode: (job.ship_mode || 'pr') as PipelineResult['shipMode'],
        minAuditScore: 55,
        // More refine attempts on retry to push through quality gates.
        maxRefine: 12,
        userId: job.user_id || 'system:cron',
      })

      if (result.ok) {
        await supabase
          .from('content_jobs')
          .update({
            next_attempt_at: null,
            last_failure_kind: null,
            ship_error: null,
          })
          .eq('id', job.id)
        await appendEvent(supabase, job.id, {
          level: 'success',
          source: 'retry-cron',
          attempt: attemptNumber,
          message: `Retry succeeded · audit ${result.audit.score} · ${result.ship?.status || 'no ship'}`,
          failureKind: null,
        })
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
        const failureKind = classifyShipFailure(result)
        const wait = backoffMinutes(attemptNumber)
        const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
        await supabase
          .from('content_jobs')
          .update({
            seo_score: result.audit.score,
            word_count: result.audit.wordCount,
            audit_json: result.audit,
            status: 'drafting',
            error_message: result.error || result.shipError || null,
            ship_error: result.shipError || null,
            ship_target_repo: result.ship?.repo || null,
            last_failure_kind: failureKind,
            next_attempt_at: next,
          })
          .eq('id', job.id)
        await appendEvent(supabase, job.id, {
          level: 'warn',
          source: 'retry-cron',
          attempt: attemptNumber,
          message: `Retry failed · audit ${result.audit.score} · ${result.shipError || 'gates held'}`,
          detail: result.error || result.shipError || undefined,
          failureKind,
        })
        failed++
        results.push({
          id: job.id,
          ok: false,
          title,
          topic,
          attempt: attemptNumber,
          score: result.audit.score,
          nextAttemptAt: next,
          failureKind,
          error: result.error || result.shipError || 'gates held',
        })
      }
    } catch (e) {
      // Pipeline crashed (rate limit, timeout, schema mismatch, …).
      const msg = e instanceof Error ? e.message : 'Pipeline crash during retry'
      const failureKind = classifyTextFailure(msg)
      const wait = backoffMinutes(attemptNumber)
      const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
      await supabase
        .from('content_jobs')
        .update({
          error_message: msg.slice(0, 500),
          last_failure_kind: failureKind,
          next_attempt_at: next,
        })
        .eq('id', job.id)
      await appendEvent(supabase, job.id, {
        level: 'error',
        source: 'retry-cron',
        attempt: attemptNumber,
        message: `Retry crashed: ${msg.slice(0, 200)}`,
        detail: msg,
        failureKind,
      })
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

function classifyTextFailure(msg: string): FailureKind {
  if (/rate.?limit|quota|429/i.test(msg)) return 'ai_provider'
  if (/github|branch|sha|conflict/i.test(msg)) return 'github_push'
  if (/timeout|abort|deadline|ETIMEDOUT/i.test(msg)) return 'timeout'
  if (/schema|column.*does not exist|relation.*does not exist/i.test(msg)) return 'schema'
  if (/env|config|missing|MISSING/i.test(msg)) return 'config'
  return 'unknown'
}
