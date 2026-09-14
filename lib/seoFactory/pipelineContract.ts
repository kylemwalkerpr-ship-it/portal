import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import { createSupabaseAdminClient } from '@/lib/supabase'
import type { WritingContractV2 } from './writingContract'
import {
  loadJobWritingContract,
  loadWritingContract,
  WritingContractMismatchError,
} from './writingContractStore'

export type ContractAwarePipelineInput = {
  writingContractRequired?: boolean
  existingJobId?: string | null
  contractId?: string | null
  contractHash?: string | null
  contractVersion?: number | null
  evidenceHash?: string | null
  opportunityId?: string | null
  topic?: string
  title?: string
  primaryKeyword?: string
  region?: string
  contentType?: string
  tone?: string
  audience?: string
  thesis?: string
  takeaways?: string[]
  faqQuestions?: string[]
  lede?: string
  h2Outline?: string[]
  sectionPlan?: Array<{ heading: string; intent?: string; format?: string; keywords?: string[] }>
  sources?: string[]
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }> | null
  minWords?: number
  maxWords?: number
  targetSlug?: string
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
}

function normalized(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function stable(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stable(obj[key])}`).join(',')}}`
}

function equalStringArray(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  return JSON.stringify(a.map(normalized)) === JSON.stringify(b.map(normalized))
}

function assertClientFieldMatches(
  label: string,
  supplied: unknown,
  canonical: unknown,
): void {
  if (supplied == null || supplied === '') return
  const same = Array.isArray(canonical)
    ? equalStringArray(supplied, canonical)
    : canonical && typeof canonical === 'object'
      ? stable(supplied) === stable(canonical)
      : normalized(supplied) === normalized(canonical)
  if (!same) {
    throw new WritingContractMismatchError(`client ${label} conflicts with immutable writing contract`)
  }
}

