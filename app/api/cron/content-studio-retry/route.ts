/**
 * POST /api/cron/content-studio-retry
 *
 * Re-queues content_jobs stuck in 'drafting' status after a cooldown period.
 * When the pipeline exhausts all refine passes and ship is withheld, the job
 * lands in 'drafting' rather than 'failed' — this cron picks it up and gives
 * it another try so quality gate feedback is actually looped back in.
 *
 * Cooldown: only retry jobs that have been in 'drafting' for ≥15 minutes
 * (prevents tight retry storms when a job genuinely cannot pass its gates).
 *
 * Max retries: tracked via event_log entries. Jobs retried ≥5 times are
 * automatically moved to 'failed' so they don't loop forever.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as all other cron routes).
 * Schedule: every 30 minutes via GitHub Actions or Cloudflare Cron Triggers.
 */
import { createClient } from '@supabase/supabase-js'
import { runSeoFactoryPipeline } from '@/lib/seoFactory/pipeline'

const BATCH_SIZE = 3
const COOLDOWN_MINUTES = 15
const MAX_RETRIES = 5

interface RetryResult {
  id: string
  ok: boolean
  title: string
  topic: string
  retryCount: number
  score: number | null
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

  // ── 1. Find drafting jobs past the cooldown ────────────────────────────
  const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString()
  const { data: jobs, error } = await supabase
    .from('content_jobs')
    .select('*')
    .eq('status', 'drafting')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!jobs?.length) {
    return Response.json({
      ok: true,
      retried: 0,
      failed: 0,
      skipped: 0,
      message: 'No drafting jobs past cooldown',
    })
  }

  // ── 2. Compute retry count from event_log for each job ─────────────────
  const results: RetryResult[] = []
  let retried = 0
  let failed = 0
  let skipped = 0

  for (const job of jobs) {
    // Count previous retries from event_log entries
    const log = Array.isArray(job.event_log) ? job.event_log : []
    const retryCount = log.filter(
      (e: { source?: string; message?: string }) =>
        e.source === 'retry-cron',
    ).length

    // Skip if over max retries — mark as failed so manual review picks it up
    if (retryCount >= MAX_RETRIES) {
      const title = String(job.title || job.topic || 'untitled').slice(0, 120)
      await supabase
        .from('content_jobs')
        .update({
          status: 'failed',
          error_message: `Exceeded ${MAX_RETRIES} auto-retries. Manual review required.`,
        })
        .eq('id', job.id)
      skipped++
      results.push({
        id: job.id,
        ok: false,
        title,
        topic: String(job.topic || ''),
        retryCount,
        score: null,
        error: 'max retries exceeded',
      })
      continue
    }

    // ── 3. Re-run the pipeline for this drafted job ──────────────────────
    try {
      const title = String(job.title || job.topic || 'untitled')
      const topic = String(job.topic || title)
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
        shipMode: (job.ship_mode || 'pr') as 'pr' | 'merge' | 'auto' | 'autodeploy' | 'none',
        minAuditScore: 55,
        // More refine attempts on retry to push through quality gates
        maxRefine: 12,
        userId: job.user_id || 'system:cron',
      })

      // Append retry event to log
      const nextLog = [
        ...log.slice(-200),
        {
          id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          level: result.ok ? 'success' : 'warn',
          source: 'retry-cron',
          message: result.ok
            ? `Retry succeeded · audit ${result.audit.score} · ${result.ship?.status || 'no ship'}`
            : `Retry failed · audit ${result.audit.score} · ${result.shipError || 'gates held'}`,
          detail: result.error || result.shipError || undefined,
        },
      ]

      await supabase
        .from('content_jobs')
        .update({ event_log: nextLog })
        .eq('id', job.id)

      if (result.ok) {
        retried++
        results.push({
          id: job.id,
          ok: true,
          title,
          topic,
          retryCount: retryCount + 1,
          score: result.audit.score,
        })
      } else {
        // Pipeline ran but gates held — job stays in 'drafting' with fresh updated_at
        // so the cooldown restarts. Update audit_json so the dashboard shows latest state.
        await supabase
          .from('content_jobs')
          .update({
            seo_score: result.audit.score,
            word_count: result.audit.wordCount,
            audit_json: result.audit,
            error_message: result.error || result.shipError || null,
          })
          .eq('id', job.id)
        failed++
        results.push({
          id: job.id,
          ok: false,
          title,
          topic,
          retryCount: retryCount + 1,
          score: result.audit.score,
          error: result.error || result.shipError || 'gates held',
        })
      }
    } catch (e) {
      // Pipeline crashed (transient error, timeout, etc.) — log and leave in drafting
      const msg = e instanceof Error ? e.message : 'Pipeline crash during retry'
      const title = String(job.title || job.topic || 'untitled')
      const log = Array.isArray(job.event_log) ? job.event_log : []
      const nextLog = [
        ...log.slice(-200),
        {
          id: `retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          level: 'error',
          source: 'retry-cron',
          message: `Retry crashed: ${msg.slice(0, 200)}`,
          detail: msg,
        },
      ]
      await supabase
        .from('content_jobs')
        .update({ event_log: nextLog, error_message: msg.slice(0, 500) })
        .eq('id', job.id)
      failed++
      results.push({
        id: job.id,
        ok: false,
        title,
        topic: String(job.topic || ''),
        retryCount: retryCount,
        score: null,
        error: msg,
      })
    }
  }

  return Response.json({
    ok: failed === 0,
    processed: results.length,
    retried,
    failed,
    skipped,
    cooldownMinutes: COOLDOWN_MINUTES,
    maxRetries: MAX_RETRIES,
    results: results.map((r) => ({
      id: r.id,
      ok: r.ok,
      title: r.title.slice(0, 60),
      retryCount: r.retryCount,
      score: r.score,
      error: r.error?.slice(0, 150),
    })),
  })
}
