import { createClient } from '@supabase/supabase-js'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import type { WritingContractV2 } from './writingContract'
import {
  loadJobWritingContract,
  loadWritingContract,
  WritingContractMismatchError,
} from './writingContractStore'

export type ContractAwarePipelineInput = {
  existingJobId?: string | null
  contractId?: string | null
  contractHash?: string | null
  contractVersion?: number | null
  evidenceHash?: string | null
  opportunityId?: string | null
  primaryKeyword?: string
  contentType?: string
  thesis?: string
  takeaways?: string[]
  faqQuestions?: string[]
  lede?: string
  h2Outline?: string[]
  sectionPlan?: Array<{ heading: string; intent?: string; format?: string; keywords?: string[] }>
  sources?: string[]
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
}

function normalized(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
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
  const authoritativeSources = contract.evidence
    .filter((item) => item.authority === 'authoritative' && item.sourceUrl)
    .map((item) => String(item.sourceUrl))

  assertClientFieldMatches('primaryKeyword', input.primaryKeyword, contract.primaryKeyword)
  assertClientFieldMatches('contentType', input.contentType, contract.contentType)
  assertClientFieldMatches('thesis', input.thesis, contract.brief.thesis)
  if (input.takeaways?.length) assertClientFieldMatches('takeaways', input.takeaways, contract.brief.takeaways)
  if (input.faqQuestions?.length) assertClientFieldMatches('faqQuestions', input.faqQuestions, contract.brief.faqQuestions)
  assertClientFieldMatches('lede', input.lede, contract.brief.lede)
  if (input.h2Outline?.length) assertClientFieldMatches('h2Outline', input.h2Outline, outline)
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

  return {
    ...input,
    contractId: contract.contractId,
    contractHash: contract.contractHash,
    contractVersion: contract.contractVersion,
    evidenceHash: contract.evidenceHash,
    opportunityId: contract.opportunity.id,
    primaryKeyword: contract.primaryKeyword,
    contentType: contract.contentType,
    thesis: contract.brief.thesis,
    takeaways: [...contract.brief.takeaways],
    faqQuestions: [...contract.brief.faqQuestions],
    lede: contract.brief.lede,
    h2Outline: outline,
    sectionPlan,
    sources: authoritativeSources.length ? authoritativeSources : input.sources,
  } as T
}

export async function hydratePipelineInputFromContract<T extends ContractAwarePipelineInput>(input: T): Promise<T> {
  const jobId = normalized(input.existingJobId) || null
  const contractId = normalized(input.contractId) || null
  const contractHash = normalized(input.contractHash) || null
  if (!jobId && !contractId) return input

  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !key) {
    throw new WritingContractMismatchError('cannot load writing contract: service-role Supabase credentials unavailable')
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

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
    throw new WritingContractMismatchError('writing contract not found for generation request')
  }
  if (contractId && !contractHash) {
    throw new WritingContractMismatchError('contractHash is required when contractId is supplied')
  }
  return applyWritingContractToInput(input, contract)
}