export function applyWritingContractToInput<T extends ContractAwarePipelineInput>(
  input: T,
  contract: WritingContractV2,
): T {
  const outline = contract.brief.outline.map((chapter) => chapter.heading)
  const sectionPlan = contract.brief.outline.map((chapter) => ({
    heading: chapter.heading,
    intent: chapter.purpose,
    format: chapter.format,
    keywords: chapter.coverTopics,
  }))
  const sources = contract.links.sources.map(String)
  const interlinks = contract.links.interlinks.map((link) => ({
    label: link.label,
    url: link.url,
  }))

  assertClientFieldMatches('primaryKeyword', input.primaryKeyword, contract.primaryKeyword)
  assertClientFieldMatches('contentType', input.contentType, contract.contentType)
  assertClientFieldMatches('title', input.title, contract.metadata.title)
  assertClientFieldMatches('audience', input.audience, contract.reader.audience)
  assertClientFieldMatches('thesis', input.thesis, contract.brief.thesis)
  if (input.takeaways?.length) assertClientFieldMatches('takeaways', input.takeaways, contract.brief.takeaways)
  if (input.faqQuestions?.length) assertClientFieldMatches('faqQuestions', input.faqQuestions, contract.brief.faqQuestions)
  assertClientFieldMatches('lede', input.lede, contract.brief.lede)
  if (input.h2Outline?.length) assertClientFieldMatches('h2Outline', input.h2Outline, outline)
  if (input.sources?.length) assertClientFieldMatches('sources', input.sources, sources)
  if (input.requiredShortKeywords?.length) {
    assertClientFieldMatches('requiredShortKeywords', input.requiredShortKeywords, contract.queryCoverage.requiredShortKeywords)
  }
  if (input.requiredLongTailKeywords?.length) {
    assertClientFieldMatches('requiredLongTailKeywords', input.requiredLongTailKeywords, contract.queryCoverage.requiredLongTailKeywords)
  }
  if (input.shortKeywordTerms?.length) assertClientFieldMatches('shortKeywordTerms', input.shortKeywordTerms, contract.queryCoverage.shortKeywordTerms)
  if (input.longTailKeywordTerms?.length) assertClientFieldMatches('longTailKeywordTerms', input.longTailKeywordTerms, contract.queryCoverage.longTailKeywordTerms)
  if (input.minWords != null) assertClientFieldMatches('minWords', input.minWords, contract.wordBudget.minWords)
  if (input.maxWords != null) assertClientFieldMatches('maxWords', input.maxWords, contract.wordBudget.maxWords)
  assertClientFieldMatches('targetSlug', input.targetSlug, contract.metadata.targetSlug)

  if (input.contractId && input.contractId !== contract.contractId) {
    throw new WritingContractMismatchError('client contractId conflicts with stored writing contract')
  }
  if (input.contractHash && input.contractHash !== contract.contractHash) {
    throw new WritingContractMismatchError('client contractHash conflicts with stored writing contract')
  }
  if (input.contractVersion != null && Number(input.contractVersion) !== contract.contractVersion) {
    throw new WritingContractMismatchError('client contractVersion conflicts with stored writing contract')
  }
  if (input.evidenceHash && input.evidenceHash !== contract.evidenceHash) {
    throw new WritingContractMismatchError('client evidenceHash conflicts with stored writing contract')
  }
  if (input.opportunityId && input.opportunityId !== contract.opportunity.id) {
    throw new WritingContractMismatchError('client opportunityId conflicts with stored writing contract')
  }

  return {
    ...input,
    writingContractRequired: true,
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    contractVersion: contract.contractVersion,
    evidenceHash: contract.evidenceHash,
    opportunityId: contract.opportunity.id,
    topic: input.topic || contract.reader.primaryQuestion || contract.primaryKeyword,
    title: contract.metadata.title,
    primaryKeyword: contract.primaryKeyword,
    region: contract.opportunity.jurisdiction || input.region,
    contentType: contract.contentType,
    tone: contract.metadata.tone || input.tone,
    audience: contract.reader.audience,
    thesis: contract.brief.thesis,
    takeaways: [...contract.brief.takeaways],
    faqQuestions: [...contract.brief.faqQuestions],
    lede: contract.brief.lede,
    h2Outline: outline,
    sectionPlan,
    sources,
    interlinks,
    minWords: contract.wordBudget.minWords,
    maxWords: contract.wordBudget.maxWords,
    targetSlug: contract.metadata.targetSlug,
    requiredShortKeywords: [...contract.queryCoverage.requiredShortKeywords],
    requiredLongTailKeywords: [...contract.queryCoverage.requiredLongTailKeywords],
    shortKeywordTerms: contract.queryCoverage.shortKeywordTerms.map((term) => ({ ...term })),
    longTailKeywordTerms: contract.queryCoverage.longTailKeywordTerms.map((term) => ({ ...term })),
  } as T
}

export async function resolvePipelineWritingContract<T extends ContractAwarePipelineInput>(input: T): Promise<{
  input: T
  contract: WritingContractV2 | null
}> {
  const jobId = normalized(input.existingJobId) || null
  const contractId = normalized(input.contractId) || null
  const contractHash = normalized(input.contractHash) || null
  const required = input.writingContractRequired === true || Boolean(contractId)

  if (!jobId && !contractId) {
    if (required) throw new WritingContractMismatchError('writing contract identity is required for this generation request')
    return { input, contract: null }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    if (required) throw new WritingContractMismatchError('cannot load writing contract: Supabase URL unavailable')
    return { input, contract: null }
  }
  const db = createSupabaseAdminClient()

  const contract = contractId
    ? await loadWritingContract(db, {
        contractId,
        contractHash: contractHash || undefined,
        jobId: jobId || undefined,
      })
    : jobId
      ? await loadJobWritingContract(db, jobId)
      : null

  if (!contract) {
    if (required) throw new WritingContractMismatchError('writing contract not found for generation request')
    return { input, contract: null }
  }
  if (contractId && !contractHash) {
    throw new WritingContractMismatchError('contractHash is required when contractId is supplied')
  }
  return { input: applyWritingContractToInput(input, contract), contract }
}

export async function hydratePipelineInputFromContract<T extends ContractAwarePipelineInput>(input: T): Promise<T> {
  return (await resolvePipelineWritingContract(input)).input
}
