import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { suggestVerifiedInterlinks } from '@/lib/interlinkRegistry'
import { ESTATE_ANCHOR_LINKS } from '@/lib/seoFactory/linkAudit'
import { checkCompetingPages } from '@/lib/seoEngine/planner'
import { assembleMasterEngineFeed } from '@/lib/seoFactory/masterEngineFeed'
import { countBodyWords } from '@/lib/seoFactory/contentDepth'

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
  // Checkpoints store EXACTLY what the model emitted — a resume/regenerate
  // echo can double the article (saved draft + revision). Strip duplicates so
  // the queue, Resume, and the editor never see two H1s / ~2× the words.
  const deduped = stripDuplicateArticleCopy(content)
  const patch: Record<string, unknown> = {
    content: deduped.removed ? deduped.content : content,
    word_count: countBodyWords(deduped.removed ? deduped.content : content),
    status: 'drafting',
    error_message: null,
  }
  try {
    // Single subrequest per checkpoint: content preservation matters more
    // than a timeline entry, and each SELECT+UPDATE pair eats into the
    // Cloudflare subrequest budget (50/invocation) that kills long streams.
    await supabase.from('content_jobs').update(patch).eq('id', jobId)
  } catch (error) {
    console.warn('[seo-factory/generate-stream] checkpoint skipped', error)
  }
}

import {
  runSeoFactoryPipelineStream,
  type PipelineStreamEvent,
} from '@/lib/seoFactory/pipelineStream'
import type { RequestedShipMode } from '@/lib/seoFactory/pipeline'
import { finalizeInterruptedJob, interruptedJobPatch, ingestStreamDraft } from '@/lib/seoFactory/streamJobFinalizer'
import { stripDuplicateArticleCopy } from '@/lib/seoFactory/editorialScaffold'

