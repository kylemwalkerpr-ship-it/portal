// One-click coherent compliance draft.
//
// The Compliance page now has clickable rows. When the seller clicks
// one we POST here with the row id. We load the seller's real role +
// credential_type + jurisdictions from the latest application/provider
// rows so the draft is grounded in their actual profile, then return a
// ready-to-paste paragraph with bracketed placeholders for any
// identifier the AI must NOT generate.
//
// Auth: self-only (seller drafts for their own profile).
// Writes: NONE. The seller copies the draft into the appropriate field
// and submits through the existing application/profile path.

import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { runComplianceCoherentFix } from '@/lib/coherentFix'

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) {
    return fail('Compliance drafting is only for attorneys and consultants.', 403)
  }
  const role = auth.role as 'attorney' | 'consultant'

  const body = await req.json().catch(() => ({}))
  const issueId = String(body.issueId || '')
  const issueLabel = String(body.issueLabel || '').slice(0, 200)
  const seed = typeof body.seed === 'number' ? body.seed : undefined
  if (!issueId) return fail('Missing issueId.', 400)

  // Load the seller's REAL credential type + jurisdictions so the draft
  // is grounded. Client cannot override these — the model only ever
  // sees what's already on the seller's row.
  const appTable = role === 'attorney' ? 'attorney_applications' : 'consultant_applications'
  const { data: appRow } = await auth.db
    .from(appTable)
    .select('credential_type')
    .eq('profile_id', auth.profileId)
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const providerTable = role === 'attorney' ? 'attorneys' : 'consultants'
  const { data: providerRow } = await auth.db
    .from(providerTable)
    .select('jurisdictions, years_experience')
    .eq('profile_id', auth.profileId)
    .maybeSingle()

  const result = await runComplianceCoherentFix({
    role,
    issueId,
    issueLabel,
    profileContext: {
      full_name: (auth.profile?.full_name as string | null) ?? null,
      credential_type: (appRow?.credential_type as string | null) ?? null,
      jurisdictions: (providerRow?.jurisdictions as string | null) ?? null,
      years_experience: providerRow && typeof providerRow.years_experience === 'number'
        ? providerRow.years_experience
        : null,
    },
    seed,
  })
  if (result.ok === false) return fail(result.message, result.status)
  return ok({
    draft: result.draft,
    rationale: result.rationale,
    nextAction: result.nextAction,
  })
}
