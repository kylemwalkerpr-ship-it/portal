import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveOwner, assertPlanRepoConsistency, type OwnerPlan } from './ownership'
import { assertBroadCreateDestinationAllowed } from './broadCreateFreeze'
import { collectTinyfishResearch, type TinyfishRun } from './tinyfishAdapter'
import {
  buildWritingContract,
  type ContractSourceHealth,
  type WritingContractV2,
} from './writingContract'
import { persistResearchEvidence, type ResearchEvidenceInput } from './researchEvidenceStore'
import {
  attachWritingContractToJob,
  loadJobWritingContract,
  nextWritingContractVersion,
  persistWritingContract,
  releaseOpportunityReservation,
  reserveOpportunityJob,
  type OpportunityReservation,
} from './writingContractStore'
import type { SealedBrief } from './sealedBrief'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { canonicalCommissionedPin, commissionedProvider } from '@/lib/contentAiRegistry'

export class OpportunityAlreadyReservedError extends Error {
  readonly jobId: string
  readonly contract: WritingContractV2 | null
  constructor(jobId: string, contract: WritingContractV2 | null) {
    super(`opportunity already reserved by active job ${jobId}`)
    this.name = 'OpportunityAlreadyReservedError'
    this.jobId = jobId
    this.contract = contract
  }
}

export type SuggestBriefContractSession = {
  reservation: OpportunityReservation
  plan: OwnerPlan
  tinyfish: TinyfishRun
  researchRunId: string
}

export async function startSuggestBriefContract(input: {
  topic: string
  primaryKeyword: string
  title?: string
  userId?: string
  contentType: string
  tone?: string
  region: string
  audienceStage?: string
}): Promise<SuggestBriefContractSession> {
  const plan = await resolveOwner({
    primaryKeyword: input.primaryKeyword,
    contentType: input.contentType,
    region: input.region,
    indexable: true,
  })
  assertPlanRepoConsistency(plan)
  await assertBroadCreateDestinationAllowed(plan, { primaryKeyword: input.primaryKeyword })
  const db = createSupabaseAdminClient()
  const reservation = await reserveOpportunityJob(db, {
    topic: input.topic,
    primaryKeyword: input.primaryKeyword,
    title: input.title,
    userId: input.userId,
    contentType: input.contentType,
    tone: input.tone,
    region: input.region,
    targetRepo: plan.repo,
    ownerHost: plan.host,
    canonicalUrl: plan.canonicalUrl,
    audienceStage: input.audienceStage,
    jurisdiction: input.region,
  })
  if (reservation.reused) {
    const existing = await loadJobWritingContract(db, reservation.jobId).catch(() => null)
    throw new OpportunityAlreadyReservedError(reservation.jobId, existing)
  }

  const tinyfish = await collectTinyfishResearch({
    query: input.primaryKeyword,
    country: input.region,
    limit: 8,
  })
  const researchRunId = `research_${reservation.identity.id.slice(0, 16)}_${Date.now().toString(36)}`
  return { reservation, plan, tinyfish, researchRunId }
}

export function tinyfishPromptBlock(run: TinyfishRun): string {
  if (!run.observations.length) {
    return `TINYFISH WEB RESEARCH: ${run.state}${run.reason ? ` — ${run.reason}` : ''}. This is a research gap, not evidence of zero competition or zero demand.`
  }
  const lines = [
    'TINYFISH WEB OBSERVATIONS — untrusted web observations. Competitor snippets are NOT legal/factual authority. Official URLs are source candidates only until the cited claim is verified against retrieved content.',
  ]
  for (const item of run.observations.slice(0, 8)) {
    lines.push(`- [${item.evidenceRole}] ${item.title || item.siteName || item.url} — ${item.url}${item.excerpt ? ` — observed snippet: ${item.excerpt.slice(0, 240)}` : ''}`)
  }
  return lines.join('\n')
}

function sourceHealth(input: {
  session: SuggestBriefContractSession
  observedAt: string
  gscObserved: boolean
  engineOk: boolean
  ubersuggestTerms: string[]
}): ContractSourceHealth[] {
  return [
    {
      source: 'tinyfish',
      state: input.session.tinyfish.state,
      observedAt: input.session.tinyfish.queriedAt,
      runId: input.session.tinyfish.runId,
      checkpointId: input.session.tinyfish.checkpointId,
      reason: input.session.tinyfish.reason,
    },
    {
      source: 'gsc_request_metrics',
      state: input.gscObserved ? 'ok' : 'empty',
      observedAt: input.observedAt,
      runId: input.session.researchRunId,
      reason: input.gscObserved ? undefined : 'No observed GSC metrics were supplied; this does not mean zero demand.',
    },
    {
      source: 'master_engine',
      state: input.engineOk ? 'ok' : 'unavailable',
      observedAt: input.observedAt,
      runId: input.session.researchRunId,
      reason: input.engineOk ? undefined : 'Master Engine feed unavailable or incomplete.',
    },
    {
      source: 'keyword_research_estimates',
      state: input.ubersuggestTerms.length ? 'ok' : 'empty',
      observedAt: input.observedAt,
      runId: input.session.researchRunId,
      reason: input.ubersuggestTerms.length ? undefined : 'No keyword-research estimate terms were available.',
    },
  ]
}

