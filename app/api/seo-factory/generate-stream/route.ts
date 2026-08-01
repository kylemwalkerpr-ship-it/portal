import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function markSupersededJob(
  supabase: ReturnType<typeof sb>,
  jobId: string,
  patch: Record<string, unknown>,
  message: string,
) {
  try {
    const { data } = await supabase.from('content_jobs').select('event_log').eq('id', jobId).single()
    const previous = Array.isArray(data?.event_log) ? data.event_log : []
    const entry = { id: `${Date.now()}-stream`, ts: Date.now(), level: 'info', source: 'pipeline', message }
    const eventLog = [...previous, entry].slice(-300)
    const { error } = await supabase.from('content_jobs').update({ ...patch, event_log: eventLog }).eq('id', jobId)
    if (error && /event_log|column/i.test(error.message || '')) {
      await supabase.from('content_jobs').update(patch).eq('id', jobId)
    }
  } catch (error) {
    console.warn('[seo-factory/generate-stream] could not update superseded job', error)
  }
}

async function checkpointJob(
  supabase: ReturnType<typeof sb>,
  jobId: string,
  draft: string,
  message?: string,
) {
  const content = String(draft || '').trim()
  if (!content) return
  const patch: Record<string, unknown> = {
    content,
    word_count: content.split(/\s+/).filter(Boolean).length,
    status: 'drafting',
    error_message: null,
  }
  try {
    if (message) {
      const { data } = await supabase.from('content_jobs').select('event_log').eq('id', jobId).single()
      const previous = Array.isArray(data?.event_log) ? data.event_log : []
      const now = Date.now()
      const eventLog = [
        ...previous,
        { id: `${now}-checkpoint`, ts: now, level: 'info', source: 'pipeline', message },
      ].slice(-300)
      const { error } = await supabase.from('content_jobs').update({ ...patch, event_log: eventLog }).eq('id', jobId)
      if (error && /event_log|column/i.test(error.message || '')) {
        await supabase.from('content_jobs').update(patch).eq('id', jobId)
      }
    } else {
      await supabase.from('content_jobs').update(patch).eq('id', jobId)
    }
  } catch (error) {
    console.warn('[seo-factory/generate-stream] checkpoint skipped', error)
  }
}

import {
  runSeoFactoryPipelineStream,
  type PipelineStreamEvent,
} from '@/lib/seoFactory/pipelineStream'
import type { RequestedShipMode } from '@/lib/seoFactory/pipeline'

export const runtime = 'nodejs'
// Allow long generations on platforms that honor this
export const maxDuration = 300

/**
 * POST /api/seo-factory/generate-stream
 * SSE stream of plan → generate deltas → audit → ship → final jobId.
 *
 * Events (event: message, data: JSON):
 *   progress | provider | delta | attempt | ship | final | error
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    if (!topic) {
      return new Response(JSON.stringify({ error: 'topic required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile
        ?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const input = {
      topic,
      title: String(body.title || topic).trim(),
      primaryKeyword: String(body.primaryKeyword || body.primary_keyword || topic).trim(),
      region: String(body.region || 'US').toUpperCase(),
      contentType: String(body.contentType || body.content_type || 'legal_guide'),
      tone: String(body.tone || 'educational'),
      audience: body.audience ? String(body.audience) : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
      slug: body.slug,
      indexable: body.indexable !== false,
      shipMode: (body.shipMode || body.ship_mode || 'pr') as RequestedShipMode,
      dryRun: Boolean(body.dryRun),
      minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
      maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
      opportunityAction: body.opportunityAction,
      resumeContent: undefined as string | undefined,
      userId,
    }
    const supersedesJobId = String(body.supersedesJobId || '').trim()
    const resumeRequested = body.resume === true
    const supabase = supersedesJobId ? sb() : null
    if (supabase && supersedesJobId && resumeRequested) {
      const { data: existing } = await supabase.from('content_jobs').select('content').eq('id', supersedesJobId).single()
      if (existing?.content) input.resumeContent = String(existing.content)
    }
    if (supabase && supersedesJobId) {
      await markSupersededJob(
        supabase,
        supersedesJobId,
        { status: 'drafting', error_message: null },
        resumeRequested ? 'Continuing from the latest saved checkpoint' : 'Live regeneration started',
      )
    }

    const encoder = new TextEncoder()
    let closed = false

    const stream = new ReadableStream({
      async start(controller) {
        const send = (ev: PipelineStreamEvent) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
          } catch {
            closed = true
          }
        }

        let lastCheckpointDraft = ''
        let lastCheckpointChars = 0
        let lastCheckpointAt = 0
        let checkpointCount = 0
        const MAX_CHECKPOINTS = 10
        try {
          for await (const ev of runSeoFactoryPipelineStream(input)) {
            if (supabase && supersedesJobId && (ev.type === 'delta' || ev.type === 'attempt') && ev.draft && checkpointCount < MAX_CHECKPOINTS) {
              const draft = String(ev.draft)
              const now = Date.now()
              const shouldCheckpoint =
                ev.type === 'attempt' ||
                draft.length >= lastCheckpointChars + 15000 ||
                now - lastCheckpointAt >= 30000
              if (shouldCheckpoint && draft.length >= lastCheckpointChars) {
                lastCheckpointDraft = draft
                lastCheckpointChars = draft.length
                lastCheckpointAt = now
                checkpointCount++
                await checkpointJob(
                  supabase,
                  supersedesJobId,
                  draft,
                  ev.type === 'attempt' ? `Checkpoint saved after attempt ${ev.attempt}` : undefined,
                )
              }
            }
            if (supabase && supersedesJobId && ev.type === 'final') {
              const replacementId = ev.result?.jobId || 'new job'
              await markSupersededJob(
                supabase,
                supersedesJobId,
                { status: 'closed', closed_at: new Date().toISOString(), error_message: `Superseded by regenerate → ${replacementId}` },
                `Replacement job created: ${replacementId}`,
              )
            }
            send(ev)
            if (ev.type === 'error' || ev.type === 'final') break
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Stream failed'
          if (supabase && supersedesJobId && lastCheckpointDraft) {
            await checkpointJob(supabase, supersedesJobId, lastCheckpointDraft, 'Checkpoint preserved after stream interruption')
          }
          if (supabase && supersedesJobId) {
            await markSupersededJob(supabase, supersedesJobId, { status: 'failed', error_message: message }, `Regeneration failed: ${message}`)
          }
          send({ type: 'error', error: message })
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
  } catch (err) {
    console.error('[seo-factory/generate-stream]', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Generate stream failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
