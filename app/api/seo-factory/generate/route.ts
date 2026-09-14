import { NextRequest, NextResponse } from 'next/server'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { requireAdminUser } from '@/lib/portalAuth'
import { runSeoFactoryPipeline, type RequestedShipMode, type PipelineInput } from '@/lib/seoFactory/pipeline'
import { runContentStudioPipeline } from '@/lib/seoFactory/contentStudioPipeline'
import { assembleMasterEngineFeed } from '@/lib/seoFactory/masterEngineFeed'
import { parseKeywordPhrases, parseKeywordTerms } from '@/lib/seoFactory/keywordContract'

/**
 * POST /api/seo-factory/generate
 * Full factory: plan → GSC → authoring → audit → optional ship.
 *
 * Contracted Content Studio requests are identified by contractId (or the
 * explicit writingContractRequired flag). They resolve the immutable contract
 * server-side before any pipeline/model call and never recompute brief inputs.
 * Uncontracted calls retain the historical SEO Factory behavior.
 */
export async function POST(request: NextRequest) {
  if (request.signal.aborted) {
    return NextResponse.json({ error: 'Request cancelled by client' }, { status: 499 })
  }

  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await request.json()
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic required' }, { status: 400 })

    const userId =
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id ||
      (auth as { profileId?: string }).profileId ||
      'admin'

    const primaryKeyword = String(body.primaryKeyword || body.primary_keyword || topic).trim()
    const region = String(body.region || 'US').toUpperCase()
    const contentType = String(body.contentType || body.content_type || 'legal_guide')
    const contractBound = Boolean(body.contractId || body.contract_id || body.writingContractRequired === true)
    const existingJobId = String(body.existingJobId || body.jobId || '').trim() || null

    // A persisted contract already contains the accepted intelligence snapshot.
    // Re-running Master Engine here would make JSON and SSE author from a
    // different dossier than suggest-brief saved.
    const engineFeed = contractBound
      ? null
      : await assembleMasterEngineFeed({
          topic,
          primaryKeyword,
          region,
          contentType,
          title: String(body.title || topic).trim(),
        }).catch(() => null)

    const input: PipelineInput & Record<string, unknown> = {
      topic,
      title: String(body.title || topic).trim(),
      primaryKeyword,
      region,
      contentType,
      tone: String(body.tone || 'educational'),
      audience: body.audience ? String(body.audience) : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords.map(String) : undefined,
      requiredShortKeywords: parseKeywordPhrases(body.requiredShortKeywords),
      requiredLongTailKeywords: parseKeywordPhrases(body.requiredLongTailKeywords),
      shortKeywordTerms: parseKeywordTerms(body.shortKeywordTerms),
      longTailKeywordTerms: parseKeywordTerms(body.longTailKeywordTerms),
      h2Outline: Array.isArray(body.h2Outline) ? body.h2Outline.map(String) : undefined,
      sectionPlan: Array.isArray(body.sectionPlan) ? body.sectionPlan : undefined,
      thesis: body.thesis ? String(body.thesis) : undefined,
      takeaways: Array.isArray(body.takeaways) ? body.takeaways.map(String) : undefined,
      faqQuestions: Array.isArray(body.faqQuestions) ? body.faqQuestions.map(String) : undefined,
      lede: body.lede ? String(body.lede) : undefined,
      sources: contractBound
        ? (Array.isArray(body.sources) ? body.sources.map(String) : undefined)
        : [
            ...(Array.isArray(body.sources) ? body.sources.map(String) : []),
            ...(engineFeed?.sources || []),
          ].filter(Boolean),
      interlinks: Array.isArray(body.interlinks) ? body.interlinks : undefined,
      minWords: body.minWords != null ? Number(body.minWords) : undefined,
      maxWords: body.maxWords != null ? Number(body.maxWords) : undefined,
      targetSlug: body.targetSlug ? String(body.targetSlug) : undefined,
      slug: body.slug,
      indexable: body.indexable !== false,
      shipMode: (body.shipMode || body.ship_mode || 'pr') as RequestedShipMode,
      dryRun: Boolean(body.dryRun),
      minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
      maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 8,
      opportunityAction: body.opportunityAction,
      aiProvider: body.aiProvider ? String(body.aiProvider).trim() : undefined,
      marketplaceCta: body.marketplaceCta && typeof body.marketplaceCta === 'object'
        ? {
            service: String(body.marketplaceCta.service || '').trim() || undefined,
            slug: String(body.marketplaceCta.slug || '').trim() || undefined,
            priceBand: String(body.marketplaceCta.priceBand || '').trim() || undefined,
          }
        : undefined,
      titleCandidate: body.titleCandidate ? String(body.titleCandidate).trim() : undefined,
      masterEngineBlock: contractBound ? null : engineFeed?.promptBlock || null,
      intelligenceLineage: contractBound
        ? null
        : engineFeed?.lineage ? { masterEngine: engineFeed.lineage } : null,
      userId,
      existingJobId,
      signal: request.signal,
      writingContractRequired: contractBound,
      contractId: String(body.contractId || body.contract_id || '').trim() || null,
      contractHash: String(body.contractHash || body.contract_hash || '').trim() || null,
      contractVersion: body.contractVersion ?? body.contract_version ?? null,
      evidenceHash: String(body.evidenceHash || body.evidence_hash || '').trim() || null,
      opportunityId: String(body.opportunityId || body.opportunity_id || '').trim() || null,
    }

    const result = contractBound
      ? await runContentStudioPipeline(input as Parameters<typeof runContentStudioPipeline>[0])
      : await runSeoFactoryPipeline(input)

    if (result.shipError && !result.content) {
      return NextResponse.json({ ok: false, error: result.shipError, ...result }, { status: 422 })
    }

    return NextResponse.json({
      ok: result.ok,
      jobId: result.jobId,
      content: result.content,
      plan: result.plan,
      audit: result.audit,
      ship: result.ship,
      shipError: result.shipError,
      shipMode: result.shipMode,
      gsc: result.gsc,
      provider: result.provider,
      model: result.model,
      attempts: result.attempts,
      error: result.shipError || undefined,
    }, { status: result.shipError ? 422 : 200 })
  } catch (err) {
    console.error('[seo-factory/generate]', err)
    const message = err instanceof Error ? err.message : 'Generate failed'
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    const contractError = /writing contract|contractHash|contractId|evidence.*mismatch|client .* conflicts/i.test(message)
    return NextResponse.json(
      { error: message },
      { status: contractError ? 409 : isCpuTimeout ? 503 : 500 },
    )
  }
}