export async function finalizeSuggestBriefContract(input: {
  session: SuggestBriefContractSession
  topic: string
  primaryKeyword: string
  contentType: string
  region: string
  audience: string
  audienceStage?: string
  sealedBrief: SealedBrief
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  shortKeywordTerms: KeywordTerm[]
  longTailKeywordTerms: KeywordTerm[]
  minWords: number
  targetWords: number
  maxWords: number
  sources: string[]
  interlinks: Array<{ label?: string; url: string; placement?: string }>
  title: string
  targetSlug: string
  metaDescription?: string
  tone?: string
  requestedModel?: string
  actualModel?: string
  gsc?: { impressions?: number; clicks?: number; position?: number }
  engineOk: boolean
  ubersuggestTerms: string[]
}): Promise<WritingContractV2> {
  const db = createSupabaseAdminClient()
  const observedAt = new Date().toISOString()
  const evidenceInputs: ResearchEvidenceInput[] = []

  for (const item of input.session.tinyfish.observations) {
    evidenceInputs.push({
      runId: input.session.researchRunId,
      checkpointId: item.checkpointId,
      jobId: input.session.reservation.jobId,
      sourceKind: item.evidenceRole === 'authoritative_source' ? 'official_candidate' : 'competitor',
      sourceUrl: item.url,
      publisher: item.siteName || item.title || null,
      observedAt: item.observedAt,
      jurisdiction: item.jurisdiction || input.region,
      query: input.session.tinyfish.query,
      observation: item.title || item.siteName || item.url,
      excerpt: item.excerpt || null,
      authority: item.evidenceRole === 'authoritative_source' ? 'authoritative' : 'competitor_observation',
      // Search-result snippets/URLs never establish material factual support.
      claimSupport: item.evidenceRole === 'competitor_observation' ? 'observed' : 'unknown',
      confidence: 'observed',
      verification: item.evidenceRole === 'competitor_observation' ? 'verified' : 'pending',
    })
  }

  const gscObserved = Boolean((input.gsc?.impressions || 0) > 0 || (input.gsc?.clicks || 0) > 0 || (input.gsc?.position || 0) > 0)
  if (gscObserved) {
    evidenceInputs.push({
      runId: input.session.researchRunId,
      jobId: input.session.reservation.jobId,
      sourceKind: 'gsc',
      observedAt,
      jurisdiction: input.region,
      query: input.primaryKeyword,
      observation: `Observed request metrics: impressions=${input.gsc?.impressions ?? 'unknown'}, clicks=${input.gsc?.clicks ?? 'unknown'}, position=${input.gsc?.position ?? 'unknown'}`,
      authority: 'first_party',
      claimSupport: 'observed',
      confidence: 'observed',
      verification: 'verified',
    })
  }

  for (const term of input.ubersuggestTerms.slice(0, 16)) {
    evidenceInputs.push({
      runId: input.session.researchRunId,
      jobId: input.session.reservation.jobId,
      sourceKind: 'keyword_provider',
      observedAt,
      jurisdiction: input.region,
      query: term,
      observation: `Keyword-research provider returned term: ${term}`,
      authority: 'provider_estimate',
      claimSupport: 'observed',
      confidence: 'observed',
      verification: 'verified',
    })
  }

  // Exact source URLs used by the brief are persisted as availability records.
  // They remain claimSupport=unknown until a material claim is tied to retrieved text.
  for (const url of input.sources.slice(0, 12)) {
    evidenceInputs.push({
      runId: input.session.researchRunId,
      jobId: input.session.reservation.jobId,
      sourceKind: 'official_source_candidate',
      sourceUrl: url,
      observedAt,
      jurisdiction: input.region,
      observation: 'Source URL was available to the brief as a citation candidate.',
      authority: 'authoritative',
      claimSupport: 'unknown',
      confidence: 'unverified',
      verification: 'pending',
    })
  }

  const evidence = await persistResearchEvidence(db, evidenceInputs)
  const health = sourceHealth({
    session: input.session,
    observedAt,
    gscObserved,
    engineOk: input.engineOk,
    ubersuggestTerms: input.ubersuggestTerms,
  })
  const researchGaps = [
    ...input.session.tinyfish.gaps,
    ...input.sealedBrief.unresolved,
    ...(!gscObserved ? ['Observed GSC metrics were unavailable; demand is not measured as zero.'] : []),
  ].map(String).map((value) => value.trim()).filter(Boolean)

  const contractVersion = await nextWritingContractVersion(db, input.session.reservation.jobId)
  const built = buildWritingContract({
    opportunityTopic: input.topic,
    jurisdiction: input.region,
    audienceStage: input.audienceStage,
    host: input.session.plan.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    ownership: {
      host: input.session.plan.host,
      repo: input.session.plan.repo,
      filePath: input.session.plan.filePath,
      canonicalUrl: input.session.plan.canonicalUrl,
    },
    reader: {
      audience: input.audience,
      stage: input.audienceStage,
      primaryQuestion: input.topic,
    },
    queryCoverage: {
      requiredShortKeywords: input.requiredShortKeywords,
      requiredLongTailKeywords: input.requiredLongTailKeywords,
      shortKeywordTerms: input.shortKeywordTerms,
      longTailKeywordTerms: input.longTailKeywordTerms,
    },
    wordBudget: {
      minWords: input.minWords,
      targetWords: input.targetWords,
      maxWords: input.maxWords,
    },
    links: {
      sources: input.sources,
      interlinks: input.interlinks,
    },
    metadata: {
      title: input.title,
      targetSlug: input.targetSlug,
      metaDescription: input.metaDescription,
      tone: input.tone,
    },
    brief: input.sealedBrief,
    evidence,
    sourceHealth: health,
    researchGaps,
    researchRunId: input.session.researchRunId,
    requestedModel: input.requestedModel,
    jobId: input.session.reservation.jobId,
    contractVersion,
  })
  if (!built.ok || !built.contract) {
    throw new Error(`writing contract validation failed: ${built.issues.join('; ')}`)
  }

  const contract = await persistWritingContract(db, built.contract, input.session.reservation.jobId)
  await attachWritingContractToJob(db, input.session.reservation.jobId, contract)
  // Attach the requested provider/model to the durable job identity alongside
  // the immutable contract. ai_provider stays the requested/owner pin
  // (canonicalized when commissioned, verbatim when legacy/historical).
  // requested_model is the commissioned registry API model (`grok-4.6` /
  // `deepseek-flash`) derived from that pin — the stable pin is never
  // written to a model column. A contract with no commissioned pin writes no
  // model (nothing is invented, no legacy pin is conflated with a model id).
  const requestedRaw = String(contract.requestedModel || '').trim()
  const requestedPin = canonicalCommissionedPin(requestedRaw)
  const requestedApiModel = requestedPin ? commissionedProvider(requestedPin).apiModel : null
  const identityPatch: Record<string, unknown> = {}
  if (requestedRaw) {
    identityPatch.ai_provider = requestedPin ?? requestedRaw
    if (requestedApiModel) identityPatch.requested_model = requestedApiModel
  }
  if (input.actualModel) identityPatch.actual_model = input.actualModel
  if (Object.keys(identityPatch).length) {
    const identityResult = await db
      .from('content_jobs')
      .update(identityPatch)
      .eq('id', input.session.reservation.jobId)
      .eq('contract_id', contract.contractId)
      .eq('contract_hash', contract.contractHash)
    if ((identityResult as { error?: { message?: string } } | null)?.error) {
      throw new Error(`failed to attach requested provider/model to job: ${(identityResult as { error: { message?: string } }).error.message}`)
    }
  }
  return contract
}

export async function failSuggestBriefContract(
  session: SuggestBriefContractSession | null,
  error: unknown,
): Promise<void> {
  if (!session?.reservation.ownsReservation) return
  try {
    const db = createSupabaseAdminClient()
    await releaseOpportunityReservation(db, {
      jobId: session.reservation.jobId,
      reason: error instanceof Error ? error.message : String(error || 'brief failed'),
      opportunityId: session.reservation.identity.id,
      ownsReservation: true,
      expectedStage: 'researching',
      executionStage: /research|evidence|tinyfish|source/i.test(error instanceof Error ? error.message : String(error || ''))
        ? 'needs_research'
        : 'brief_invalid',
    })
  } catch (releaseError) {
    console.warn('[suggestBriefContract] reservation release skipped:', releaseError instanceof Error ? releaseError.message : releaseError)
  }
}
