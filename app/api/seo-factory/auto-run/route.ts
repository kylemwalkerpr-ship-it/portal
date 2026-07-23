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

/**
 * POST /api/seo-factory/auto-run
 *
 * Low-input pipeline with quality refine + keyword dedupe.
 *
 * Body:
 *   limit?: number (default 3, max 5)
 *   shipMode?: 'auto' | 'pr' | 'autodeploy' | 'none'
 *   dryRun?: boolean
 *   terms?: string[]
 *   minAuditScore?: number (default 55)
 *   maxRefine?: number (default 2)
 *   skipRecent?: boolean (default true) — skip keywords already shipped recently
 *   regionFilter?: 'US'|'UK'|'CA'|'AU'
 *   minImpressions?: number
 *   useKeywordPlan?: boolean (default true) — balanced GSC plan (refresh/expand/new)
 *   planMix?: { refresh, expand, build_new }
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
    const useKeywordPlan = body.useKeywordPlan !== false
    const explicitTerms: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []

    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(80)
    const recent = skipRecent ? await loadRecentPrimaryKeywords(45) : new Set<string>()

    let candidates: FactoryOpportunity[]
    let planMeta: Record<string, unknown> | null = null

    if (explicitTerms.length) {
      candidates = []
      for (const term of explicitTerms.slice(0, limit)) {
        if (skipRecent && recent.has(term.toLowerCase())) continue
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
    } else if (useKeywordPlan) {
      // Balanced research plan: refresh (CTR) + expand owners + limited net-new
      const kwPlan = await buildKeywordPlan({
        planLimit: Math.max(limit * 4, 16),
        boardLimit: 100,
        regionFilter: regionFilter || undefined,
        minImpressions: minImpressions || 5,
        targetMix: body.planMix || { refresh: 0.4, expand: 0.35, build_new: 0.25 },
      })
      planMeta = {
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
        } as FactoryOpportunity & { writeHint?: string })
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
          opportunityAction: opp.action,
          writeHint: (opp as any).writeHint,
          userId,
        })

        results.push({
          ok: result.ok && !result.shipError,
          term: opp.term,
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
      results,
      message: dryRun
        ? `Dry-run complete: ${results.length} drafts (no GitHub writes)`
        : `Auto-run complete: ${shipped}/${results.length} shipped · avg audit ${avgScore ?? '—'}${planMeta ? ' · GSC-balanced plan' : ''}`,
    })
  } catch (err) {
    console.error('[seo-factory/auto-run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auto-run failed' },
      { status: 500 },
    )
  }
}
