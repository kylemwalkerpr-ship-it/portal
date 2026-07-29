import { requireAdminUser } from '@/lib/portalAuth'
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
      userId,
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

        try {
          for await (const ev of runSeoFactoryPipelineStream(input)) {
            send(ev)
            if (ev.type === 'error' || ev.type === 'final') break
          }
        } catch (e) {
          send({
            type: 'error',
            error: e instanceof Error ? e.message : 'Stream failed',
          })
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
