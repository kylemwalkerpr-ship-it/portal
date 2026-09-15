/**
 * POST /api/cron/content-studio-retry
 *
 * Re-queues due content_jobs with bounded exponential backoff. Contracted jobs
 * are reconstructed from their immutable WritingContractV2 via runStoredContentJob;
 * historical uncontracted rows retain the explicit legacy pipeline path.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PipelineResult } from '@/lib/seoFactory/pipeline'
import { parseRetryDeadlineMs } from '@/lib/seoFactory/retryDeadline'
import { runStoredContentJob, type StoredContentJob } from '@/lib/seoFactory/storedJobExecution'

const BATCH_SIZE = 1
const COOLDOWN_MINUTES = 15
const MAX_ATTEMPTS = 6

function backoffMinutes(attempt: number): number {
  const base = Math.min(360, Math.pow(2, attempt) * 5)
  const jitter = Math.random() * Math.max(2, base * 0.25)
  return Math.round(base + jitter)
}

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
  if (Array.isArray(audit.blockers) && audit.blockers.length > 0) return 'compliance_gate'
  if (typeof audit.score === 'number' && audit.score < 50) return 'compliance_gate'
  return 'unknown'
}

function classifyShipFailure(result: PipelineResult): FailureKind {
  const err = String(result.shipError || result.error || '')
  if (/rate.?limit|quota|429|exceeded/i.test(err)) return 'ai_provider'
  if (/branch|sha|conflict|github.*file/i.test(err)) return 'github_push'
  if (/merge|pr.*closed|cannot.*merge/i.test(err)) return 'github_merge'
  if (/timeout|abort|deadline|ETIMEDOUT/i.test(err)) return 'timeout'
  return classifyAuditBlockers(result.audit)
}

function classifyTextFailure(msg: string): FailureKind {
  if (/rate.?limit|quota|429/i.test(msg)) return 'ai_provider'
  if (/github|branch|sha|conflict/i.test(msg)) return 'github_push'
  if (/timeout|abort|deadline|ETIMEDOUT/i.test(msg)) return 'timeout'
  if (/schema|column.*does not exist|relation.*does not exist/i.test(msg)) return 'schema'
  if (/env|config|missing|MISSING/i.test(msg)) return 'config'
  return 'unknown'
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

interface JobRow extends StoredContentJob {
  status?: string | null
  event_log?: unknown
  attempt_count?: number | null
  next_attempt_at?: string | null
  last_attempt_at?: string | null
  last_failure_kind?: string | null
  seo_score?: number | null
  ship_error?: string | null
  error_message?: string | null
}

const RETRY_COLUMNS = [
  'id','status','title','topic','primary_keyword','region','content_type','tone','content','ship_mode','user_id',
  'event_log','attempt_count','next_attempt_at','last_failure_kind','seo_score','ship_error','error_message',
  'opportunity_id','contract_id','contract_version','contract_hash','evidence_hash',
  'required_short_keywords','required_long_tail_keywords','short_keyword_terms','long_tail_keyword_terms',
].join(',')

async function appendEvent(sb: SupabaseClient, jobId: string, entry: Record<string, unknown>) {
  const { data: row } = await sb.from('content_jobs').select('event_log').eq('id', jobId).maybeSingle()
  const base = Array.isArray((row as { event_log?: unknown } | null)?.event_log)
    ? (row as { event_log: unknown[] }).event_log
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
  if (!expected || provided !== expected) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const now = new Date().toISOString()
  const legacyCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()

  const { data: stagedRaw, error: stagedErr } = await supabase
    .from('content_jobs')
    .select(RETRY_COLUMNS)
    .in('status', ['drafting', 'pending', 'failed'])
    .lte('next_attempt_at', now)
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (stagedErr) return Response.json({ ok: false, error: stagedErr.message }, { status: 500 })

  let picked = (stagedRaw as unknown as JobRow[]) ?? []
  if (picked.length < BATCH_SIZE) {
    const { data: legacyRaw, error: legacyErr } = await supabase
      .from('content_jobs')
      .select(RETRY_COLUMNS)
      .eq('status', 'drafting')
      .is('next_attempt_at', null)
      .lt('updated_at', legacyCutoff)
      .or(`attempt_count.is.null,attempt_count.lt.${MAX_ATTEMPTS}`)
      .order('updated_at', { ascending: true })
      .limit(BATCH_SIZE - picked.length)
    if (legacyErr) return Response.json({ ok: false, staged: picked.length, error: legacyErr.message }, { status: 500 })
    picked = picked.concat((legacyRaw as unknown as JobRow[]) ?? [])
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

  const results: RetryResult[] = []
  let succeeded = 0
  let failed = 0
  let escalated = 0

  for (const job of picked) {
    const title = String(job.title || job.topic || 'untitled').slice(0, 120)
    const topic = String(job.topic || title)
    const priorAttempts = typeof job.attempt_count === 'number' ? job.attempt_count : 0
    const attemptNumber = priorAttempts + 1

    if (attemptNumber > MAX_ATTEMPTS) {
      await supabase.from('content_jobs').update({
        status: 'failed',
        last_failure_kind: job.last_failure_kind || 'unknown',
        error_message: `Exceeded ${MAX_ATTEMPTS} auto-retries. Manual review required.`,
        next_attempt_at: null,
      }).eq('id', job.id)
      escalated++
      results.push({
        id: job.id, ok: false, title, topic, attempt: priorAttempts,
        score: typeof job.seo_score === 'number' ? job.seo_score : null,
        failureKind: (job.last_failure_kind as FailureKind) || 'unknown',
        error: 'max attempts exceeded',
      })
      continue
    }

    await supabase.from('content_jobs').update({
      status: 'drafting',
      attempt_count: attemptNumber,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: null,
    }).eq('id', job.id)

    const deadlineMs = parseRetryDeadlineMs(process.env.CONTENT_STUDIO_RETRY_DEADLINE_MS)
    const abort = new AbortController()
    const deadlineTimer = setTimeout(() => abort.abort(), deadlineMs)
    try {
      const result = await runStoredContentJob(job, {
        minAuditScore: 55,
        maxRefine: 2,
        signal: abort.signal,
        regenerationMode: 'resume',
      })

      if (result.ok) {
        await supabase.from('content_jobs').update({
          next_attempt_at: null,
          last_failure_kind: null,
          ship_error: null,
        }).eq('id', job.id)
        await appendEvent(supabase, job.id, {
          level: 'success', source: 'retry-cron', attempt: attemptNumber,
          message: `Retry succeeded · audit ${result.audit.score} · ${result.ship?.status || 'no ship'}`,
          failureKind: null,
        })
        succeeded++
        results.push({ id: job.id, ok: true, title, topic, attempt: attemptNumber, score: result.audit.score })
      } else {
        const failureKind = classifyShipFailure(result)
        const wait = backoffMinutes(attemptNumber)
        const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
        await supabase.from('content_jobs').update({
          seo_score: result.audit.score,
          word_count: result.audit.wordCount,
          audit_json: result.audit,
          status: 'drafting',
          error_message: result.error || result.shipError || null,
          ship_error: result.shipError || null,
          last_failure_kind: failureKind,
          next_attempt_at: next,
        }).eq('id', job.id)
        await appendEvent(supabase, job.id, {
          level: 'warn', source: 'retry-cron', attempt: attemptNumber,
          message: `Retry failed · audit ${result.audit.score} · ${result.shipError || 'gates held'}`,
          detail: result.error || result.shipError || undefined,
          failureKind,
        })
        failed++
        results.push({
          id: job.id, ok: false, title, topic, attempt: attemptNumber,
          score: result.audit.score, nextAttemptAt: next, failureKind,
          error: result.error || result.shipError || 'gates held',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pipeline crash during retry'
      const failureKind = classifyTextFailure(message)
      const wait = backoffMinutes(attemptNumber)
      const next = new Date(Date.now() + wait * 60 * 1000).toISOString()
      // Do not replace content here. Contract-bound failure handling preserves
      // its strongest accepted draft before this scheduler records backoff.
      await supabase.from('content_jobs').update({
        error_message: message.slice(0, 500),
        last_failure_kind: failureKind,
        next_attempt_at: next,
      }).eq('id', job.id)
      await appendEvent(supabase, job.id, {
        level: 'error', source: 'retry-cron', attempt: attemptNumber,
        message: `Retry crashed: ${message.slice(0, 200)}`,
        detail: message, failureKind,
      })
      failed++
      results.push({
        id: job.id, ok: false, title, topic, attempt: attemptNumber, score: null,
        nextAttemptAt: next, failureKind, error: message,
      })
    } finally {
      clearTimeout(deadlineTimer)
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
    results: results.map((result) => ({
      id: result.id,
      ok: result.ok,
      title: result.title.slice(0, 60),
      attempt: result.attempt,
      score: result.score,
      nextAttemptAt: result.nextAttemptAt,
      failureKind: result.failureKind,
      error: result.error?.slice(0, 150),
    })),
  })
}
