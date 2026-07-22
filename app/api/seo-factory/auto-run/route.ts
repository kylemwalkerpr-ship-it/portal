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
    const explicitTerms: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []

    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(80)
    const recent = skipRecent ? await loadRecentPrimaryKeywords(45) : new Set<string>()

    let candidates: FactoryOpportunity[]
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
    } else {
      let pool = pickAutoRunCandidates(opportunities, 40)
      if (regionFilter) pool = pool.filter((o) => o.region === regionFilter)
      if (minImpressions > 0) pool = pool.filter((o) => o.impressions >= minImpressions)
      if (skipRecent) {
        pool = pool.filter((o) => !recent.has(o.term.toLowerCase()))
      }
      // Prefer expand_or_build, then title_rewrite; skip heavy ownership blockers when possible
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
        const result = await runSeoFactoryPipeline({
          topic: opp.term,
          title: opp.term,
          primaryKeyword: opp.term,
          region: opp.region || 'US',
          contentType: opp.suggestedContentType || 'legal_guide',
          tone: 'educational',
          shipMode: requestedMode,
          dryRun,
          minAuditScore,
          maxRefine,
          opportunityAction: opp.action,
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
      source,
      siteUrl,
      dryRun,
      requestedMode,
      minAuditScore,
      maxRefine,
      candidateCount: candidates.length,
      shipped,
      avgAuditScore: avgScore,
      skippedRecent: recent.size,
      results,
      message: dryRun
        ? `Dry-run complete: ${results.length} drafts (no GitHub writes)`
        : `Auto-run complete: ${shipped}/${results.length} shipped · avg audit ${avgScore ?? '—'}`,
    })
  } catch (err) {
    console.error('[seo-factory/auto-run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auto-run failed' },
      { status: 500 },
    )
  }
}
