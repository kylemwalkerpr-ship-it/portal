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

export function buildWritingContract(input: {
  opportunityTopic: string
  jurisdiction?: string
  audienceStage?: string
  host: string
  contentType: string
  primaryKeyword: string
  brief: SealedBrief
  evidenceHash?: string
  requestedModel?: string
  jobId?: string
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
  const createdAt = new Date().toISOString()
  const body = {
    contractVersion: WRITING_CONTRACT_VERSION,
    opportunity,
    host: input.host,
    contentType: input.contentType,
    primaryKeyword: input.primaryKeyword,
    brief: input.brief,
    evidenceHash: input.evidenceHash || 'evidence:none',
    requestedModel: input.requestedModel || null,
  }
  const contractHash = hashContractPayload(body)
  const contractId = `wc_${createHash('sha256').update(`${input.jobId || 'anon'}:${contractHash}`).digest('hex').slice(0, 20)}`
  return {
    ok: true,
    issues: [],
    contract: {
      contractId,
      contractVersion: WRITING_CONTRACT_VERSION,
      contractHash,
      opportunity,
      host: input.host,
      contentType: input.contentType,
      primaryKeyword: input.primaryKeyword,
      brief: input.brief,
      evidenceHash: body.evidenceHash,
      requestedModel: input.requestedModel,
      createdAt,
    },
  }
}

export function assertSameContract(expected: { contractId?: string | null; contractHash?: string | null }, actual: WritingContractV2): boolean {
  if (!expected.contractId || !expected.contractHash) return false
  return expected.contractId === actual.contractId && expected.contractHash === actual.contractHash
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}
