import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  scoreMaster,
  type MasterEngineInput,
  type IntentId,
  type SubsystemId,
  type EngineTraceStep,
} from '@/lib/seoFactory/masterEngine'
import { learnWeights, applyRewardNudges, type HistoricalOutcome } from '@/lib/seoFactory/masterEngineLearn'
import { buildOutcomeHistoryFromLiveGsc } from '@/lib/seoFactory/outcomeHistory'
import { jobToMasterEngineInput } from '@/lib/seoFactory/jobToMasterInput'

export const runtime = 'nodejs'
// Allow the live-GSC outcome-history build + streaming on long runs
export const maxDuration = 300

/**
 * POST /api/seo-engine/master/stream
 *
 * Live SSE stream of the Master SEO Engine run — the same computation as
 * POST /api/seo-engine/master, but the trace steps are emitted as they are
 * produced instead of one finished JSON report. Real checkpoints (auth →
 * job load → live-GSC outcome history → adaptive retrain) stream first,
 * then the detailed "watch it think" trace, then a `done` event with the
 * full report payload.
 *
 * Events (data: JSON):
 *   progress  { type:'progress', step: EngineTraceStep }
 *   done      { type:'done', report, learn, rewardNudges, outcomeHistory }
 *   error     { type:'error', error: string }
 */
export async function POST(request: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: {
    jobId?: string
    input?: MasterEngineInput
    history?: HistoricalOutcome[]
  } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
        } catch {
          closed = true
        }
      }

      // Monotonic step ordering across both the setup checkpoints and the
      // detailed buildEngineTrace steps (whose internal seq restarts at 0).
      let seq = 0
      const emitStep = (
        phase: string,
        message: string,
        detail: string | undefined,
        tone: EngineTraceStep['tone'],
      ) => {
        send({
          type: 'progress',
          step: { seq: seq++, phase, message, detail, tone, progress: 0 },
        })
      }

      try {
        emitStep('boot', 'Authenticated · starting Master SEO Engine', undefined, 'info')

        let input: MasterEngineInput = body.input || {}
        if (body.jobId) {
          emitStep('load', `Loading job ${body.jobId} …`, undefined, 'info')
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          )
          const { data: job, error } = await supabase
            .from('content_jobs')
            .select('*')
            .eq('id', body.jobId)
            .single()
          if (error || !job) {
            send({ type: 'error', error: `Job not found: ${error?.message || body.jobId}` })
            return
          }
          input = jobToMasterEngineInput(job)
          const words = String(input.content || '').trim().split(/\s+/).filter(Boolean).length
          emitStep(
            'load',
            `Job loaded · ${words.toLocaleString()} body words · ${input.contentType || 'legal_guide'} · ${input.region || '—'}`,
            undefined,
            'ok',
          )
        }

        // Real async checkpoint — this is the slowest part of the run and the
        // reason the trace should stream live rather than replay after a POST.
        emitStep('history', 'Building outcome history from live GSC …', undefined, 'info')
        let history: HistoricalOutcome[] = Array.isArray(body.history) ? body.history : []
        let outcomeHistory: {
          source: string
          matchedJobs: number
          pages: number
          warnings: string[]
        } | null = null
        if (history.length === 0) {
          const built = await buildOutcomeHistoryFromLiveGsc()
          history = built.history
          outcomeHistory = {
            source: built.source,
            matchedJobs: built.matchedJobs,
            pages: built.pages,
            warnings: built.warnings,
          }
        }
        emitStep(
          'history',
          history.length
            ? `Outcome history ready · ${outcomeHistory?.matchedJobs ?? history.length} job(s) · ${outcomeHistory?.pages ?? 0} GSC page(s)`
            : 'No live GSC outcomes — weights stay intent-conditioned',
          history.length && outcomeHistory?.warnings?.length
            ? outcomeHistory.warnings.slice(0, 2).join('; ')
            : undefined,
          history.length ? 'ok' : 'warn',
        )

        emitStep('learn', 'Retraining adaptive weights (batch regression + reward nudge) …', undefined, 'info')
        const learn = history.length ? learnWeights(history) : null
        const byIntent: Partial<Record<IntentId, Record<SubsystemId, number>>> = {}
        let rewardNudges: ReturnType<typeof applyRewardNudges>['nudges'] | null = null
        if (learn) {
          const nudged = applyRewardNudges(learn, history)
          Object.assign(byIntent, nudged.byIntent)
          rewardNudges = nudged.nudges
        }
        emitStep(
          'learn',
          learn
            ? `${learn.models.length} intent(s) retrained · ${rewardNudges?.length ?? 0} nudged`
            : 'No history — skipping retrain (intent-conditioned prior)',
          undefined,
          learn ? 'ok' : 'info',
        )

        const report = scoreMaster(input, { byIntent })

        // Emit the detailed trace (input → intent → weights → … → done) so the
        // client appends each step to the live feed in order.
        for (const s of report.trace) {
          send({ type: 'progress', step: { ...s, seq: seq++ } })
        }

        send({ type: 'done', report, learn, rewardNudges, outcomeHistory })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        send({ type: 'error', error: `Master engine failed: ${message}` })
      } finally {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch {
            /* already closed */
          }
        }
        closed = true
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
