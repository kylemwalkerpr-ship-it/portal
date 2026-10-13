import type { CompanionChannel, CompanionDecision } from '@/lib/yqaaCompanionDecision'

export const YQAA_DECISION_RECORD_VERSION = 1
export const YQAA_POLICY_VERSION = 'full-yqaa-policy-v1'
export const YQAA_RUBRIC_VERSION = 'full-yqaa-rubric-v1-shadow'

export type YqaaDecisionRecordInput = {
  channel: CompanionChannel
  interactionKey: string
  decision: Pick<CompanionDecision, 'posture' | 'negotiationAction' | 'escalate' | 'reasons'>
  evidenceIds?: string[]
  providerKey?: string | null
  categoryKey?: string | null
  shadowRubric?: string
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A persistence shape that cannot contain user prose, contact details, or evidence excerpts. */
export async function toYqaaDecisionRecord(input: YqaaDecisionRecordInput) {
  const sourceEvidenceIds = [...new Set((input.evidenceIds || [])
    .filter((id) => typeof id === 'string' && /^[a-zA-Z0-9:_./-]{1,180}$/.test(id) && !/^https?:/i.test(id)))].slice(0, 12)
  const evidenceIds = await Promise.all(sourceEvidenceIds.map(sha256))
  return {
    record_version: YQAA_DECISION_RECORD_VERSION,
    policy_version: YQAA_POLICY_VERSION,
    rubric_version: YQAA_RUBRIC_VERSION,
    channel: input.channel,
    interaction_hash: await sha256(input.interactionKey),
    provider_hash: input.providerKey ? await sha256(input.providerKey) : null,
    category_hash: input.categoryKey && /^[a-zA-Z0-9_-]{1,100}$/.test(input.categoryKey)
      ? await sha256(input.categoryKey.toLowerCase()) : null,
    posture: input.decision.posture,
    negotiation_action: input.decision.negotiationAction,
    escalated: input.decision.escalate,
    reason_codes: [...new Set(input.decision.reasons.map((reason) => reason.slice(0, 80)))].slice(0, 16),
    evidence_ids: evidenceIds,
    shadow_rubric: input.shadowRubric?.slice(0, 80) || null,
  }
}

/** Best effort only: logging failure must never block or alter a user response. */
export async function persistYqaaDecisionRecord(dbOrFactory: any, input: YqaaDecisionRecordInput): Promise<void> {
  try {
    const db = typeof dbOrFactory === 'function' ? dbOrFactory() : dbOrFactory
    const record = await toYqaaDecisionRecord(input)
    let insert = db.from('yqaa_decision_records').insert(record)
    if (typeof insert.abortSignal === 'function') insert = insert.abortSignal(AbortSignal.timeout(800))
    const { error } = await insert
    if (error) console.warn('[yqaa-decision-record] insert failed', String(error.message || 'database error').slice(0, 120))
  } catch (error) {
    console.warn('[yqaa-decision-record] persistence unavailable', error instanceof Error ? error.message.slice(0, 120) : 'unknown')
  }
}
