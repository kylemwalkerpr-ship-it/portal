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
  const patch: Record<string, unknown> = {
    content,
    word_count: countBodyWords(content),
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

    // ── Competing page detection (anti-cannibalization) ──
    // Call checkCompetingPages() against the live estate coverage map so
    // the quality gate + deterministic repair fire on reaudit / ship.
    // Priority: body-supplied competingUrls (from Discover stage cannibal
    // data) > server-computed (from full content_jobs estate scan).
    let computedCompetingUrls: Array<{ url: string; title: string; primaryKeyword?: string | null }> | undefined
    if (!body.competingUrls || !Array.isArray(body.competingUrls) || body.competingUrls.length === 0) {
      try {
        const supabase = sb()
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
            primaryKeyword: String(body.primaryKeyword || body.primary_keyword || topic).trim(),
            coverage,
          })
          if (result.competing.length) {
            computedCompetingUrls = result.competing.map((c) => ({
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
    // ── End competing page detection ──

    const input = {
      topic,
      sourceJobId: String(body.supersedesJobId || '').trim() || null,
      regenerationReason: body.regenerationReason ? String(body.regenerationReason).slice(0, 500) : null,
      regenerationMode: (body.regenerationMode === 'resume' ? 'resume' : body.regenerationMode === 'expand' ? 'expand' : body.regenerationMode === 'refresh' ? 'refresh' : body.supersedesJobId ? 'manual' : 'new') as 'resume' | 'expand' | 'refresh' | 'manual' | 'new',
      intelligenceLineage: body.intelligenceLineage && typeof body.intelligenceLineage === 'object' ? body.intelligenceLineage as Record<string, unknown> : null,
      masterEngineBlock: null as string | null,
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
      // Segmented writing — long docs write in N sequential bounded parts
      // (thinking stays ON; each part fits the token budget). Auto 2 for
      // long-form when omitted; admin can force via writeSegments.
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
      competingUrls: computedCompetingUrls
        || (Array.isArray(body.competingUrls)
          ? (body.competingUrls as Array<{ url?: string; title?: string; primaryKeyword?: string | null }>)
              .filter((c: { url?: string; title?: string }) => c.url || c.title)
              .slice(0, 10)
          : undefined),
      aiProvider: body.aiProvider ? String(body.aiProvider).trim() : undefined,
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
      userId,
    }
    const supersedesJobId = String(body.supersedesJobId || '').trim()
    // Verified interlink allowlist: brief-supplied links win; otherwise the
    // engine derives live-verified targets server-side so the model NEVER
    // invents URLs (2026-08 example.com incident).
    if (Array.isArray(body.interlinks) && body.interlinks.length) {
      input.interlinks = body.interlinks
        .filter((l: any) => l && typeof l.url === 'string' && l.url.trim())
        .map((l: any) => ({ label: String(l.label || ''), url: String(l.url), matchedOn: Array.isArray(l.matchedOn) ? l.matchedOn.map(String) : undefined }))
    } else if (input.primaryKeyword) {
      // Always ensure ≥2 verified estate links reach the drafting prompt.
      // Registry entries are live-filtered (dead entries dropped) — when the
      // registry returns nothing, fall back to the verified-live estate
      // anchors so the model NEVER drafts with zero internal-link guidance
      // (the INTERNAL_LINKS audit then clears without any repair).
      const regionKey = String(input.region || 'US').toUpperCase().slice(0, 2)
      const anchors = (ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US)
        .map((a) => ({ label: a.label, url: a.url }))
      try {
        const verified = await suggestVerifiedInterlinks(input.primaryKeyword, (input.keywords || []) as string[], 6)
        if (verified.length) {
          input.interlinks = verified as Array<{ label?: string; url?: string; matchedOn?: string[] }>
        } else {
          input.interlinks = anchors
        }
      } catch {
        input.interlinks = anchors
      }
    }
    try {
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
    const resumeRequested = body.resume === true
    // Client is created for every run: the pipeline emits a 'job' event with the
    // early 'drafting' row so live deltas checkpoint into the queue in realtime.
    const supabase = sb()
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
        const MAX_CHECKPOINTS = 6
        // Live queue row — the pipeline creates a 'drafting' job at start; we
        // checkpoint streamed deltas into it so the Draft queue shows content
        // growing in realtime without waiting for the final insert.
        let liveJobId = supersedesJobId || null
        try {
          for await (const ev of runSeoFactoryPipelineStream(input)) {
            if (ev.type === 'job') liveJobId = ev.jobId
            if (liveJobId && (ev.type === 'delta' || ev.type === 'attempt') && ev.draft && checkpointCount < MAX_CHECKPOINTS) {
              const draft = String(ev.draft)
              const now = Date.now()
            const shouldCheckpoint =
                ev.type === 'attempt' ||
                draft.length >= lastCheckpointChars + 8000 ||
                now - lastCheckpointAt >= 20000
              if (shouldCheckpoint && draft.length >= lastCheckpointChars) {
                lastCheckpointDraft = draft
                lastCheckpointChars = draft.length
                lastCheckpointAt = now
                checkpointCount++
                await checkpointJob(
                  supabase,
                  liveJobId!,
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
            // If a live queue row exists but the pipeline failed before writing a
            // final row (e.g. provider cascade exhausted), fail the early row so
            // the queue reflects reality instead of a stuck 'drafting'.
            if (supabase && liveJobId && ev.type === 'error' && !supersedesJobId) {
              await markSupersededJob(supabase, liveJobId, { status: 'failed', error_message: ev.error }, `Generation failed: ${ev.error}`)
            }
            send(ev)
            if (ev.type === 'error' || ev.type === 'final') break
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Stream failed'
          if (supabase && liveJobId && lastCheckpointDraft) {
            await checkpointJob(supabase, liveJobId, lastCheckpointDraft, 'Checkpoint preserved after stream interruption')
          }
          if (supabase && supersedesJobId) {
            await markSupersededJob(supabase, supersedesJobId, { status: 'failed', error_message: message }, `Regeneration failed: ${message}`)
          } else if (supabase && liveJobId) {
            await markSupersededJob(supabase, liveJobId, { status: 'failed', error_message: message }, `Generation failed: ${message}`)
          }
          // Supersede edge: if the replacement row already exists when the stream
          // dies, fail it too so the queue never shows a stuck 'drafting'.
          if (supabase && supersedesJobId && liveJobId && liveJobId !== supersedesJobId) {
            await markSupersededJob(supabase, liveJobId, { status: 'failed', error_message: message }, `Replacement generation failed: ${message}`)
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
