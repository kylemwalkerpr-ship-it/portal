import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { computeAttorneyStrength } from '@/lib/attorneyProfileStrength'
import { computeConsultantStrength } from '@/lib/consultantProfileStrength'
import type { ComplianceItem, ComplianceSnapshot } from '@/lib/complianceItems'

// Pulls the seller's compliance state from the real source tables —
// no inference, no fabricated values. The AI guidance endpoint
// (/api/compliance/guide) consumes this same shape so the assistant
// can only explain items that actually exist.
export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) {
    return fail('Compliance status is only available to attorneys and consultants.', 403)
  }

  const role = auth.role as 'attorney' | 'consultant'
  const db = auth.db

  const { data: profile } = await db
    .from('profiles')
    .select('email, email_verified_at')
    .eq('id', auth.profileId)
    .single()

  // Look up the most recent application row to surface approval status.
  const appTable = role === 'attorney' ? 'attorney_applications' : 'consultant_applications'
  const { data: appRow } = await db
    .from(appTable)
    .select('status, credential_type, bar_number, malpractice_insurance, decided_at')
    .eq('profile_id', auth.profileId)
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  // Provider table for accepting-clients toggle and jurisdictions.
  const providerTable = role === 'attorney' ? 'attorneys' : 'consultants'
  const { data: providerRow } = await db
    .from(providerTable)
    .select('jurisdictions, available')
    .eq('profile_id', auth.profileId)
    .maybeSingle()

  const strength = role === 'attorney'
    ? await computeAttorneyStrength(db, auth.profileId)
    : await computeConsultantStrength(db, auth.profileId)

  // Compute each item's status from real columns.
  const emailVerified = !!profile?.email_verified_at
  const appApproved = (appRow?.status || '') === 'approved'
  const credentialFilled = !!(appRow?.credential_type && String(appRow.credential_type).trim())
  const barFilled = !!(appRow?.bar_number && String(appRow.bar_number).trim())
  const malpracticeFilled = !!(appRow?.malpractice_insurance && String(appRow.malpractice_insurance).trim())
  const jurisdictionsFilled = !!(providerRow?.jurisdictions && String(providerRow.jurisdictions).trim())
  const acceptingClients = providerRow?.available !== false

  const credentialLabel = role === 'attorney'
    ? { label: 'Credential type', detail: 'Attorney (J.D./LL.M.) or licensed legal representative.', fixLabel: 'Submit on application' }
    : { label: 'Credential type', detail: 'Consultant body — ICCRC, OISC, IMM, etc.', fixLabel: 'Submit on application' }
  const idLabel = role === 'attorney'
    ? { label: 'Bar / roll number', detail: 'Issued by the bar association you\'re admitted to.', fixLabel: 'Add to application' }
    : { label: 'Membership / registration number', detail: 'Issued by your regulatory body (e.g. CICC R-number).', fixLabel: 'Add to application' }

  const items: ComplianceItem[] = [
    {
      id: 'email',
      label: 'Email verified',
      status: emailVerified ? 'ok' : 'missing',
      detail: emailVerified ? (profile?.email || '') : 'Click the link we sent when you signed up.',
      actionHref: emailVerified ? null : '/dashboard',
      actionLabel: emailVerified ? null : 'Resend',
    },
    {
      id: 'application',
      label: 'Application approved',
      status: appApproved ? 'ok' : appRow ? 'pending' : 'missing',
      detail: appApproved
        ? `Approved ${appRow?.decided_at ? new Date(appRow.decided_at).toLocaleDateString() : ''}`.trim()
        : appRow ? 'Pending admin review' : 'No application on file',
      actionHref: appApproved || appRow ? null : `/dashboard/${role}/intake`,
      actionLabel: appApproved || appRow ? null : 'Start application',
    },
    {
      id: 'credential_type',
      label: credentialLabel.label,
      status: credentialFilled ? 'ok' : 'missing',
      detail: credentialFilled ? String(appRow!.credential_type) : 'Not specified on application',
      actionHref: credentialFilled ? null : `/dashboard/${role}/intake`,
      actionLabel: credentialFilled ? null : credentialLabel.fixLabel,
    },
    {
      id: 'bar_number',
      label: idLabel.label,
      status: barFilled ? 'ok' : 'missing',
      detail: barFilled ? `On file (${String(appRow!.bar_number).slice(0, 3)}…)` : 'Add on next application revision',
      actionHref: barFilled ? null : `/dashboard/${role}/intake`,
      actionLabel: barFilled ? null : idLabel.fixLabel,
    },
    {
      id: 'malpractice',
      label: 'Malpractice insurance',
      status: malpracticeFilled ? 'ok' : 'missing',
      detail: malpracticeFilled ? 'Disclosed on application' : 'Not disclosed',
      actionHref: malpracticeFilled ? null : `/dashboard/${role}/intake`,
      actionLabel: malpracticeFilled ? null : 'Disclose',
    },
    {
      id: 'jurisdictions',
      label: 'Jurisdictions',
      status: jurisdictionsFilled ? 'ok' : 'missing',
      detail: jurisdictionsFilled ? String(providerRow!.jurisdictions) : 'Add in My Profile',
      actionHref: jurisdictionsFilled ? null : '/dashboard/profile',
      actionLabel: jurisdictionsFilled ? null : 'Add jurisdictions',
    },
    {
      id: 'payout',
      label: 'Payout setup',
      status: 'ok',
      detail: 'Manual payouts via admin',
      actionHref: null,
      actionLabel: null,
    },
    {
      id: 'accepting',
      label: 'Accepting new clients',
      status: acceptingClients ? 'ok' : 'paused',
      detail: acceptingClients ? 'Profile visible to new buyers' : 'Paused — profile hidden from new buyers',
      actionHref: '/dashboard/profile',
      actionLabel: acceptingClients ? 'Pause' : 'Resume',
    },
  ]

  const snapshot: ComplianceSnapshot = { items, role }
  return ok({
    ...snapshot,
    profileStrength: { score: strength.score, completed: strength.completed, total: strength.total },
  })
}
