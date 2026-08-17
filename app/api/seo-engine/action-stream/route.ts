import { requireAdminUser } from '@/lib/portalAuth'
import { ingestKnowledge, recordEngineRun } from '@/lib/seoEngine/knowledge'
import { runPlanner } from '@/lib/seoEngine/planner'
import { runVisibilityAudits } from '@/lib/seoEngine/llmVisibility'

export const runtime = 'nodejs'
export const maxDuration = 300

type ActionKind = 'ingest' | 'plan' | 'llm'

/**
 * POST /api/seo-engine/action-stream
 *
 * Live SSE stream of the masthead engine actions (🌐 Ingest / 🧭 Plan /
 * 🤖 LLM audit). Dispatches to the same engines as the non-streaming routes
 * but forwards their `onProgress` callbacks as `progress` events so the
 * masthead can show real activity instead of a silent spinner.
 *
 * Body: { kind: 'ingest' | 'plan' | 'llm', ...actionArgs }
 *
 * Events (data: JSON):
 *   progress  { type:'progress', step: { seq, phase, message, detail?, tone } }
 *   done      { type:'done', kind, summary, result }
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

  let body: { kind?: ActionKind } & Record<string, unknown> = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const kind: ActionKind = body.kind === 'plan' ? 'plan' : body.kind === 'llm' ? 'llm' : 'ingest'

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

      let seq = 0
      const emitStep = (phase: string, message: string, detail?: string) => {
        const tone = phase === 'store' || phase === 'result' || phase === 'done' ? 'ok' : phase === 'error' ? 'warn' : 'info'
        send({ type: 'progress', step: { seq: seq++, phase, message, detail, tone, progress: 0 } })
      }
      const onProgress = (phase: string, message: string, detail?: string) => emitStep(phase, message, detail)

      const KIND_LABEL: Record<ActionKind, string> = { ingest: 'knowledge ingestion', plan: 'planner', llm: 'LLM visibility audit' }

      try {
        emitStep('boot', `Authenticated · running ${KIND_LABEL[kind]} …`)

        if (kind === 'ingest') {
          const result = await ingestKnowledge({
            sources: Array.isArray(body.sources) ? (body.sources as string[]) : undefined,
            limitPerSource: body.limitPerSource != null ? Number(body.limitPerSource) : 8,
            aiSummarize: body.aiSummarize !== false,
            maxAiItems: body.maxAiItems != null ? Number(body.maxAiItems) : 8,
            onProgress,
          })
          const { classifyEngineRunStatus } = await import('@/lib/seoEngine/engineRunSummary')
          const status = classifyEngineRunStatus({
            phase: 'knowledge',
            itemsStored: result.itemsStored,
            sourcesRun: result.sourcesRun,
            sourceErrors: result.errors.length,
          })
          await recordEngineRun('knowledge', status, {
            sourcesRun: result.sourcesRun,
            itemsFetched: result.itemsFetched,
            itemsStored: result.itemsStored,
            aiSummarized: result.aiSummarized,
            skipped: result.skipped,
            ingestErrors: result.errors.length,
          }, [...result.errors, ...result.aiErrors].slice(0, 20), 'admin')
          emitStep('done', `Ingested ${result.itemsStored} item(s) from ${result.sourcesRun} source(s)`, result.errors.slice(0, 2).join('; ') || undefined)
          send({ type: 'done', kind, summary: `Ingested ${result.itemsStored} items from ${result.sourcesRun} sources`, result })
        } else if (kind === 'plan') {
          const plans = await runPlanner({
            stage: body.stage ? String(body.stage) : undefined,
            country: body.country ? String(body.country) : undefined,
            draftBriefs: body.draftBriefs !== false,
            limit: body.limit != null ? Number(body.limit) : 10,
            onProgress,
          })
          await recordEngineRun('plan', plans.length ? 'success' : 'partial', { plans: plans.length }, [], 'admin')
          emitStep('done', `Planner produced ${plans.length} ranked cluster mission(s)`)
          send({ type: 'done', kind, summary: `Planner produced ${plans.length} ranked cluster missions`, result: { plans, count: plans.length } })
        } else {
          const result = await runVisibilityAudits({
            queries: Array.isArray(body.queries) ? (body.queries as string[]) : undefined,
            engineLabel: body.engineLabel ? String(body.engineLabel) : undefined,
            maxAudits: body.maxAudits != null ? Number(body.maxAudits) : 6,
            onProgress,
          })
          emitStep('done', `LLM audit: ${result.cited}/${result.total} cited the estate (${result.shareOfVoice}%)`)
          send({ type: 'done', kind, summary: `LLM audit: ${result.cited}/${result.total} queries cited the estate`, result })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        try {
          if (kind === 'ingest' || kind === 'plan') {
            await recordEngineRun(kind === 'ingest' ? 'knowledge' : 'plan', 'failed', {}, [message], 'admin')
          }
        } catch { /* best-effort */ }
        send({ type: 'error', error: `${KIND_LABEL[kind]} failed: ${message}` })
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
