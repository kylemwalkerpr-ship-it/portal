/**
 * POST /api/seo-factory/auto-run-stream
 * SSE stream of auto-run progress — per-candidate progress events.
 *
 * Events (event: message, data: JSON):
 *   progress  — candidate-level progress (e.g. "Processing 1/3: H-1B visa guide")
 *   candidate — per-candidate result (term, ok, jobId, audit, ship, etc.)
 *   final     — summary with shipped/candidateCount/results[]
 *   error     — fatal error
 *
 * Same body as POST /api/seo-factory/auto-run.
 * Falls back to the regular POST endpoint when SSE is unavailable.
 */

import { NextRequest } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import {
  loadFactoryOpportunities,
  pickAutoRunCandidates,
  type FactoryOpportunity,
} from '@/lib/seoFactory/opportunities'
import {
  loadRecentPrimaryKeywords,
  runSeoFactoryPipeline,
  type RequestedShipMode,
} from '@/lib/seoFactory/pipeline'
import { buildKeywordPlan, planTermsForAutoRun } from '@/lib/seoFactory/keywordPlanner'
import {
  buildSeoWarRoom,
  playToOpportunityAction,
  type WarOpportunity,
  type WarPlay,
} from '@/lib/seoFactory/seoWarRoom'
import {
  enrichQueueWithRanking,
  modelTotalForOpportunity,
  sortByModelTotal,
} from '@/lib/seoEngine/rankingModel'

export const runtime = 'nodejs'
export const maxDuration = 300

type Candidate = FactoryOpportunity & {
  writeHint?: string
  play?: string
  estimatedGainClicks?: number
  modelTotal?: number | null
}

type PlanRow = { term: string; impressions?: number; clicks?: number; ctr?: number; position?: number; region?: string }

/**
 * Reorder plan terms by ranking-model total (fallback: preserve input order).
 * Note: model priority takes precedence over the lane-mix that planTermsForAutoRun
 * enforces — the SET stays lane-aware; only the pick order becomes model-driven.
 */
const orderTermsByModel = (terms: string[], plan: PlanRow[]): string[] => {
  const row = (t: string) => plan.find((p) => p.term === t)
  const total = (t: string) => {
    const r = row(t)
    return modelTotalForOpportunity(r ? { term: r.term, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr, position: r.position, region: r.region } : { term: t })
  }
  return [...terms].sort((a, b) => total(b) - total(a))
}

