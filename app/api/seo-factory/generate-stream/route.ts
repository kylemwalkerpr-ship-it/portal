export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import type { RequestedShipMode } from '@/lib/seoFactory/pipeline'
import { parseKeywordPhrases, parseKeywordTerms } from '@/lib/seoFactory/keywordContract'
import {
  runContentStudioPipelineStream,
  type ContentStudioPipelineInput,
} from '@/lib/seoFactory/contentStudioPipeline'
import type { PipelineStreamEvent } from '@/lib/seoFactory/pipelineStream'
import { POST as legacyUncontractedPOST } from './legacy'

export const maxDuration = 300
const HEARTBEAT_MS = 15_000

function isContractBound(body: Record<string, any>): boolean {
  return Boolean(body.contractId || body.contract_id || body.writingContractRequired === true)
}

function buildContractInput(body: Record<string, any>, userId: string, signal: AbortSignal): ContentStudioPipelineInput {
  const topic = String(body.topic || body.title || '').trim()
  return {
    writingContractRequired: true,
    topic,
    title: String(body.title || topic).trim(),
    primaryKeyword: String(body.primaryKeyword || body.primary_keyword || topic).trim(),
    region: String(body.region || 'US').toUpperCase(),
    contentType: String(body.contentType || body.content_type || 'legal_guide'),
    tone: String(body.tone || 'educational'),
    audience: body.audience ? String(body.audience) : undefined,
    keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : undefined,
    requiredShortKeywords: parseKeywordPhrases(body.requiredShortKeywords),
    requiredLongTailKeywords: parseKeywordPhrases(body.requiredLongTailKeywords),
    shortKeywordTerms: parseKeywordTerms(body.shortKeywordTerms),
    longTailKeywordTerms: parseKeywordTerms(body.longTailKeywordTerms),
    h2Outline: Array.isArray(body.h2Outline) ? body.h2Outline.map(String) : undefined,
    sectionPlan: Array.isArray(body.sectionPlan) ? body.sectionPlan : undefined,
    thesis: body.thesis ? String(body.thesis) : body.sealedBrief?.thesis ? String(body.sealedBrief.thesis) : undefined,
    takeaways: Array.isArray(body.takeaways)
      ? body.takeaways.map(String)
      : Array.isArray(body.sealedBrief?.takeaways) ? body.sealedBrief.takeaways.map(String) : undefined,
    faqQuestions: Array.isArray(body.faqQuestions)
      ? body.faqQuestions.map(String)
      : Array.isArray(body.sealedBrief?.faqQuestions) ? body.sealedBrief.faqQuestions.map(String) : undefined,
    lede: body.lede ? String(body.lede) : body.sealedBrief?.lede ? String(body.sealedBrief.lede) : undefined,
    sources: Array.isArray(body.sources) ? body.sources.map(String) : undefined,
    interlinks: Array.isArray(body.interlinks) ? body.interlinks : undefined,
    minWords: body.minWords != null ? Number(body.minWords) : undefined,
    maxWords: body.maxWords != null ? Number(body.maxWords) : undefined,
    targetSlug: body.targetSlug ? String(body.targetSlug) : undefined,
    slug: body.slug ? String(body.slug) : undefined,
    indexable: body.indexable !== false,
    shipMode: (body.shipMode || body.ship_mode || 'pr') as RequestedShipMode,
    dryRun: Boolean(body.dryRun),
    minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
    maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 2,
    opportunityAction: body.opportunityAction ? String(body.opportunityAction) : undefined,
    aiProvider: body.aiProvider ? String(body.aiProvider).trim() : undefined,
    existingJobId: String(body.existingJobId || body.jobId || body.supersedesJobId || '').trim() || null,
    sourceJobId: String(body.supersedesJobId || '').trim() || null,
    regenerationReason: body.regenerationReason ? String(body.regenerationReason).slice(0, 500) : null,
    regenerationMode: body.regenerationMode === 'resume'
      ? 'resume'
      : body.regenerationMode === 'expand'
        ? 'expand'
        : body.regenerationMode === 'refresh'
          ? 'refresh'
          : body.supersedesJobId ? 'manual' : 'new',
    resumeContent: undefined,
    userId,
    signal,
    contractId: String(body.contractId || body.contract_id || '').trim() || null,
    contractHash: String(body.contractHash || body.contract_hash || '').trim() || null,
    contractVersion: body.contractVersion ?? body.contract_version ?? null,
    evidenceHash: String(body.evidenceHash || body.evidence_hash || '').trim() || null,
    opportunityId: String(body.opportunityId || body.opportunity_id || '').trim() || null,
  }
}

/**
 * SSE production transport. Contracted Content Studio work streams the shared
 * contract-bound runner directly; it never refreshes evidence or owns authorship.
 * Historical uncontracted SEO Factory traffic uses the preserved legacy transport.
 */
export async function POST(request: Request) {
  let body: Record<string, any>
  try {
    body = await request.clone().json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!isContractBound(body)) {
    return legacyUncontractedPOST(request)
  }

  const auth = await requireAdminUser()
  if ('error' in auth) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const topic = String(body.topic || body.title || '').trim()
  if (!topic) {
    return new Response(JSON.stringify({ error: 'topic required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const userId =
    (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id ||
    (auth as { profileId?: string }).profileId ||
    'admin'
  const abort = new AbortController()
  const onAbort = () => abort.abort()
  if (request.signal.aborted) onAbort()
  else request.signal.addEventListener('abort', onAbort, { once: true })
  const input = buildContractInput(body, userId, abort.signal)
  const encoder = new TextEncoder()
  let closed = false
  let iterator: AsyncIterator<PipelineStreamEvent> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: PipelineStreamEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }
      send({ type: 'progress', stage: 'connect', message: 'Contract verified — starting saved writing context…' })
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
      try {
        iterator = runContentStudioPipelineStream(input)[Symbol.asyncIterator]()
        let pending: Promise<IteratorResult<PipelineStreamEvent>> | null = null
        while (!closed) {
          if (!pending) pending = iterator.next()
          const winner = await Promise.race([
            pending.then((result) => {
              pending = null
              return { kind: 'event' as const, result }
            }),
            sleep(HEARTBEAT_MS).then(() => ({ kind: 'heartbeat' as const })),
          ])
          if (winner.kind === 'heartbeat') {
            send({ type: 'progress', stage: 'generate', message: 'still drafting' })
            continue
          }
          if (winner.result.done) break
          const event = winner.result.value
          send(event)
          if (event.type === 'error' || event.type === 'final') break
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stream failed'
        send({ type: 'error', error: message })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        if (!closed) {
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch { /* already closed */ }
        }
        closed = true
      }
    },
    async cancel() {
      closed = true
      abort.abort()
      try { await iterator?.return?.() } catch { /* wrapper persists interruption */ }
      request.signal.removeEventListener('abort', onAbort)
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
