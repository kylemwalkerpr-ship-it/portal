import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveOwner } from '@/lib/seoFactory/ownership'
import { auditContent, canAutodeploy } from '@/lib/seoFactory/audit'
import { shipContent, type ShipMode } from '@/lib/seoFactory/ship'
import { buildGscContentBrief, formatGscBriefForPrompt } from '@/lib/gscContentBrief'
import { generateContentText } from '@/lib/contentAiProvider'
import {
  loadFactoryOpportunities,
  pickAutoRunCandidates,
  type FactoryOpportunity,
} from '@/lib/seoFactory/opportunities'

/**
 * POST /api/seo-factory/auto-run
 *
 * Low-input pipeline: pull top GSC opportunities → Cloudflare AI generate →
 * audit gates → ship (PR by default; autodeploy only when audit + ownership allow).
 *
 * Body:
 *   limit?: number (default 3, max 5)
 *   shipMode?: 'auto' | 'pr' | 'autodeploy' (default auto)
 *   dryRun?: boolean
 *   terms?: string[]  // optional explicit keywords; skips opportunity pick
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(5, Math.max(1, Number(body.limit) || 3))
    const requestedMode = String(body.shipMode || body.ship_mode || 'auto').toLowerCase()
    const dryRun = Boolean(body.dryRun)
    const explicitTerms: string[] = Array.isArray(body.terms)
      ? body.terms.map((t: unknown) => String(t).trim()).filter(Boolean)
      : []

    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(50)

    let candidates: FactoryOpportunity[]
    if (explicitTerms.length) {
      candidates = []
      for (const term of explicitTerms.slice(0, limit)) {
        const region =
          /uk|british/i.test(term) ? 'UK' : /canada|pgwp/i.test(term) ? 'CA' : /485|australia/i.test(term) ? 'AU' : 'US'
        const contentType = 'legal_guide'
        candidates.push({
          term,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 50,
          score: 0,
          action: 'expand_or_build' as const,
          suggestedContentType: contentType,
          region,
          ownerHint: await resolveOwner({ primaryKeyword: term, contentType, region }),
        })
      }
    } else {
      candidates = pickAutoRunCandidates(opportunities, limit)
    }

    if (!candidates.length) {
      return NextResponse.json({
        ok: true,
        source,
        siteUrl,
        message: 'No eligible opportunities to run',
        results: [],
      })
    }

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const results: Array<Record<string, unknown>> = []

    for (const opp of candidates) {
      const primaryKeyword = opp.term
      const topic = opp.term
      const region = opp.region || 'US'
      const contentType = opp.suggestedContentType || 'legal_guide'
      const title = topic

      try {
        const plan = await resolveOwner({
          primaryKeyword,
          contentType,
          region,
          indexable: true,
        })

        // Hard ownership blockers → still generate draft but force PR (or skip ship)
        const gscBrief = await buildGscContentBrief({
          topic,
          region,
          keywords: [primaryKeyword],
        })
        const gscBlock = formatGscBriefForPrompt(gscBrief)

        const system = [
          'You are an SEO content factory for YouSafe / MyCaseworks immigration estate.',
          'Write authoritative, plain-English content. No banned marketing fluff.',
          'ZERO outcome promises. Cite .gov/.edu authorities.',
          'Output raw markdown with YAML front matter including: title, description, primaryKeyword, robots, date.',
          plan.indexable
            ? 'robots: index,follow — include TL;DR, FAQ section, Article+FAQPage JSON-LD.'
            : 'robots: noindex,follow — supporting/thin page.',
          `Canonical must be: ${plan.canonicalUrl}`,
          `Owner host: ${plan.host}. Do not cannibalize other estate hosts.`,
          'Target length: ≥1200 words for guides; ≥700 for blogs.',
          'Do NOT wrap output in ``` fences. Emit raw markdown only.',
        ].join('\n')

        const prompt = [
          `Title hint: ${title}`,
          `Topic: ${topic}`,
          `Primary keyword: ${primaryKeyword}`,
          `Region: ${region}`,
          `Content type: ${contentType}`,
          'Tone: educational',
          '',
          gscBlock,
          '',
          'Write the full page now. Use GSC primary keywords in title/H2/FAQ when accurate.',
          opp.action === 'title_rewrite'
            ? 'Emphasize a high-CTR title and meta description (year + place + action).'
            : 'Expand with concrete procedures, documents, and FAQs for weak-rank / high-impression queries.',
        ]
          .filter(Boolean)
          .join('\n')

        const ai = await generateContentText({ system, prompt, maxTokens: 5000 })
        const content = ai.text

        const audit = auditContent({
          content,
          contentType,
          primaryKeyword,
          indexable: plan.indexable,
          ownershipBlockers: plan.blockers,
        })

        // Ship mode resolution
        let shipMode: ShipMode | 'none' = 'pr'
        if (requestedMode === 'none') {
          shipMode = 'none'
        } else if (requestedMode === 'pr') {
          shipMode = 'pr'
        } else if (requestedMode === 'autodeploy') {
          shipMode = canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0
            ? 'autodeploy'
            : 'pr'
        } else {
          // auto: autodeploy when safe, else PR
          shipMode =
            canAutodeploy(audit, plan.ymy) && plan.blockers.length === 0
              ? 'autodeploy'
              : 'pr'
        }

        let shipResult = null
        let shipError: string | null = null
        if (shipMode !== 'none') {
          try {
            shipResult = await shipContent({
              mode: shipMode,
              plan,
              content,
              title,
              region,
              contentType,
              primaryKeyword,
              audit,
              dryRun,
            })
          } catch (e) {
            shipError = e instanceof Error ? e.message : 'Ship failed'
          }
        }

        let jobId: string | null = null
        try {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          )
          const { data: job } = await supabase
            .from('content_jobs')
            .insert({
              user_id: userId,
              title,
              topic,
              content_type: contentType === 'legal_guide' ? 'article' : contentType,
              tone: 'educational',
              region,
              target_repo: plan.repo,
              status:
                shipResult?.status === 'deployed'
                  ? 'merged'
                  : shipResult?.status === 'pr_created'
                    ? 'pr_created'
                    : shipError
                      ? 'failed'
                      : 'drafting',
              slug: plan.filePath.split('/').filter(Boolean).slice(-2, -1)[0] || null,
              content,
              branch_name: shipResult?.branch || null,
              content_path: shipResult?.path || plan.filePath,
              pr_url: shipResult?.prUrl || null,
              pr_number: shipResult?.prNumber || null,
              ai_provider: ai.provider,
              word_count: audit.wordCount,
              seo_score: audit.score,
              ship_mode: shipMode === 'none' ? 'pr' : shipMode,
              indexable: plan.indexable,
              canonical_url: plan.canonicalUrl,
              owner_host: plan.host,
              primary_keyword: primaryKeyword,
              audit_json: audit,
              gsc_json: {
                source: gscBrief.source,
                autoRun: true,
                opportunityScore: opp.score,
                opportunityAction: opp.action,
              },
              deploy_sha: shipResult?.commitSha || null,
              deployed_at:
                shipResult?.status === 'deployed' ? new Date().toISOString() : null,
              llms_included: audit.llmsRecommended,
              error_message: shipError,
            })
            .select('id')
            .single()
          jobId = job?.id ?? null
        } catch (e) {
          console.warn('[seo-factory/auto-run] job persist skipped', e)
        }

        results.push({
          ok: !shipError,
          term: primaryKeyword,
          jobId,
          provider: ai.provider,
          model: ai.model,
          plan: {
            host: plan.host,
            repo: plan.repo,
            filePath: plan.filePath,
            canonicalUrl: plan.canonicalUrl,
            blockers: plan.blockers,
            ymy: plan.ymy,
          },
          audit: {
            score: audit.score,
            grade: audit.grade,
            wordCount: audit.wordCount,
            blockers: audit.blockers.map((b) => b.message),
          },
          shipMode,
          ship: shipResult,
          shipError,
          contentPreview: content.slice(0, 500),
        })
      } catch (e) {
        results.push({
          ok: false,
          term: primaryKeyword,
          error: e instanceof Error ? e.message : 'Failed',
        })
      }
    }

    const shipped = results.filter((r) => r.ok && r.ship).length
    return NextResponse.json({
      ok: true,
      source,
      siteUrl,
      dryRun,
      requestedMode,
      candidateCount: candidates.length,
      shipped,
      results,
      message: dryRun
        ? `Dry-run complete: ${results.length} drafts planned (no GitHub writes)`
        : `Auto-run complete: ${shipped}/${results.length} shipped via Cloudflare AI`,
    })
  } catch (err) {
    console.error('[seo-factory/auto-run]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Auto-run failed' },
      { status: 500 },
    )
  }
}