export const runtime = 'nodejs'
// Keep the response active while providers think. HTTP-triggered Cloudflare
// Workers do not have a fixed wall-clock duration while the client remains
// connected, so the route deliberately has no self-imposed stream deadline.
const HEARTBEAT_MS = 15_000

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

    // Ranking-model guidance (recommendedActions + forecast) from the radar /
    // launch composer — sanitized so the pipeline prompt is written against the
    // model's weak families, never against raw client objects. `body.ranking`
    // is accepted as a back-compat alias.
    const mgSource = (body.modelGuidance || body.ranking) as
      | { total?: unknown; confidence?: unknown; recommendedActions?: unknown; forecast?: unknown }
      | null
      | undefined
    const modelGuidance = mgSource && typeof mgSource === 'object'
      ? {
          total: mgSource.total != null ? Number(mgSource.total) : undefined,
          confidence: mgSource.confidence != null ? Number(mgSource.confidence) : undefined,
          recommendedActions: Array.isArray(mgSource.recommendedActions)
            ? mgSource.recommendedActions.map(String).filter(Boolean).slice(0, 8)
            : undefined,
          forecast:
            mgSource.forecast && typeof mgSource.forecast === 'object'
              ? {
                  points: Array.isArray((mgSource.forecast as { points?: unknown }).points)
                    ? ((mgSource.forecast as { points: Array<Record<string, unknown>> }).points).slice(0, 3).map((p) => ({
                        horizonDays: p?.horizonDays != null ? Number(p.horizonDays) : undefined,
                        projectedPosition: p?.projectedPosition != null ? Number(p.projectedPosition) : undefined,
                        projectedImpressions: p?.projectedImpressions != null ? Number(p.projectedImpressions) : undefined,
                        projectedClicks: p?.projectedClicks != null ? Number(p.projectedClicks) : undefined,
                        probabilityOfTop10: p?.probabilityOfTop10 != null ? Number(p.probabilityOfTop10) : undefined,
                      }))
                    : undefined,
                }
              : undefined,
        }
      : null

    // Competing-page / interlink / engine-feed work runs AFTER the SSE
    // response is opened. Doing it first blocked the first byte long enough
    // for Cloudflare to 524, which the studio surfaces as "Content generation failed".
    const input = {
      topic,
      existingJobId: String(body.supersedesJobId || '').trim() || null,
      sourceJobId: String(body.supersedesJobId || '').trim() || null,
      regenerationReason: body.regenerationReason ? String(body.regenerationReason).slice(0, 500) : null,
      regenerationMode: (body.regenerationMode === 'resume' ? 'resume' : body.regenerationMode === 'expand' ? 'expand' : body.regenerationMode === 'refresh' ? 'refresh' : body.supersedesJobId ? 'manual' : 'new') as 'resume' | 'expand' | 'refresh' | 'manual' | 'new',
      intelligenceLineage: body.intelligenceLineage && typeof body.intelligenceLineage === 'object' ? body.intelligenceLineage as Record<string, unknown> : null,
      masterEngineBlock: null as string | null,
      title: String(body.title || topic).trim(),
      // When regenerating (supersedesJobId set), always use topic as primaryKeyword
      // to prevent stale keywords from a prior job from hijacking the new draft.
      primaryKeyword: body.supersedesJobId
        ? topic
        : String(body.primaryKeyword || body.primary_keyword || topic).trim(),
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
      // Single-pass writing is the default (the drafter writes the whole
      // article in one go). writeSegments>1 is an explicit admin opt-in for
      // constrained models only; the pipeline no longer auto-splits long-form.
      writeSegments: body.writeSegments != null ? Number(body.writeSegments) : undefined,
      opportunityAction: body.opportunityAction,
      // Radar play/intent/signals — feeds the streaming pipeline's autopilot
      // transparency block (was previously dropped at this route).
      opportunity: body.opportunity && typeof body.opportunity === 'object'
        ? {
            primaryKeyword: body.opportunity.primaryKeyword ? String(body.opportunity.primaryKeyword) : undefined,
            play: body.opportunity.play ? String(body.opportunity.play) : undefined,
            intent: body.opportunity.intent ? String(body.opportunity.intent) : undefined,
            opportunityScore: body.opportunity.opportunityScore != null ? Number(body.opportunity.opportunityScore) : undefined,
            signals: Array.isArray(body.opportunity.signals) ? body.opportunity.signals.map(String) : undefined,
          }
        : null,
      modelGuidance,
      cluster: body.cluster
        ? {
            clusterId: body.cluster.clusterId ? String(body.cluster.clusterId) : undefined,
            canonicalTerm: body.cluster.canonicalTerm ? String(body.cluster.canonicalTerm) : undefined,
            keywords: Array.isArray(body.cluster.keywords) ? body.cluster.keywords.map(String) : undefined,
            intent: body.cluster.intent ? String(body.cluster.intent) : undefined,
            region: body.cluster.region ? String(body.cluster.region) : undefined,
            mode: body.cluster.mode === 'expand' ? ('expand' as const) : ('new' as const),
            targetUrl: body.cluster.targetUrl ? String(body.cluster.targetUrl) : null,
            targetRepo: body.cluster.targetRepo ? String(body.cluster.targetRepo) : null,
            targetFilePath: body.cluster.targetFilePath ? String(body.cluster.targetFilePath) : null,
            existingJobId: body.cluster.existingJobId ? String(body.cluster.existingJobId) : null,
            reason: body.cluster.reason ? String(body.cluster.reason) : undefined,
          }
        : null,
      competingUrls: Array.isArray(body.competingUrls)
        ? (body.competingUrls as Array<{ url?: string; title?: string; primaryKeyword?: string | null }>)
            .filter((c: { url?: string; title?: string }) => c.url || c.title)
            .slice(0, 10)
        : undefined,
      aiProvider: body.aiProvider ? String(body.aiProvider).trim() : undefined,
      // SEO Master Engine mission economics + TitleLab candidate — the
      // drafter names the service + price band and carries the title.
      marketplaceCta: body.marketplaceCta && typeof body.marketplaceCta === 'object'
        ? {
            service: String(body.marketplaceCta.service || '').trim() || undefined,
            slug: String(body.marketplaceCta.slug || '').trim() || undefined,
            priceBand: String(body.marketplaceCta.priceBand || '').trim() || undefined,
          }
        : undefined,
      titleCandidate: body.titleCandidate ? String(body.titleCandidate).trim() : undefined,
      // Client disconnect / tab close: abort upstream generation immediately
      // instead of writing the full article into the Worker's memory. Routed
      // through our own controller so cancellation reaches every provider.
      signal: undefined as unknown as AbortSignal,
      interlinks: undefined as Array<{ label?: string; url?: string; matchedOn?: string[] }> | null,
      resumeContent: undefined as string | undefined,
      // Brief Assembly Panel fields — the full template from Stage II
      h2Outline: Array.isArray(body.h2Outline) ? body.h2Outline.map(String) : undefined,
      sources: Array.isArray(body.sources) ? body.sources.map(String) : undefined,
      minWords: body.minWords != null ? Number(body.minWords) : undefined,
      maxWords: body.maxWords != null ? Number(body.maxWords) : undefined,
      targetSlug: body.targetSlug ? String(body.targetSlug) : undefined,
      metaDescription: body.metaDescription ? String(body.metaDescription).trim().slice(0, 160) : undefined,
      kwH2Map: body.kwH2Map && typeof body.kwH2Map === 'object' ? Object.fromEntries(Object.entries(body.kwH2Map).map(([k, v]) => [String(k), String(v)])) : undefined,
      sectionBudgets: Array.isArray(body.sectionBudgets)
        ? (body.sectionBudgets as Array<Record<string, unknown>>)
            .map((s) => ({ heading: String(s.heading || '').trim(), minWords: Math.max(0, Number(s.minWords) || 0), maxWords: Math.max(0, Number(s.maxWords) || 0) }))
            .filter((s) => s.heading)
        : undefined,
      userId,
    }
    const supersedesJobId = String(body.supersedesJobId || '').trim()
    const resumeRequested = body.resume === true || Boolean(supersedesJobId)
    const supabase = sb()

    const encoder = new TextEncoder()
    let closed = false
    // The pipeline polls this signal between provider/refine passes.
    const streamAbort = new AbortController()
    input.signal = streamAbort.signal
    const onClientAbort = () => {
      try {
        streamAbort.abort()
      } catch {
        /* already aborted */
      }
    }
    if (request.signal.aborted) onClientAbort()
    else request.signal.addEventListener('abort', onClientAbort, { once: true })

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

        send({ type: 'progress', stage: 'connect', message: 'Pipeline connected — preparing brief…' })

        let lastCheckpointDraft = ''
        let lastCheckpointChars = 0
        let lastCheckpointAt = 0
        let checkpointCount = 0
        const MAX_CHECKPOINTS = 24
        let liveJobId = supersedesJobId || null
        let sawFinal = false

        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

        try {
        if (!input.competingUrls?.length) {
          try {
            const { data: shipped } = await supabase
              .from('content_jobs')
              .select('canonical_url, title, primary_keyword')
              .in('status', ['merged', 'pr_created', 'publishing'])
              .not('canonical_url', 'is', null)
              .limit(500)
            if (shipped?.length) {
              const coverage = (shipped as Array<{ canonical_url?: string | null; title?: string | null; primary_keyword?: string | null }>)
                .filter((r) => r.canonical_url)
                .map((r) => ({
                  url: r.canonical_url!,
                  title: r.title || r.canonical_url!,
                  primaryKeyword: r.primary_keyword || null,
                }))
              const result = checkCompetingPages({
                primaryKeyword: input.primaryKeyword,
                coverage,
              })
              if (result.competing.length) {
                input.competingUrls = result.competing.map((c) => ({
                  url: c.url,
                  title: c.title,
                  primaryKeyword: c.primaryKeyword,
                }))
              }
            }
          } catch (e) {
            console.warn('[seo-factory/generate-stream] competing-pages check skipped', e)
          }
        }

        if (Array.isArray(body.interlinks) && body.interlinks.length) {
          input.interlinks = body.interlinks
            .filter((l: { url?: string }) => l && typeof l.url === 'string' && l.url.trim())
            .map((l: { label?: string; url?: string; matchedOn?: string[] }) => ({
              label: String(l.label || ''),
              url: String(l.url),
              matchedOn: Array.isArray(l.matchedOn) ? l.matchedOn.map(String) : undefined,
            }))
        } else if (input.primaryKeyword) {
          const regionKey = String(input.region || 'US').toUpperCase().slice(0, 2)
          const anchors = (ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US)
            .map((a) => ({ label: a.label, url: a.url }))
          try {
            send({ type: 'progress', stage: 'plan', message: 'Verifying estate interlinks…' })
            const verified = await suggestVerifiedInterlinks(input.primaryKeyword, (input.keywords || []) as string[], 6)
            input.interlinks = verified.length
              ? verified as Array<{ label?: string; url?: string; matchedOn?: string[] }>
              : anchors
          } catch {
            input.interlinks = anchors
          }
        }

        try {
          send({ type: 'progress', stage: 'seo', message: 'Loading Master Engine feed…' })
          const engineFeed = await assembleMasterEngineFeed({
            topic: input.topic,
            primaryKeyword: input.primaryKeyword,
            region: input.region,
            contentType: input.contentType,
            title: input.title,
            competingUrls: Array.isArray(input.competingUrls)
              ? input.competingUrls.map((c) => String((c as { url?: string }).url || '')).filter(Boolean)
              : undefined,
          })
          if (engineFeed.promptBlock) {
            input.masterEngineBlock = engineFeed.promptBlock
            input.intelligenceLineage = {
              ...(input.intelligenceLineage || {}),
              masterEngine: engineFeed.lineage,
            }
          }
        } catch (e) {
          console.warn('[seo-factory/generate-stream] master engine feed skipped', e)
        }

        // Resume/repair mode: load the existing draft so the pipeline continues
        // from it instead of starting over. Works for both supersedesJobId
        // (regenerate) and regenerationMode === 'resume' + existingJobId.
        const resumeJobId =
          supersedesJobId ||
          (input.regenerationMode === 'resume'
            ? String(body.existingJobId || body.supersedesJobId || '').trim() || null
            : null)
        if (supabase && resumeJobId) {
          const { data: existing } = await supabase.from('content_jobs').select('content').eq('id', resumeJobId).single()
          if (existing?.content) input.resumeContent = String(existing.content)
          else if (input.regenerationMode === 'resume') {
            send({ type: 'progress', stage: 'plan', message: 'No saved draft found for resume — generating fresh' })
          }
        }
        if (supabase && supersedesJobId) {
          await markSupersededJob(
            supabase,
            supersedesJobId,
            { status: 'drafting', error_message: null },
            resumeRequested ? 'Repairing this draft in place' : 'Live regeneration started',
          )
        }

        // Manual iteration so a heartbeat can be emitted while the model is
        // still thinking — an idle SSE connection is idle-killed by Cloudflare.
        const iterator = runSeoFactoryPipelineStream(input)[Symbol.asyncIterator]()
        let pending: Promise<IteratorResult<PipelineStreamEvent>> | null = null
        while (!closed) {
          if (!pending) pending = iterator.next()
          const winner = await Promise.race([
            pending.then((r) => {
              pending = null
              return { kind: 'ev' as const, r }
            }),
            sleep(HEARTBEAT_MS).then(() => ({ kind: 'tick' as const })),
          ])
          if (winner.kind === 'tick') {
            send({ type: 'progress', stage: 'generate', message: 'still drafting' })
            continue
          }
          const ev = winner.r.value
          if (winner.r.done) break
          if (ev.type === 'job') liveJobId = ev.jobId
          if (ev.type === 'final') sawFinal = true
          lastCheckpointDraft = ingestStreamDraft(lastCheckpointDraft, ev)
          if (ev.type === 'final' && ev.result?.content) {
            lastCheckpointDraft = ingestStreamDraft(lastCheckpointDraft, { type: 'final', draft: String(ev.result.content) })
          }
          if (supabase && liveJobId && lastCheckpointDraft && checkpointCount < MAX_CHECKPOINTS) {
              const draft = lastCheckpointDraft
              const now = Date.now()
            const shouldCheckpoint =
                ev.type === 'attempt' ||
                ev.type === 'final' ||
                draft.length >= lastCheckpointChars + 2000 ||
                now - lastCheckpointAt >= 15000
              if (shouldCheckpoint && draft.length >= Math.min(lastCheckpointChars, draft.length)) {
                lastCheckpointChars = draft.length
                lastCheckpointAt = now
                checkpointCount++
                await checkpointJob(supabase, liveJobId, draft)
              }
            }
            if (supabase && supersedesJobId && ev.type === 'final' && ev.result?.jobId && ev.result.jobId !== supersedesJobId) {
              await markSupersededJob(
                supabase,
                supersedesJobId,
                { status: 'closed', closed_at: new Date().toISOString(), error_message: `Superseded by regenerate → ${ev.result.jobId}` },
                `Replacement job created: ${ev.result.jobId}`,
              )
            }
            // If a live queue row exists but the pipeline failed before writing a
            // final row (e.g. provider cascade exhausted), fail the early row so
            // the queue reflects reality instead of a stuck 'drafting'.
            if (supabase && liveJobId && ev.type === 'error' && !supersedesJobId) {
              await markSupersededJob(
                supabase,
                liveJobId,
                interruptedJobPatch(lastCheckpointDraft, { failedMessage: ev.error }),
                `Generation failed: ${ev.error}`,
              )
            }
            send(ev)
            if (ev.type === 'error' || ev.type === 'final') break
        }

        if (!sawFinal && supabase && liveJobId && !closed) {
          // Generator returned without a final event — never leave a stale row.
          await finalizeInterruptedJob(supabase, liveJobId, lastCheckpointDraft)
        }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Stream failed'
          // try/finally guarantee: the job row must never be left
          // status='drafting' with null content (the 12ae1be9 defect).
          if (supabase && supersedesJobId) {
            await markSupersededJob(
              supabase,
              supersedesJobId,
              interruptedJobPatch(lastCheckpointDraft, { failedMessage: message }),
              `Regeneration failed: ${message}`,
            )
          } else if (supabase && liveJobId) {
            await finalizeInterruptedJob(supabase, liveJobId, lastCheckpointDraft, {
              failedMessage: message,
            })
          }
          // Supersede edge: if the replacement row already exists when the stream
          // dies, fail it too so the queue never shows a stuck 'drafting'.
          if (supabase && supersedesJobId && liveJobId && liveJobId !== supersedesJobId) {
            await finalizeInterruptedJob(supabase, liveJobId, lastCheckpointDraft, {
              failedMessage: message,
            })
          }
          send({ type: 'error', error: message })
        } finally {
          request.signal.removeEventListener('abort', onClientAbort)
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
