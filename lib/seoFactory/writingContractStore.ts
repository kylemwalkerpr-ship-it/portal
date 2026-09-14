import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeJobContentType } from './jobContentType'
import {
  assertSameContract,
  verifyWritingContract,
  type WritingContractV2,
} from './writingContract'
import { verifyContractEvidenceRows } from './researchEvidenceStore'
import {
  buildOpportunityIdentity,
  type OpportunityAction,
  type OpportunityIdentity,
} from './opportunityIdentity'

export const ACTIVE_OPPORTUNITY_STATUSES = [
  'pending',
  'drafting',
  'processing',
  'publishing',
  'pr_created',
] as const

export type WritingContractDb = Pick<SupabaseClient, 'from'>

export class WritingContractMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WritingContractMismatchError'
  }
}

export async function nextWritingContractVersion(
  db: WritingContractDb,
  jobId: string,
): Promise<number> {
  const result = await db
    .from('content_studio_writing_contracts')
    .select('contract_version')
    .eq('job_id', jobId)
    .order('contract_version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw new Error(`writing contract version lookup failed: ${result.error.message}`)
  const latest = Number(result.data?.contract_version || 0)
  return Number.isInteger(latest) && latest > 0 ? latest + 1 : 1
}

export async function persistWritingContract(
  db: WritingContractDb,
  contract: WritingContractV2,
  jobId: string | null,
): Promise<WritingContractV2> {
  const verified = verifyWritingContract(contract)
  if (!verified.ok) {
    throw new WritingContractMismatchError(`refusing invalid writing contract: ${verified.issues.join('; ')}`)
  }

  const row = {
    contract_id: contract.contractId,
    job_id: jobId || null,
    contract_version: contract.contractVersion,
    contract_hash: contract.contractHash,
    opportunity_id: contract.opportunity.id,
    payload: contract,
    created_at: contract.createdAt,
  }
  const inserted = await db
    .from('content_studio_writing_contracts')
    .insert(row)
    .select('contract_id,job_id,contract_version,contract_hash,payload,created_at')
    .single()

  if (!inserted.error) return contract

  // Idempotent retry is allowed only when the immutable stored row is exactly
  // the same contract. A collision with different payload/hash is corruption.
  if (inserted.error.code === '23505' || /duplicate|unique/i.test(inserted.error.message || '')) {
    const existing = await loadWritingContract(db, {
      contractId: contract.contractId,
      contractHash: contract.contractHash,
      jobId: jobId || undefined,
    })
    if (existing && assertSameContract(contract, existing)) return existing
  }
  throw new Error(`writing contract insert failed: ${inserted.error.message}`)
}

export async function loadWritingContract(
  db: WritingContractDb,
  expected: {
    contractId: string
    contractHash?: string | null
    jobId?: string | null
  },
): Promise<WritingContractV2 | null> {
  const contractId = String(expected.contractId || '').trim()
  if (!contractId) return null

  let query = db
    .from('content_studio_writing_contracts')
    .select('contract_id,job_id,contract_version,contract_hash,payload,created_at')
    .eq('contract_id', contractId)
  if (expected.jobId) query = query.eq('job_id', expected.jobId)
  const result = await query.maybeSingle()
  if (result.error) throw new Error(`writing contract load failed: ${result.error.message}`)
  if (!result.data) return null

  const row = result.data as Record<string, unknown>
  const payload = row.payload as WritingContractV2 | null
  if (!payload || typeof payload !== 'object') {
    throw new WritingContractMismatchError('writing contract payload missing')
  }
  if (String(row.contract_id || '') !== payload.contractId) {
    throw new WritingContractMismatchError('writing contract id differs from stored payload')
  }
  if (Number(row.contract_version) !== payload.contractVersion) {
    throw new WritingContractMismatchError('writing contract version differs from stored payload')
  }
  if (String(row.contract_hash || '') !== payload.contractHash) {
    throw new WritingContractMismatchError('writing contract hash differs from stored payload')
  }
  if (expected.contractHash && expected.contractHash !== payload.contractHash) {
    throw new WritingContractMismatchError('client/job contract hash does not match immutable contract')
  }
  const verified = verifyWritingContract(payload)
  if (!verified.ok || !verified.contract) {
    throw new WritingContractMismatchError(`stored writing contract failed verification: ${verified.issues.join('; ')}`)
  }
  try {
    await verifyContractEvidenceRows(db, verified.contract.evidence || [])
  } catch (error) {
    throw new WritingContractMismatchError(
      `stored writing contract evidence failed verification: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return verified.contract
}

export async function attachWritingContractToJob(
  db: WritingContractDb,
  jobId: string,
  contract: WritingContractV2,
): Promise<void> {
  const verified = verifyWritingContract(contract)
  if (!verified.ok) {
    throw new WritingContractMismatchError(`cannot attach invalid writing contract: ${verified.issues.join('; ')}`)
  }
  const result = await db
    .from('content_jobs')
    .update({
      opportunity_id: contract.opportunity.id,
      contract_id: contract.contractId,
      contract_version: contract.contractVersion,
      contract_hash: contract.contractHash,
      evidence_hash: contract.evidenceHash,
      requested_model: contract.requestedModel || null,
      execution_stage: 'brief_ready',
    })
    .eq('id', jobId)
    .eq('opportunity_id', contract.opportunity.id)
  if (result.error) throw new Error(`failed to attach writing contract to job: ${result.error.message}`)
}

export async function loadJobWritingContract(
  db: WritingContractDb,
  jobId: string,
): Promise<WritingContractV2 | null> {
  const jobResult = await db
    .from('content_jobs')
    .select('id,contract_id,contract_hash')
    .eq('id', jobId)
    .maybeSingle()
  if (jobResult.error) throw new Error(`job contract identity load failed: ${jobResult.error.message}`)
  if (!jobResult.data?.contract_id) return null
  return loadWritingContract(db, {
    contractId: String(jobResult.data.contract_id),
    contractHash: String(jobResult.data.contract_hash || ''),
    jobId,
  })
}

export type OpportunityReservationInput = {
  topic: string
  primaryKeyword: string
  title?: string
  userId?: string
  contentType: string
  tone?: string
  region: string
  targetRepo: string
  ownerHost?: string | null
  canonicalUrl?: string | null
  audienceStage?: string
  jurisdiction?: string
  action?: OpportunityAction
}

export type OpportunityReservation = {
  jobId: string
  identity: OpportunityIdentity
  reused: boolean
  /** Only the execution that inserted the row may release the pre-contract reservation. */
  ownsReservation: boolean
}

export async function reserveOpportunityJob(
  db: WritingContractDb,
  input: OpportunityReservationInput,
): Promise<OpportunityReservation> {
  const identity = buildOpportunityIdentity({
    topic: input.topic || input.primaryKeyword,
    jurisdiction: input.jurisdiction || input.region,
    audienceStage: input.audienceStage,
    action: input.action,
  })
  const row = {
    user_id: input.userId || 'admin',
    title: input.title || input.topic || input.primaryKeyword,
    topic: input.topic || input.primaryKeyword,
    content_type: normalizeJobContentType(input.contentType),
    tone: input.tone || 'educational',
    region: input.region,
    target_repo: input.targetRepo,
    owner_host: input.ownerHost || null,
    canonical_url: input.canonicalUrl || null,
    primary_keyword: input.primaryKeyword,
    opportunity_id: identity.id,
    status: 'pending',
    execution_stage: 'researching',
  }

  const inserted = await db.from('content_jobs').insert(row).select('id').single()
  if (!inserted.error && inserted.data?.id) {
    return { jobId: String(inserted.data.id), identity, reused: false, ownsReservation: true }
  }

  if (inserted.error && (inserted.error.code === '23505' || /duplicate|unique/i.test(inserted.error.message || ''))) {
    const existing = await db
      .from('content_jobs')
      .select('id')
      .eq('opportunity_id', identity.id)
      .in('status', [...ACTIVE_OPPORTUNITY_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing.error) throw new Error(`opportunity reservation lookup failed: ${existing.error.message}`)
    if (existing.data?.id) {
      return { jobId: String(existing.data.id), identity, reused: true, ownsReservation: false }
    }
  }

  throw new Error(`opportunity reservation failed: ${inserted.error?.message || 'no job id returned'}`)
}

export async function releaseOpportunityReservation(
  db: WritingContractDb,
  input: {
    jobId: string
    reason: string
    opportunityId: string
    ownsReservation: boolean
    contractId?: string | null
    contractHash?: string | null
    expectedStage?: string | null
    executionStage?: 'needs_research' | 'brief_invalid' | 'revision_required' | 'verification_failed'
  },
): Promise<boolean> {
  // A duplicate contender discovered the active row but never owned it.
  if (!input.ownsReservation) return false

  let query = db
    .from('content_jobs')
    .update({
      status: 'failed',
      execution_stage: input.executionStage || 'brief_invalid',
      error_message: input.reason.slice(0, 1000),
    })
    .eq('id', input.jobId)
    .eq('opportunity_id', input.opportunityId)
    .in('status', [...ACTIVE_OPPORTUNITY_STATUSES])

  if (input.contractId) query = query.eq('contract_id', input.contractId)
  else query = query.is('contract_id', null)
  if (input.contractHash) query = query.eq('contract_hash', input.contractHash)
  if (input.expectedStage) query = query.eq('execution_stage', input.expectedStage)

  const result = await query.select('id').maybeSingle()
  if (result.error) throw new Error(`failed to release opportunity reservation: ${result.error.message}`)
  return Boolean(result.data?.id)
}
