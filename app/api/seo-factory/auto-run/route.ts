import { NextRequest, NextResponse } from 'next/server'
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

type Candidate = FactoryOpportunity & {
  writeHint?: string
  play?: string
  estimatedGainClicks?: number
}

/**
 * POST /api/seo-factory/auto-run
 *
 * Low-input pipeline with quality refine + keyword dedupe.
 *
 * Body:
 *   limit?: number (default 3, max 5)
 *   shipMode?: 'auto' | 'pr' | 'autodeploy' | 'none' | 'merge'
 *   dryRun?: boolean
 *   terms?: string[]
 *   minAuditScore?: number (default 55)
 *   maxRefine?: number (default 2)
 *   skipRecent?: boolean (default true)
 *   regionFilter?: 'US'|'UK'|'CA'|'AU'
 *   minImpressions?: number
 *   useWarRoom?: boolean (default true when no explicit terms)
 *   useKeywordPlan?: boolean (default true if war room empty)
 *   planMix?: { refresh, expand, build_new }
 *   days?: number (GSC window for war room)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(5, Math.max(1, Number(body.limit) || 3))
    const requestedMode = String(body.shipMode || body.ship_mode || 'auto').toLowerCase() as RequestedShipMode
    const dryRun = Boolean(body.dryRun)
    const minAuditScore = body.minAuditScore != null ? Number(body.minAuditScore) : 55
    const maxRefine = body.maxRefine != null ? Number(body.maxRefine) : 2
    const skipRecent = body.skipRecent !== false
    const regionFilter = body.regionFilter ? String(body.regionFilter).toUpperCase() : null
    const minImpressions = Number(body.minImpressions) || 0
    const useWarRoom = body.useWarRoom !== false
    const useKeywordPlan = body.useKeywordPlan !== false
    const days = body.days != null ? Number(body.days) : 90
    const explicitTerms: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []

    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(80)
    const recent = skipRecent ? await loadRecentPrimaryKeywords(45) : new Set<string>()

    let candidates: Candidate[]
    let planMeta: Record<string, unknown> | null = null

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
      }
    }

    if (explicitTerms.length) {
      // Enrich explicit terms with war-room metadata when available
      let warByTerm = new Map<string, WarOpportunity>()
      if (useWarRoom) {
        try {
          const room = await buildSeoWarRoom({
            days,
            limit: 80,
            minImpressions: minImpressions || 2,
            regionFilter: regionFilter || undefined,
          })
          planMeta = {
            mode: 'explicit+war-room',
            summary: room.summary,
            source: room.source,
            kpis: room.kpis,
          }
          for (const o of room.queue) warByTerm.set(o.term.toLowerCase(), o)
        } catch {
          /* soft-fail enrichment */
        }
      }
      candidates = []
      for (const term of explicitTerms.slice(0, limit * 2)) {
        if (candidates.length >= limit) break
        if (skipRecent && recent.has(term.toLowerCase())) continue
        const war = warByTerm.get(term.toLowerCase())
        if (war) {
          candidates.push(await warToCandidate(war))
          continue
        }
        const region =
          /uk|british/i.test(term)
            ? 'UK'
            : /canada|pgwp/i.test(term)
              ? 'CA'
              : /485|australia/i.test(term)
                ? 'AU'
                : 'US'
        const contentType = 'legal_guide'
        candidates.push({
          term,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 50,
          score: 0,
          action: 'expand_or_build',
          suggestedContentType: contentType,
          region,
          ownerHint: await resolveOwner({ primaryKeyword: term, contentType, region }),
        })
      }
    } else if (useWarRoom) {
      const room = await buildSeoWarRoom({
        days,
        limit: Math.max(limit * 6, 24),
        minImpressions: minImpressions || 2,
        regionFilter: regionFilter || undefined,
      })
      planMeta = {
        mode: 'war-room',
        summary: room.summary,
        source: room.source,
        kpis: room.kpis,
        buckets: Object.fromEntries(
          Object.entries(room.buckets).map(([k, v]) => [k, (v as WarOpportunity[]).length]),
        ),
      }
      candidates = []
      for (const o of room.queue) {
        if (candidates.length >= limit) break
        if (o.play === 'cannibal_merge') continue // needs human path choice
        if (skipRecent && recent.has(o.term.toLowerCase())) continue
        if (o.ownerUrl && o.host && /blocked/i.test(o.rationale)) continue
        candidates.push(await warToCandidate(o))
      }
      // Fill from keyword plan if war room too thin
      if (candidates.length < limit && useKeywordPlan) {
        const kwPlan = await buildKeywordPlan({
          planLimit: Math.max(limit * 4, 16),
          boardLimit: 80,
          regionFilter: regionFilter || undefined,
          minImpressions: minImpressions || 3,
          targetMix: body.planMix || { refresh: 0.4, expand: 0.35, build_new: 0.25 },
        })
        planMeta = { ...planMeta, keywordFill: kwPlan.summary, mix: kwPlan.mix }
        const have = new Set(candidates.map((c) => c.term.toLowerCase()))
        for (const term of planTermsForAutoRun(kwPlan.plan, limit * 2)) {
          if (candidates.length >= limit) break
          if (have.has(term.toLowerCase())) continue
          if (skipRecent && recent.has(term.toLowerCase())) continue
          const item = kwPlan.plan.find((p) => p.term === term)
          const region = item?.region || 'US'
          const contentType = item?.contentType || 'legal_guide'
          candidates.push({
            term,
            impressions: item?.impressions || 0,
            clicks: 0,
            ctr: item?.ctr || 0,
            position: item?.position || 50,
            score: item?.authorityScore || item?.demandScore || 0,
            action: item?.lane === 'refresh' ? 'title_rewrite' : 'expand_or_build',
            suggestedContentType: contentType,
            region,
            ownerHint: await resolveOwner({ primaryKeyword: term, contentType, region }),
            writeHint: item?.writeHint,
          })
        }
      }
    } else if (useKeywordPlan) {
      const kwPlan = await buildKeywordPlan({
        planLimit: Math.max(limit * 4, 16),
        boardLimit: 100,
        regionFilter: regionFilter || undefined,
        minImpressions: minImpressions || 5,
        targetMix: body.planMix || { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      })
      planMeta = {
        mode: 'keyword-plan',
        summary: kwPlan.summary,
        mix: kwPlan.mix,
        targetMix: kwPlan.targetMix,
        source: kwPlan.source,
      }
      const terms = planTermsForAutoRun(kwPlan.plan, limit)
      candidates = []
      for (const term of terms) {
        const item = kwPlan.plan.find((p) => p.term === term)
        const region = item?.region || 'US'
        const contentType = item?.contentType || 'legal_guide'
        const ownerHint = await resolveOwner({
          primaryKeyword: term,
          contentType,
          region,
        })
        candidates.push({
          term,
          impressions: item?.impressions || 0,
          clicks: 0,
          ctr: item?.ctr || 0,
          position: item?.position || 50,
          score: item?.authorityScore || item?.demandScore || 0,
          action: item?.lane === 'refresh' ? 'title_rewrite' : 'expand_or_build',
          suggestedContentType: contentType,
          region,
          ownerHint,
          writeHint: item?.writeHint,
        })
      }
    } else {
      let pool = pickAutoRunCandidates(opportunities, 40)
      if (regionFilter) pool = pool.filter((o) => o.region === regionFilter)
      if (minImpressions > 0) pool = pool.filter((o) => o.impressions >= minImpressions)
      if (skipRecent) {
        pool = pool.filter((o) => !recent.has(o.term.toLowerCase()))
      }
      pool = pool.filter(
        (o) => !o.ownerHint?.blockers?.some((b) => /blocked_on_supply|301|merge/i.test(b)),
      )
      candidates = pool.slice(0, limit)
    }

    if (!candidates.length) {
      return NextResponse.json({
        ok: true,
        source,
        siteUrl,
        message: skipRecent
          ? 'No eligible opportunities (all top terms recently covered or filtered)'
          : 'No eligible opportunities to run',
        results: [],
        skippedRecent: recent.size,
      })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const results: Array<Record<string, unknown>> = []

    for (const opp of candidates) {
      try {
        // Prefer merge→main when auto mode so approved quality ships deploy
        const shipModeForRun =
          requestedMode === 'auto'
            ? 'merge'
            : requestedMode

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
          opportunityAction: cand.play
            ? playToOpportunityAction(cand.play as WarPlay)
            : String(opp.action),
          writeHint: cand.writeHint,
          userId,
        })

        results.push({
          ok: result.ok && !result.shipError,
          term: opp.term,
          play: cand.play || opp.action,
          estimatedGainClicks: cand.estimatedGainClicks,
          jobId: result.jobId,
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
          plan: {
            host: result.plan.host,
            repo: result.plan.repo,
            filePath: result.plan.filePath,
            canonicalUrl: result.plan.canonicalUrl,
            blockers: result.plan.blockers,
            ymy: result.plan.ymy,
          },
          audit: {
            score: result.audit.score,
            grade: result.audit.grade,
            wordCount: result.audit.wordCount,
            blockers: result.audit.blockers.map((b) => b.message),
            warnings: result.audit.warnings.slice(0, 4).map((w) => w.message),
          },
          shipMode: result.shipMode,
          ship: result.ship,
          shipError: result.shipError,
          contentPreview: result.content.slice(0, 600),
          gscImpressions: opp.impressions,
          gscPosition: opp.position,
        })
      } catch (e) {
        results.push({
          ok: false,
          term: opp.term,
          error: e instanceof Error ? e.message : 'Failed',
        })
      }
    }

    const shipped = results.filter((r) => r.ok && r.ship).length
    const avgScore =
      results.filter((r) => (r.audit as any)?.score != null).length > 0
        ? Math.round(
            results
              .filter((r) => (r.audit as any)?.score != null)
              .reduce((s, r) => s + Number((r.audit as any).score), 0) /
              results.filter((r) => (r.audit as any)?.score != null).length,
          )
        : null

    const modeLabel =
      (planMeta?.mode as string) ||
      (planMeta ? 'planned' : 'classic')
    return NextResponse.json({
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
      keywordPlan: planMeta,
      warRoom: planMeta?.mode === 'war-room' || planMeta?.mode === 'explicit+war-room' ? planMeta : null,
      results,
      message: dryRun
        ? `Dry-run complete: ${results.length} drafts (no GitHub writes) · ${modeLabel}`
        : `Auto-run complete: ${shipped}/${results.length} shipped · avg audit ${avgScore ?? '—'} · ${modeLabel}`,
    })
  } catch (err) {
    console.error('[seo-factory/auto-run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auto-run failed' },
      { status: 500 },
    )
  }
}