async function* autoRunStream(request: NextRequest, signal: AbortSignal): AsyncGenerator<string> {
  const send = (ev: Record<string, unknown>) => `data: ${JSON.stringify(ev)}\n\n`

  try {
    if (signal.aborted) {
      yield send({ type: 'error', error: 'Request aborted' })
      return
    }

    const auth = await requireAdminUser()
    if ('error' in auth) {
      yield send({ type: 'error', error: auth.error })
      return
    }

    if (signal.aborted) {
      yield send({ type: 'error', error: 'Request aborted after auth' })
      return
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(5, Math.max(1, Number(body.limit) || 3))
    const requestedMode = String(body.shipMode || body.ship_mode || 'auto').toLowerCase() as RequestedShipMode
    const dryRun = Boolean(body.dryRun)
    const minAuditScore = body.minAuditScore != null ? Number(body.minAuditScore) : 65
    const maxRefine = body.maxRefine != null ? Number(body.maxRefine) : 10
    const skipRecent = body.skipRecent !== false
    const regionFilter = body.regionFilter ? String(body.regionFilter).toUpperCase() : null
    const minImpressions = Number(body.minImpressions) || 0
    const useWarRoom = body.useWarRoom !== false
    const useKeywordPlan = body.useKeywordPlan !== false
    const aiProvider = body.aiProvider ? String(body.aiProvider).trim() : undefined
    const days = body.days != null ? Number(body.days) : 90
    const explicitTerms: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []

    yield send({ type: 'progress', message: 'Loading GSC opportunities…', stage: 'setup' })

    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(80)
    const recentDays = body.recentDays != null ? Number(body.recentDays) : 90
    const recent = skipRecent ? await loadRecentPrimaryKeywords(recentDays) : new Set<string>()

    let candidates: Candidate[]
    let planMeta: Record<string, unknown> | null = null
    let relaxedRecent = false

    const warToCandidate = async (o: WarOpportunity): Promise<Candidate> => {
      const ownerHint = await resolveOwner({
        primaryKeyword: o.term,
        contentType: o.contentType || 'legal_guide',
        region: o.region || 'US',
      })
      return {
        term: o.term,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        score: o.priorityScore,
        action: playToOpportunityAction(o.play) as FactoryOpportunity['action'],
        suggestedContentType: o.contentType || 'legal_guide',
        region: o.region || 'US',
        ownerHint,
        writeHint: o.writeHint,
        play: o.play,
        estimatedGainClicks: o.estimatedGainClicks,
        modelTotal: (o as WarOpportunity & { ranking?: { total?: number } }).ranking?.total ?? null,
      }
    }

    // ── Build candidate list ──
    yield send({ type: 'progress', message: 'Building candidate list…', stage: 'plan' })

    if (explicitTerms.length) {
      // Same candidate-building logic as auto-run route — abbreviated for space
      let warByTerm = new Map<string, WarOpportunity>()
      if (useWarRoom) {
        try {
          const room = await buildSeoWarRoom({
            days, limit: 80, minImpressions: minImpressions || 2,
            regionFilter: regionFilter || undefined,
          })
          const enriched = enrichQueueWithRanking(room.queue)
          room.queue = enriched.queue as WarOpportunity[]
          planMeta = { mode: 'explicit+war-room', summary: room.summary, source: room.source, kpis: { ...room.kpis, modelAvg: enriched.modelAvg } }
          for (const o of room.queue) warByTerm.set(o.term.toLowerCase(), o)
        } catch { /* soft-fail */ }
      }
      candidates = []
      for (const term of explicitTerms.slice(0, limit * 2)) {
        if (candidates.length >= limit) break
        if (skipRecent && recent.has(term.toLowerCase())) continue
        const war = warByTerm.get(term.toLowerCase())
        if (war) { candidates.push(await warToCandidate(war)); continue }
        const region = /uk|british/i.test(term) ? 'UK' : /canada|pgwp/i.test(term) ? 'CA' : /485|australia/i.test(term) ? 'AU' : 'US'
        const { inferContentType } = await import('@/lib/seoFactory/seoWarRoom')
        const contentType = inferContentType(term)
        candidates.push({
          term, impressions: 0, clicks: 0, ctr: 0, position: 50, score: 0,
          action: 'expand_or_build', suggestedContentType: contentType, region,
          ownerHint: await resolveOwner({ primaryKeyword: term, contentType, region }),
        })
      }
    } else if (useWarRoom) {
      const room = await buildSeoWarRoom({
        days, limit: Math.max(limit * 6, 24), minImpressions: minImpressions || 2,
        regionFilter: regionFilter || undefined,
      })
      // Autopilot picks are ordered by ranking-model total (fallback: priority score).
      const enriched = enrichQueueWithRanking(room.queue)
      room.queue = sortByModelTotal(enriched.queue, (o) => (o as WarOpportunity).priorityScore || 0) as WarOpportunity[]
      planMeta = {
        mode: 'war-room', summary: room.summary, source: room.source,
        kpis: { ...room.kpis, modelAvg: enriched.modelAvg },
        buckets: Object.fromEntries(Object.entries(room.buckets).map(([k, v]) => [k, (v as WarOpportunity[]).length])),
      }
      candidates = []
      for (const o of room.queue) {
        if (candidates.length >= limit) break
        if (o.play === 'cannibal_merge') continue
        if (skipRecent && recent.has(o.term.toLowerCase())) continue
        if (o.ownerUrl && o.host && /blocked/i.test(o.rationale)) continue
        candidates.push(await warToCandidate(o))
      }
      if (candidates.length < limit && useKeywordPlan) {
        const kwPlan = await buildKeywordPlan({
          planLimit: Math.max(limit * 4, 16), boardLimit: 80,
          regionFilter: regionFilter || undefined, minImpressions: minImpressions || 3,
          targetMix: body.planMix || { refresh: 0.4, expand: 0.35, build_new: 0.25 },
        })
        planMeta = { ...planMeta, keywordFill: kwPlan.summary, mix: kwPlan.mix }
        const have = new Set(candidates.map((c) => c.term.toLowerCase()))
        for (const term of orderTermsByModel(planTermsForAutoRun(kwPlan.plan, Math.max(limit * 4, 16)), kwPlan.plan)) {
          if (candidates.length >= limit) break
          if (have.has(term.toLowerCase()) || (skipRecent && recent.has(term.toLowerCase()))) continue
          const item = kwPlan.plan.find((p) => p.term === term)
          candidates.push({
            term, impressions: item?.impressions || 0, clicks: 0, ctr: item?.ctr || 0,
            position: item?.position || 50, score: item?.authorityScore || item?.demandScore || 0,
            modelTotal: modelTotalForOpportunity(item ? { term, impressions: item.impressions, clicks: 0, ctr: item.ctr, position: item.position, region: item.region } : { term }),
            action: item?.lane === 'refresh' ? 'title_rewrite' : 'expand_or_build',
            suggestedContentType: item?.contentType || 'legal_guide', region: item?.region || 'US',
            ownerHint: await resolveOwner({ primaryKeyword: term, contentType: item?.contentType || 'legal_guide', region: item?.region || 'US' }),
            writeHint: item?.writeHint,
          })
        }
      }
    } else if (useKeywordPlan) {
      const kwPlan = await buildKeywordPlan({
        planLimit: Math.max(limit * 4, 16), boardLimit: 100,
        regionFilter: regionFilter || undefined, minImpressions: minImpressions || 5,
        targetMix: body.planMix || { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      })
      planMeta = { mode: 'keyword-plan', summary: kwPlan.summary, mix: kwPlan.mix, targetMix: kwPlan.targetMix, source: kwPlan.source }
      const terms = orderTermsByModel(planTermsForAutoRun(kwPlan.plan, Math.max(limit * 4, 16)), kwPlan.plan)
      candidates = []
      for (const term of terms) {
        const item = kwPlan.plan.find((p) => p.term === term)
        candidates.push({
          term, impressions: item?.impressions || 0, clicks: 0, ctr: item?.ctr || 0,
          position: item?.position || 50, score: item?.authorityScore || item?.demandScore || 0,
          modelTotal: modelTotalForOpportunity(item ? { term, impressions: item.impressions, clicks: 0, ctr: item.ctr, position: item.position, region: item.region } : { term }),
          action: item?.lane === 'refresh' ? 'title_rewrite' : 'expand_or_build',
          suggestedContentType: item?.contentType || 'legal_guide', region: item?.region || 'US',
          ownerHint: await resolveOwner({ primaryKeyword: term, contentType: item?.contentType || 'legal_guide', region: item?.region || 'US' }),
          writeHint: item?.writeHint,
        })
      }
    } else {
      let pool = pickAutoRunCandidates(opportunities, 40)
      if (regionFilter) pool = pool.filter((o) => o.region === regionFilter)
      if (minImpressions > 0) pool = pool.filter((o) => o.impressions >= minImpressions)
      if (skipRecent) pool = pool.filter((o) => !recent.has(o.term.toLowerCase()))
      pool = pool.filter((o) => !o.ownerHint?.blockers?.some((b) => /blocked_on_supply|301|merge/i.test(b)))
      candidates = pool.slice(0, limit)
    }

    // ── Fallback: relax recent-skip if queue empty ──
    if (!candidates.length && skipRecent) {
      relaxedRecent = true
      if (useWarRoom) {
        try {
          const room = await buildSeoWarRoom({
            days, limit: Math.max(limit * 6, 24), minImpressions: minImpressions || 2,
            regionFilter: regionFilter || undefined,
          })
          const enrichedRelaxed = enrichQueueWithRanking(room.queue)
          room.queue = sortByModelTotal(enrichedRelaxed.queue, (o) => (o as WarOpportunity).priorityScore || 0) as WarOpportunity[]
          candidates = []
          for (const o of room.queue) {
            if (candidates.length >= limit) break
            if (o.play === 'cannibal_merge') continue
            candidates.push(await warToCandidate(o))
          }
          planMeta = { ...(planMeta || {}), mode: (planMeta?.mode as string) || 'war-room', recentRelaxed: true }
        } catch { /* fall through */ }
      }
      if (!candidates.length) {
        let pool = pickAutoRunCandidates(opportunities, 40)
        if (regionFilter) pool = pool.filter((o) => o.region === regionFilter)
        if (minImpressions > 0) pool = pool.filter((o) => o.impressions >= minImpressions)
        pool = pool.filter((o) => !o.ownerHint?.blockers?.some((b) => /blocked_on_supply|301|merge/i.test(b)))
        candidates = pool.slice(0, limit)
      }
    }

    if (!candidates.length) {
      yield send({
        type: 'final',
        ok: true,
        message: skipRecent
          ? `No eligible opportunities. Uncheck "Skip recently covered" or lower min impressions. Recently shipped in last ${recentDays}d: ${recent.size}.`
          : 'No eligible opportunities to run — GSC returned no actionable terms.',
        shipped: 0,
        candidateCount: 0,
        results: [],
      })
      return
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const results: Array<Record<string, unknown>> = []
    const total = candidates.length

    for (let idx = 0; idx < total; idx++) {
      const opp = candidates[idx]
      if (signal.aborted) {
        results.push({ ok: false, term: opp.term, error: 'Request aborted' })
        break
      }

      yield send({
        type: 'progress',
        stage: 'candidate',
        message: `[${idx + 1}/${total}] ${opp.term}…`,
        term: opp.term,
        index: idx + 1,
        total,
      })

      try {
        const shipModeForRun = requestedMode === 'auto' ? 'merge' : requestedMode
        const cand = opp as Candidate
        const result = await runSeoFactoryPipeline({
          topic: opp.term,
          title: opp.term,
          primaryKeyword: opp.term,
          region: opp.region || 'US',
          contentType: opp.suggestedContentType || 'legal_guide',
          tone: 'educational',
          shipMode: shipModeForRun,
          dryRun,
          minAuditScore,
          maxRefine,
          opportunityAction: cand.play ? playToOpportunityAction(cand.play as WarPlay) : String(opp.action),
          writeHint: cand.writeHint,
          aiProvider,
          userId,
        })

        const entry = {
          ok: result.ok && !result.shipError,
          term: opp.term,
          play: cand.play || opp.action,
          estimatedGainClicks: cand.estimatedGainClicks,
          modelTotal: cand.modelTotal ?? null,
          jobId: result.jobId,
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
          plan: {
            host: result.plan.host, repo: result.plan.repo,
            filePath: result.plan.filePath, canonicalUrl: result.plan.canonicalUrl,
            blockers: result.plan.blockers, ymy: result.plan.ymy,
          },
          audit: {
            score: result.audit.score, grade: result.audit.grade,
            wordCount: result.audit.wordCount,
            blockers: result.audit.blockers.map((b) => b.message),
            warnings: result.audit.warnings.slice(0, 4).map((w) => w.message),
          },
          shipMode: result.shipMode, ship: result.ship, shipError: result.shipError,
          contentPreview: result.content.slice(0, 600),
          gscImpressions: opp.impressions, gscPosition: opp.position,
        }
        results.push(entry)

        yield send({
          type: 'candidate',
          ...entry,
          term: opp.term,
          index: idx + 1,
          total,
        })
      } catch (e) {
        const errEntry = {
          ok: false,
          term: opp.term,
          error: e instanceof Error ? e.message : 'Failed',
        }
        results.push(errEntry)
        yield send({ type: 'candidate', ...errEntry, index: idx + 1, total })
      }
    }

    const shipped = results.filter((r) => r.ok && r.ship).length
    const avgScore = results.filter((r) => (r.audit as any)?.score != null).length > 0
      ? Math.round(
          results.filter((r) => (r.audit as any)?.score != null)
            .reduce((s, r) => s + Number((r.audit as any).score), 0) /
          results.filter((r) => (r.audit as any)?.score != null).length,
        )
      : null
    const modeLabel = (planMeta?.mode as string) || (planMeta ? 'planned' : 'classic')

    yield send({
      type: 'final',
      ok: true,
      source: (planMeta?.source as string) || source,
      siteUrl,
      dryRun,
      requestedMode,
      minAuditScore,
      maxRefine,
      candidateCount: candidates.length,
      shipped,
      avgAuditScore: avgScore,
      skippedRecent: recent.size,
      recentDays,
      recentRelaxed: relaxedRecent,
      keywordPlan: planMeta,
      results,
      message: dryRun
        ? `Dry-run complete: ${results.length} drafts · ${modeLabel}${relaxedRecent ? ' · recent-skip relaxed' : ''}`
        : `Auto-run complete: ${shipped}/${results.length} shipped · avg audit ${avgScore ?? '—'} · ${modeLabel}${relaxedRecent ? ' · recent-skip relaxed' : ''}`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto-run failed'
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    yield send({ type: 'error', error: message, isCpuTimeout })
  }
}

export async function POST(request: NextRequest) {
  try {
    const encoder = new TextEncoder()
    let closed = false

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (data: string) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(data))
          } catch {
            closed = true
          }
        }

        try {
          for await (const event of autoRunStream(request, request.signal)) {
            enqueue(event)
          }
        } catch (e) {
          enqueue(`data: ${JSON.stringify({ type: 'error', error: e instanceof Error ? e.message : 'Stream failed' })}\n\n`)
        } finally {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()
            } catch { /* already closed */ }
          }
          closed = true
        }
      },
      cancel() { closed = true },
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
    console.error('[seo-factory/auto-run-stream]', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Auto-run stream failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
