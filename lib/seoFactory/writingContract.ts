/**
 * Versioned writing contract. The UI may copy display fields, but the
 * server-owned contract id / version / hash is the source of truth for
 * draft, stream, revision, and ship.
 */

import { createHash } from 'crypto'
import type { SealedBrief } from './sealedBrief'
import { validateSealedBrief } from './sealedBrief'
import { buildOpportunityIdentity, type OpportunityIdentity } from './opportunityIdentity'

export const WRITING_CONTRACT_VERSION = 2

export type ContractEvidenceAuthority =
  | 'authoritative'
  | 'first_party'
  | 'provider_estimate'
  | 'competitor_observation'
  | 'hypothesis'

export type ContractEvidenceRef = {
  id?: string
  runId?: string
  checkpointId?: string
  sourceKind: string
  sourceUrl?: string
  observedAt: string
  jurisdiction?: string
  authority: ContractEvidenceAuthority
}

export type ContractSourceHealth = {
  source: string
  state: 'ok' | 'empty' | 'unavailable' | 'unconfigured'
  observedAt: string
  runId?: string
  checkpointId?: string
  reason?: string
}

export type WritingContractV2 = {
  contractId: string
  contractVersion: number
  contractHash: string
  opportunity: OpportunityIdentity
  host: string
  contentType: string
  primaryKeyword: string
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

export function writingContractHashPayload(contract: Pick<
  WritingContractV2,
  | 'contractVersion'
  | 'opportunity'
  | 'host'
  | 'contentType'
  | 'primaryKeyword'
  | 'brief'
  | 'evidenceHash'
  | 'evidence'
  | 'sourceHealth'
  | 'researchGaps'
  | 'researchRunId'
  | 'requestedModel'
>): Record<string, unknown> {
  return {
    contractVersion: contract.contractVersion,
    opportunity: contract.opportunity,
    host: contract.host,
    contentType: contract.contentType,
    primaryKeyword: contract.primaryKeyword,
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
  if (contract.contractVersion !== WRITING_CONTRACT_VERSION) {
    issues.push(`contractVersion: expected ${WRITING_CONTRACT_VERSION}, got ${contract.contractVersion}`)
  }
  if (!/^wc_[a-f0-9]{20}$/i.test(String(contract.contractId || ''))) {
    issues.push('contractId: malformed')
  }
  if (!String(contract.host || '').trim()) issues.push('host: missing')
  if (!String(contract.contentType || '').trim()) issues.push('contentType: missing')
  if (!String(contract.primaryKeyword || '').trim()) issues.push('primaryKeyword: missing')
  if (!String(contract.evidenceHash || '').trim()) issues.push('evidenceHash: missing')

  issues.push(...validateSealedBrief(contract.brief, {
    primaryKeyword: contract.primaryKeyword,
    contentType: contract.contentType,
  }))

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
  brief: SealedBrief
  evidenceHash?: string
  evidence?: ContractEvidenceRef[]
  sourceHealth?: ContractSourceHealth[]
  researchGaps?: string[]
  researchRunId?: string
  requestedModel?: string
  jobId?: string
  createdAt?: string
}): WritingContractValidation {
  const issues = validateSealedBrief(input.brief, {
    primaryKeyword: input.primaryKeyword,
    contentType: input.contentType,
  })
  if (issues.length) return { ok: false, issues, contract: null }

  const opportunity = buildOpportunityIdentity({
    topic: input.opportunityTopic || input.primaryKeyword,
    jurisdiction: input.jurisdiction,
    audienceStage: input.audienceStage,
  })
  const evidence = (input.evidence || []).map((item) => ({ ...item }))
  const sourceHealth = (input.sourceHealth || []).map((item) => ({ ...item }))
  const researchGaps = (input.researchGaps || []).map(String).map((v) => v.trim()).filter(Boolean)
  const evidenceHash = input.evidenceHash || hashContractPayload({
    researchRunId: input.researchRunId || null,
    evidence,
    sourceHealth,
    researchGaps,
  })
  const body = {
    contractVersion: WRITING_CONTRACT_VERSION,
    opportunity,
    host: input.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    brief: input.brief,
    evidenceHash,
    evidence,
    sourceHealth,
    researchGaps,
    researchRunId: input.researchRunId || null,
    requestedModel: input.requestedModel || null,
  }
  const contractHash = hashContractPayload(body)
  const contractId = `wc_${createHash('sha256').update(`${input.jobId || 'anon'}:${contractHash}`).digest('hex').slice(0, 20)}`
  const contract: WritingContractV2 = {
    contractId,
    contractVersion: WRITING_CONTRACT_VERSION,
    contractHash,
    opportunity,
    host: input.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    brief: input.brief,
    evidenceHash,
    evidence,
    sourceHealth,
    researchGaps,
    researchRunId: input.researchRunId,
    requestedModel: input.requestedModel,
    createdAt: input.createdAt || new Date().toISOString(),
  }
  return { ok: true, issues: [], contract }
}

export function assertSameContract(
  expected: { contractId?: string | null; contractHash?: string | null },
  actual: WritingContractV2,
): boolean {
  if (!expected.contractId || !expected.contractHash) return false
  return expected.contractId === actual.contractId && expected.contractHash === actual.contractHash
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}
