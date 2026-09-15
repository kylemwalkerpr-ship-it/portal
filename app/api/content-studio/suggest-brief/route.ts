export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { resolveBriefRegion } from '@/lib/seoEngine/researchDemand'
import { POST as runSuggestBriefCore } from './core'
import {
  OpportunityAlreadyReservedError,
  failSuggestBriefContract,
  finalizeSuggestBriefContract,
  startSuggestBriefContract,
  tinyfishPromptBlock,
  type SuggestBriefContractSession,
} from '@/lib/seoFactory/suggestBriefContract'
import type { SealedBrief } from '@/lib/seoFactory/sealedBrief'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { assertBriefReady } from '@/lib/seoFactory/briefReadiness'

export async function POST(req: NextRequest) {
  let session: SuggestBriefContractSession | null = null
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json().catch(() => ({})) as Record<string, any>
    const topic = String(body.topic || '').trim()
    if (!topic) return NextResponse.json({ error: 'topic is required' }, { status: 400 })

    const primaryKeyword = String(body.primaryKeyword || topic).trim()
    const contentType = String(body.contentType || 'article')
    const resolvedRegion = resolveBriefRegion(typeof body.region === 'string' ? body.region : null, `${topic} ${primaryKeyword}`)
    const region = resolvedRegion.region
    const audience = String(body.audience || '').trim()
    const audienceStage = String(body.audienceStage || body.opportunity?.audienceStage || body.opportunity?.stage || '').trim() || undefined
    const userId = String(
      (auth as { profile?: { clerk_user_id?: string }; profileId?: string }).profile?.clerk_user_id
      || (auth as { profileId?: string }).profileId
      || 'admin',
    )

    session = await startSuggestBriefContract({
      topic, primaryKeyword, title: String(body.title || primaryKeyword || topic), userId,
      contentType, tone: String(body.tone || 'educational'), region, audienceStage,
    })

    const tinyfishBlock = tinyfishPromptBlock(session.tinyfish)
    const priorOpportunity = body.opportunity && typeof body.opportunity === 'object' ? body.opportunity : {}
    body.opportunity = {
      ...priorOpportunity,
      signals: [...(Array.isArray(priorOpportunity.signals) ? priorOpportunity.signals.map(String) : []), tinyfishBlock],
    }
    body.region = region
    body.primaryKeyword = primaryKeyword

    const forwarded = new NextRequest(req.url, {
      method: 'POST', headers: req.headers, body: JSON.stringify(body), signal: req.signal,
    })
    const coreResponse = await runSuggestBriefCore(forwarded)
    const payload = await coreResponse.clone().json().catch(() => null) as Record<string, any> | null
    if (!coreResponse.ok || !payload?.ok) {
      await failSuggestBriefContract(session, new Error(String(payload?.error || `brief core HTTP ${coreResponse.status}`)))
      return coreResponse
    }

    const sealedBrief = payload.sealedBrief as SealedBrief | undefined
    if (!sealedBrief) throw new Error('brief_invalid: core response omitted sealedBrief')

    // Fail closed at the transaction boundary. The historical core can no
    // longer turn an empty/sparse response into a canned immigration skeleton
    // and have it persisted as authoritative editorial substance.
    const observedEvidenceCount = session.tinyfish.observations.length
      + (Number(body.gscImpressions) > 0 || Number(body.gscClicks) > 0 || Number(body.gscPosition) > 0 ? 1 : 0)
      + (Array.isArray(payload.fromUbersuggest) ? payload.fromUbersuggest.length : 0)
    assertBriefReady({ brief: sealedBrief, contentType, primaryKeyword, observedEvidenceCount })

    const interlinks = Array.isArray(payload.interlinkTargets)
      ? payload.interlinkTargets
          .map((link: any) => ({ label: link?.label ? String(link.label) : undefined, url: String(link?.url || '').trim(), placement: link?.placement ? String(link.placement) : undefined }))
          .filter((link: { url: string }) => Boolean(link.url))
      : []

    const contract = await finalizeSuggestBriefContract({
      session, topic, primaryKeyword, contentType, region,
      audience: String(payload.recommendedAudience || audience || topic), audienceStage, sealedBrief,
      requiredShortKeywords: Array.isArray(payload.shortTail) ? payload.shortTail.map(String) : [],
      requiredLongTailKeywords: Array.isArray(payload.longTail) ? payload.longTail.map(String) : [],
      shortKeywordTerms: Array.isArray(payload.shortKeywordTerms) ? payload.shortKeywordTerms as KeywordTerm[] : [],
      longTailKeywordTerms: Array.isArray(payload.longTailKeywordTerms) ? payload.longTailKeywordTerms as KeywordTerm[] : [],
      minWords: Number(payload.minWords || 0), targetWords: Number(payload.targetWords || 0), maxWords: Number(payload.maxWords || 0),
      sources: Array.isArray(payload.sources) ? payload.sources.map(String) : [], interlinks,
      title: String(payload.suggestedH1 || body.title || primaryKeyword), targetSlug: String(payload.targetSlug || '').trim(),
      metaDescription: payload.metaDescription ? String(payload.metaDescription) : undefined,
      tone: payload.recommendedTone ? String(payload.recommendedTone) : String(body.tone || 'educational'),
      requestedModel: String(payload.ownerProvider || body.aiProvider || '').trim() || undefined,
      actualModel: String(payload.model || '').trim() || undefined,
      gsc: { impressions: Number(body.gscImpressions) || 0, clicks: Number(body.gscClicks) || 0, position: Number(body.gscPosition) || 0 },
      engineOk: Boolean(payload.masterEngine?.ok),
      ubersuggestTerms: Array.isArray(payload.fromUbersuggest) ? payload.fromUbersuggest.map(String) : [],
    })

    return NextResponse.json({
      ...payload,
      jobId: session.reservation.jobId,
      opportunityId: contract.opportunity.id,
      contractId: contract.contractId,
      contractVersion: contract.contractVersion,
      contractHash: contract.contractHash,
      evidenceHash: contract.evidenceHash,
      researchGaps: contract.researchGaps,
      sourceHealth: contract.sourceHealth,
    }, { status: coreResponse.status })
  } catch (error) {
    if (session) await failSuggestBriefContract(session, error)
    if (error instanceof OpportunityAlreadyReservedError) {
      return NextResponse.json({
        ok: false, error: error.message, code: 'opportunity_reserved', jobId: error.jobId,
        contractId: error.contract?.contractId || null, contractHash: error.contract?.contractHash || null,
        contractVersion: error.contract?.contractVersion || null,
      }, { status: 409 })
    }
    const message = error instanceof Error ? error.message : 'suggest brief failed'
    const status = /brief_invalid|needs_research|writing contract validation/i.test(message) ? 422 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
