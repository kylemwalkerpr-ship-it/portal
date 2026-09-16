/**
 * Versioned writing contract. The UI may copy display fields, but the
 * server-owned contract id / version / hash is the source of truth for
 * draft, stream, revision, and ship.
 */

import { createHash } from 'crypto'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import type { SealedBrief } from './sealedBrief'
import { validateSealedBrief } from './sealedBrief'
import { buildOpportunityIdentity, type OpportunityIdentity } from './opportunityIdentity'

/** JSON payload schema/version. Contract versions themselves are per-job and monotonic. */
export const WRITING_CONTRACT_SCHEMA_VERSION = 2
/** Backward-compatible alias for callers that used the original constant as the V2 schema marker. */
export const WRITING_CONTRACT_VERSION = WRITING_CONTRACT_SCHEMA_VERSION

export type ContractEvidenceAuthority =
  | 'authoritative'
  | 'first_party'
  | 'provider_estimate'
  | 'competitor_observation'
  | 'hypothesis'

export type ContractClaimSupport = 'verified' | 'observed' | 'unknown'

export type ContractEvidenceRef = {
  id?: string
  runId?: string
  checkpointId?: string
  sourceKind: string
  sourceUrl?: string
  observedAt: string
  jurisdiction?: string
  authority: ContractEvidenceAuthority
  /** Hash of the persisted substantive observation/excerpt payload, not the URL. */
  contentHash: string
  /** URL/authority identity does not imply factual support. */
  claimSupport: ContractClaimSupport
  verification?: 'verified' | 'pending' | 'unverified' | 'failed'
  confidence?: string
}

export type ContractSourceHealth = {
  source: string
  state: 'ok' | 'empty' | 'unavailable' | 'unconfigured'
  observedAt: string
  runId?: string
  checkpointId?: string
  reason?: string
}

export type ContractOwnership = {
  host: string
  repo: string
  filePath: string
  canonicalUrl: string
}

export type ContractReader = {
  audience: string
  stage?: string
  primaryQuestion: string
}

export type ContractQueryCoverage = {
  requiredShortKeywords: string[]
  requiredLongTailKeywords: string[]
  shortKeywordTerms: KeywordTerm[]
  longTailKeywordTerms: KeywordTerm[]
}

export type ContractWordBudget = {
  minWords: number
  targetWords: number
  maxWords: number
}

export type ContractLinks = {
  sources: string[]
  interlinks: Array<{ label?: string; url: string; placement?: string }>
}

export type ContractMetadata = {
  title: string
  targetSlug: string
  metaDescription?: string
  tone?: string
}

export type WritingContractV2 = {
  schemaVersion: typeof WRITING_CONTRACT_SCHEMA_VERSION
  contractId: string
  /** Immutable sequence for one job/opportunity. New editorial substance = new row/version. */
  contractVersion: number
  contractHash: string
  opportunity: OpportunityIdentity
  host: string
  contentType: string
  primaryKeyword: string
  ownership: ContractOwnership
  reader: ContractReader
  queryCoverage: ContractQueryCoverage
  wordBudget: ContractWordBudget
  links: ContractLinks
  metadata: ContractMetadata
  brief: SealedBrief
  evidenceHash: string
  evidence: ContractEvidenceRef[]
  sourceHealth: ContractSourceHealth[]
  researchGaps: string[]
  researchRunId?: string
  requestedModel?: string
  createdAt: string
}

export type WritingContractValidation = {
  ok: boolean
  issues: string[]
  contract: WritingContractV2 | null
}

export function hashContractPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

export function evidenceHashPayload(input: {
  evidence: ContractEvidenceRef[]
  sourceHealth: ContractSourceHealth[]
  researchGaps: string[]
  researchRunId?: string
}): Record<string, unknown> {
  return {
    researchRunId: input.researchRunId || null,
    evidence: input.evidence,
    sourceHealth: input.sourceHealth,
    researchGaps: input.researchGaps,
  }
}

