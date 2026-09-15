// Public persistence boundary. Legacy/uncontracted jobs retain the byte-preserved
// implementation in persistContentJobCore; strict Content Studio jobs are written
// only through the exact execution owner + attempt + unexpired lease fence.
export * from './persistContentJobCore'

import { createClient } from '@supabase/supabase-js'
import * as core from './persistContentJobCore'
import {
  assertLocalContentStudioExecutionLease,
  currentContentStudioExecution,
} from './contentStudioExecutionContext'
import { meetsShipQuality } from './audit'

const COMPAT_COLUMNS = /event_log|lineage|regeneration_reason|regeneration_mode|column/i

function strictFence(query: any, input: {
  jobId: string
  contractId: string
  contractHash: string
  opportunityId?: string | null
  owner: string
  attempt: number
}) {
  let fenced = query
    .eq('id', input.jobId)
    .eq('contract_id', input.contractId)
    .eq('contract_hash', input.contractHash)
    .eq('execution_owner', input.owner)
    .eq('execution_attempt', input.attempt)
    .gt('execution_lease_expires_at', new Date().toISOString())
  if (input.opportunityId) fenced = fenced.eq('opportunity_id', input.opportunityId)
  return fenced
}

export async function persistPipelineJob(input: core.PipelineJobPersistInput): Promise<string | null> {
  const execution = currentContentStudioExecution()
  if (!execution?.strict) return core.persistPipelineJob(input)

  assertLocalContentStudioExecutionLease()
  const jobId = String(input.existingJobId || '').trim()
  const expectedJobId = String(execution.executionJobId || '').trim()
  const contractId = String(execution.contractId || '').trim()
  const contractHash = String(execution.contractHash || '').trim()
  const owner = String(execution.executionOwner || '').trim()
  const attempt = Number(execution.executionAttempt)
  if (!jobId || jobId !== expectedJobId || !contractId || !contractHash || !owner || !Number.isInteger(attempt)) {
    throw new Error('strict Content Studio persistence is missing its exact job/contract/owner fencing identity')
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const fence = {
    jobId,
    contractId,
    contractHash,
    opportunityId: execution.opportunityId,
    owner,
    attempt,
  }

  // Fence the guard read too: a stale worker must not inspect an unrelated/newer
  // attempt and then use that data to decide a write.
  const prior = await strictFence(
    supabase.from('content_jobs').select('id,content,word_count'),
    fence,
  ).maybeSingle()
  if (prior.error || !prior.data?.id) {
    throw new Error(`strict Content Studio persistence refused stale execution: ${prior.error?.message || 'owner/attempt/lease changed'}`)
  }

  const baseRow = core.mapPipelineJobRow(input)
  const prev = prior.data as { content?: string | null; word_count?: number | null }
  if (core.shouldRefuseThinOverwrite({
    previousContent: prev.content,
    previousWordCount: prev.word_count,
    nextContent: input.content,
    nextWordCount: input.audit.wordCount,
  })) {
    baseRow.content = prev.content
    baseRow.word_count = prev.word_count
    const prevWc = Number(prev.word_count) || 0
    baseRow.error_message = `Refused thin overwrite (${input.audit.wordCount} words) of a ${prevWc}-word draft`
  }

  let updated = await strictFence(
    supabase.from('content_jobs').update(baseRow),
    fence,
  ).select('id').maybeSingle()

  if (updated.error && COMPAT_COLUMNS.test(updated.error.message || '')) {
    const {
      source_job_id: _sourceJobId,
      lineage: _lineage,
      regeneration_reason: _reason,
      regeneration_mode: _mode,
      event_log: _eventLog,
      ...legacyRow
    } = baseRow
    updated = await strictFence(
      supabase.from('content_jobs').update(legacyRow),
      fence,
    ).select('id').maybeSingle()
  }

  if (updated.error || !updated.data?.id) {
    throw new Error(`strict Content Studio persistence lost execution ownership: ${updated.error?.message || 'owner/attempt/lease changed'}`)
  }

  // Strict execution deliberately does not run the legacy broad sibling-closing
  // updates. Those predicates are not execution-owned and a stale worker must
  // never be able to close another row after losing its lease.
  try {
    const { recordJobQualityGate } = await import('@/lib/seoEngine/gate')
    await recordJobQualityGate({
      jobId,
      score: input.audit.score,
      passed: input.plan.blockers.length === 0 && meetsShipQuality(input.audit),
      blockers: (input.audit.blockers || []).map((b) => String(b.code || b.message || '')).filter(Boolean),
      country: input.region || null,
      stage: 'studio_audit',
    })
  } catch { /* telemetry must not turn a fenced write into a false failure */ }

  return jobId
}
