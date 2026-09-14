/**
 * POST /api/content-studio/generate
 *
 * Compatibility entry point for older UI tabs. Contracted jobs use the same
 * immutable production runner as /api/seo-factory/generate; historical calls
 * without contract identity retain the explicit legacy SEO Factory path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  runSeoFactoryPipeline,
  type RequestedShipMode,
  type PipelineInput,
} from '@/lib/seoFactory/pipeline'
import { runContentStudioPipeline } from '@/lib/seoFactory/contentStudioPipeline'
import { parseKeywordPhrases, parseKeywordTerms } from '@/lib/seoFactory/keywordContract'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await request.json().catch(() => ({}))) as Record<string, any>
    const topic = String(body.topic || body.title || '').trim()
    if (!topic) return NextResponse.json({ error: 'Topic is required' }, { status: 400 })

    const contentTypeRaw = String(body.content_type || body.contentType || 'legal_guide')
    const contentType = contentTypeRaw === 'article'
      ? 'legal_guide'
      : contentTypeRaw === 'blog_post'
        ? 'blog_summary'
        : contentTypeRaw
    const region = String(body.region || 'US').toUpperCase()
    const shipMode = (String(body.ship_mode || body.shipMode || 'pr').toLowerCase() || 'pr') as RequestedShipMode
    const isRegen = Boolean(body.sourceJobId)
    const contractBound = Boolean(body.contractId || body.contract_id || body.writingContractRequired === true)

    const input: PipelineInput & Record<string, unknown> = {
      topic,
      title: String(body.title || topic),
      primaryKeyword: isRegen ? topic : String(body.primaryKeyword || body.primary_keyword || topic),
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
      sources: Array.isArray(body.sources) ? body.sources.map(String) : undefined,
      interlinks: Array.isArray(body.interlinks) ? body.interlinks : undefined,
      minWords: body.minWords != null ? Number(body.minWords) : undefined,
      maxWords: body.maxWords != null ? Number(body.maxWords) : undefined,
      targetSlug: body.targetSlug ? String(body.targetSlug) : undefined,
      kwH2Map: body.kwH2Map && typeof body.kwH2Map === 'object'
        ? Object.fromEntries(Object.entries(body.kwH2Map as Record<string, unknown>).map(([k, v]) => [String(k), String(v)]))
        : undefined,
      sectionPlan: Array.isArray(body.sectionPlan) ? body.sectionPlan as PipelineInput['sectionPlan'] : undefined,
      thesis: body.thesis ? String(body.thesis) : undefined,
      takeaways: Array.isArray(body.takeaways) ? body.takeaways.map(String) : undefined,
      faqQuestions: Array.isArray(body.faqQuestions) ? body.faqQuestions.map(String) : undefined,
      lede: body.lede ? String(body.lede) : undefined,
      shipMode,
      dryRun: Boolean(body.dryRun || body.dry_run),
      minAuditScore: body.minAuditScore != null ? Number(body.minAuditScore) : 65,
      maxRefine: body.maxRefine != null ? Number(body.maxRefine) : 2,
      userId: auth.profileId || 'admin',
      existingJobId: String(body.existingJobId || body.jobId || '').trim() || null,
      sourceJobId: body.sourceJobId ? String(body.sourceJobId) : null,
      regenerationReason: body.regenerationReason ? String(body.regenerationReason).slice(0, 500) : null,
      regenerationMode: body.regenerationMode === 'resume' ? 'resume' : body.sourceJobId ? 'manual' : 'new',
      intelligenceLineage: contractBound
        ? null
        : body.intelligenceLineage && typeof body.intelligenceLineage === 'object'
          ? body.intelligenceLineage as Record<string, unknown>
          : null,
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

    return NextResponse.json({
      ok: result.ok,
      content: result.content,
      provider: result.provider,
      model: result.model,
      jobId: result.jobId,
      plan: result.plan,
      audit: result.audit,
      ship: result.ship,
      shipError: result.shipError,
      shipMode: result.shipMode,
      wordCount: result.audit.wordCount,
      seoScore: result.audit.score,
      gsc: result.gsc,
      error: result.error || result.shipError || null,
      pipeline: contractBound ? 'content-studio-contract-v2' : 'seo-factory-legacy',
    })
  } catch (err) {
    console.error('[content-studio/generate]', err)
    const message = err instanceof Error ? err.message : 'Generate failed'
    const contractError = /writing contract|contractHash|contractId|evidence.*mismatch|client .* conflicts/i.test(message)
    return NextResponse.json({ ok: false, error: message }, { status: contractError ? 409 : 500 })
  }
}