export function writingContractHashPayload(contract: Pick<
  WritingContractV2,
  | 'schemaVersion'
  | 'contractVersion'
  | 'opportunity'
  | 'host'
  | 'contentType'
  | 'primaryKeyword'
  | 'ownership'
  | 'reader'
  | 'queryCoverage'
  | 'wordBudget'
  | 'links'
  | 'metadata'
  | 'brief'
  | 'evidenceHash'
  | 'evidence'
  | 'sourceHealth'
  | 'researchGaps'
  | 'researchRunId'
  | 'requestedModel'
>): Record<string, unknown> {
  return {
    schemaVersion: contract.schemaVersion,
    contractVersion: contract.contractVersion,
    opportunity: contract.opportunity,
    host: contract.host,
    contentType: contract.contentType,
    primaryKeyword: contract.primaryKeyword,
    ownership: contract.ownership,
    reader: contract.reader,
    queryCoverage: contract.queryCoverage,
    wordBudget: contract.wordBudget,
    links: contract.links,
    metadata: contract.metadata,
    brief: contract.brief,
    evidenceHash: contract.evidenceHash,
    evidence: contract.evidence,
    sourceHealth: contract.sourceHealth,
    researchGaps: contract.researchGaps,
    researchRunId: contract.researchRunId || null,
    requestedModel: contract.requestedModel || null,
  }
}

export function verifyWritingContract(contract: WritingContractV2): WritingContractValidation {
  const issues: string[] = []
  if (contract.schemaVersion !== WRITING_CONTRACT_SCHEMA_VERSION) {
    issues.push(`schemaVersion: expected ${WRITING_CONTRACT_SCHEMA_VERSION}, got ${contract.schemaVersion}`)
  }
  if (!Number.isInteger(contract.contractVersion) || contract.contractVersion < 1) {
    issues.push('contractVersion: must be a positive integer')
  }
  if (!/^wc_[a-f0-9]{20}$/i.test(String(contract.contractId || ''))) issues.push('contractId: malformed')
  if (!String(contract.host || '').trim()) issues.push('host: missing')
  if (!String(contract.contentType || '').trim()) issues.push('contentType: missing')
  if (!String(contract.primaryKeyword || '').trim()) issues.push('primaryKeyword: missing')
  if (!String(contract.evidenceHash || '').trim()) issues.push('evidenceHash: missing')

  if (!contract.ownership || !String(contract.ownership.repo || '').trim()) issues.push('ownership.repo: missing')
  if (!contract.ownership || !String(contract.ownership.filePath || '').trim()) issues.push('ownership.filePath: missing')
  if (!contract.ownership || !String(contract.ownership.canonicalUrl || '').trim()) issues.push('ownership.canonicalUrl: missing')
  if (!contract.reader || !String(contract.reader.primaryQuestion || '').trim()) issues.push('reader.primaryQuestion: missing')
  if (!contract.queryCoverage) issues.push('queryCoverage: missing')
  if (!contract.wordBudget || contract.wordBudget.minWords <= 0 || contract.wordBudget.maxWords < contract.wordBudget.minWords) {
    issues.push('wordBudget: invalid')
  }
  if (!contract.links) issues.push('links: missing')
  if (!contract.metadata || !String(contract.metadata.title || '').trim()) issues.push('metadata.title: missing')
  if (!contract.metadata || !String(contract.metadata.targetSlug || '').trim()) issues.push('metadata.targetSlug: missing')

  for (const [index, item] of (contract.evidence || []).entries()) {
    if (!String(item.contentHash || '').trim()) issues.push(`evidence[${index}]: contentHash missing`)
    if (!['verified', 'observed', 'unknown'].includes(String(item.claimSupport || ''))) {
      issues.push(`evidence[${index}]: claimSupport invalid`)
    }
  }

  issues.push(...validateSealedBrief(contract.brief, {
    primaryKeyword: contract.primaryKeyword,
    contentType: contract.contentType,
  }))

  const recomputedEvidenceHash = hashContractPayload(evidenceHashPayload({
    evidence: contract.evidence || [],
    sourceHealth: contract.sourceHealth || [],
    researchGaps: contract.researchGaps || [],
    researchRunId: contract.researchRunId,
  }))
  if (recomputedEvidenceHash !== contract.evidenceHash) issues.push('evidenceHash: evidence payload mismatch')

  const recomputed = hashContractPayload(writingContractHashPayload(contract))
  if (recomputed !== contract.contractHash) issues.push('contractHash: payload mismatch')

  return { ok: issues.length === 0, issues, contract: issues.length ? null : contract }
}

