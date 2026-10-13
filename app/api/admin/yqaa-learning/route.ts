import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { buildYqaaCalibrationState } from '@/lib/yqaaCalibration'
import goldSet from '@/docs/yqaa/companion/gold-set.json'

export const dynamic = 'force-dynamic'

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if ('error' in auth) return fail(auth.error, auth.status)
  const { data: outcomes, error: outcomeError } = await auth.db
    .from('yqaa_negotiation_outcomes').select('source_kind,source_id,state,occurred_at,event_order').order('event_order', { ascending: false }).limit(5000)
  if (outcomeError) return fail('YQAA outcome stream is unavailable. Apply the additive Phase 3 migration first.', 503)
  const { data: decisions, error: decisionError } = await auth.db
    .from('yqaa_decision_records').select('id,record_version,policy_version,rubric_version,channel,posture,negotiation_action,escalated,reason_codes,created_at').order('created_at', { ascending: false }).limit(500)
  if (decisionError) return fail('YQAA decision records are unavailable.', 503)
  const { data: reviews, error: reviewError } = await auth.db
    .from('yqaa_review_submissions').select('decision_record_id,reviewer_profile_id,human_safe,is_critical,reviewer_qualification_claim,provenance_ref,qualification_verified_at').limit(5000)
  if (reviewError) return fail('YQAA review intake is unavailable.', 503)

  const state = buildYqaaCalibrationState(goldSet.cases, outcomes || [], reviews || [])
  const exportRequested = new URL(request.url).searchParams.get('export') === 'review'
  const safeCases = (decisions || []).map((row: any) => ({
    decisionRecordId: row.id, channel: row.channel, posture: row.posture,
    negotiationAction: row.negotiation_action, escalated: row.escalated,
    reasonCodes: row.reason_codes, policyVersion: row.policy_version,
    rubricVersion: row.rubric_version, createdAt: row.created_at,
  }))
  return ok({
    ...state,
    generatedAt: new Date().toISOString(),
    outcomeSampleLimit: 5000,
    decisionRecordCount: decisions?.length || 0,
    recentCases: safeCases,
    reviewExport: exportRequested ? {
      schemaVersion: 'yqaa-review-intake-v1',
      labelingStatus: goldSet.labelingStatus,
      cases: safeCases.map((row: any) => ({
        ...row,
        submission: {
          humanSafe: null,
          reviewerQualificationClaim: '',
          provenanceRef: '',
          criticalCasesRequireIndependentSecondAdmin: true,
        },
      })),
      restrictions: ['No conversation text, contact data, or transcript URL is exported.', 'Qualification claims are not verified by this intake.', 'Submitted labels do not enter calibration metrics.'],
    } : undefined,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if ('error' in auth) return fail(auth.error, auth.status)
  let body: any
  try { body = await request.json() } catch { return fail('Invalid JSON body.', 400) }
  const decisionRecordId = String(body?.decisionRecordId || '')
  const humanSafe = body?.humanSafe
  const qualification = String(body?.reviewerQualificationClaim || '').trim()
  const provenanceRef = String(body?.provenanceRef || '').trim()
  const noPhoneLikeValue = !/(?:\+?\d[\d ().-]{7,}\d)/.test(`${qualification} ${provenanceRef}`)
  if (!/^[0-9a-f-]{36}$/i.test(decisionRecordId) || typeof humanSafe !== 'boolean' || !/^[A-Za-z ,()./-]{3,240}$/.test(qualification) || !SAFE_REF.test(provenanceRef) || !noPhoneLikeValue) {
    return fail('Provide a decision record ID, boolean label, short qualification claim, and opaque provenance reference. Text, contact data, and URLs are not accepted.', 400)
  }
  const { data: record, error: recordError } = await auth.db.from('yqaa_decision_records')
    .select('id,posture,reason_codes').eq('id', decisionRecordId).maybeSingle()
  if (recordError || !record) return fail('Decision record not found.', 404)
  const reasonCodes = Array.isArray(record.reason_codes) ? record.reason_codes : []
  const isCritical = record.posture === 'ESCALATE_PROVIDER' || record.posture === 'HANDOFF_SUPPORT' || reasonCodes.some((reason: string) => /high.?stakes|legal_conclusion|thin_evidence/i.test(reason))
  const { error } = await auth.db.from('yqaa_review_submissions').insert({
    decision_record_id: decisionRecordId,
    reviewer_profile_id: auth.profileId,
    human_safe: humanSafe,
    is_critical: isCritical,
    reviewer_qualification_claim: qualification,
    provenance_ref: provenanceRef,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) return fail('This admin has already submitted a review for that case.', 409)
    return fail('Review intake could not be saved. Apply the additive Phase 3 migration first.', 503)
  }
  return ok({ accepted: true, isCritical, qualificationVerified: false, calibrationEligible: false,
    message: isCritical ? 'Review saved. A second distinct admin must independently review this critical case.' : 'Review saved to the unverified human-review queue.' })
}