export function buildWritingContract(input: {
  opportunityTopic: string
  jurisdiction?: string
  audienceStage?: string
  host: string
  contentType: string
  primaryKeyword: string
  ownership: ContractOwnership
  reader: ContractReader
  queryCoverage: ContractQueryCoverage
  wordBudget: ContractWordBudget
  links: ContractLinks
  metadata: ContractMetadata
  brief: SealedBrief
  evidenceHash?: string
  evidence?: ContractEvidenceRef[]
  sourceHealth?: ContractSourceHealth[]
  researchGaps?: string[]
  researchRunId?: string
  requestedModel?: string
  jobId?: string
  contractVersion?: number
  createdAt?: string
}): WritingContractValidation {
  const issues = validateSealedBrief(input.brief, {
    primaryKeyword: input.primaryKeyword,
    contentType: input.contentType,
  })
  if (issues.length) return { ok: false, issues, contract: null }

  const contractVersion = Number(input.contractVersion ?? 1)
  if (!Number.isInteger(contractVersion) || contractVersion < 1) {
    return { ok: false, issues: ['contractVersion: must be a positive integer'], contract: null }
  }

  const opportunity = buildOpportunityIdentity({
    topic: input.opportunityTopic || input.primaryKeyword,
    jurisdiction: input.jurisdiction,
    audienceStage: input.audienceStage,
  })
  const evidence = (input.evidence || []).map((item) => ({ ...item }))
  const sourceHealth = (input.sourceHealth || []).map((item) => ({ ...item }))
  const researchGaps = (input.researchGaps || []).map(String).map((v) => v.trim()).filter(Boolean)
  const evidenceHash = input.evidenceHash || hashContractPayload(evidenceHashPayload({
    researchRunId: input.researchRunId,
    evidence,
    sourceHealth,
    researchGaps,
  }))
  const body = {
    schemaVersion: WRITING_CONTRACT_SCHEMA_VERSION,
    contractVersion,
    opportunity,
    host: input.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    ownership: input.ownership,
    reader: input.reader,
    queryCoverage: input.queryCoverage,
    wordBudget: input.wordBudget,
    links: input.links,
    metadata: input.metadata,
    brief: input.brief,
    evidenceHash,
    evidence,
    sourceHealth,
    researchGaps,
    researchRunId: input.researchRunId || null,
    requestedModel: input.requestedModel || null,
  }
  const contractHash = hashContractPayload(body)
  const contractId = `wc_${createHash('sha256').update(`${input.jobId || 'anon'}:${contractVersion}:${contractHash}`).digest('hex').slice(0, 20)}`
  const contract: WritingContractV2 = {
    schemaVersion: WRITING_CONTRACT_SCHEMA_VERSION,
    contractId,
    contractVersion,
    contractHash,
    opportunity,
    host: input.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    ownership: input.ownership,
    reader: input.reader,
    queryCoverage: input.queryCoverage,
    wordBudget: input.wordBudget,
    links: input.links,
    metadata: input.metadata,
    brief: input.brief,
    evidenceHash,
    evidence,
    sourceHealth,
    researchGaps,
    researchRunId: input.researchRunId,
    requestedModel: input.requestedModel,
    createdAt: input.createdAt || new Date().toISOString(),
  }
  const verified = verifyWritingContract(contract)
  return verified.ok ? verified : { ok: false, issues: verified.issues, contract: null }
}

export function assertSameContract(
  expected: { contractId?: string | null; contractHash?: string | null },
  actual: WritingContractV2,
): boolean {
  if (!expected.contractId || !expected.contractHash) return false
  return expected.contractId === actual.contractId && expected.contractHash === actual.contractHash
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${Array.from(value, (item) => stableStringify(item)).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(',')}}`
}
