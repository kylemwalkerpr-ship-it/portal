/**
 * GET/PATCH /api/admin/payouts/connect
 *
 * Connect-onboarding status summary for the admin Payouts surface. Connect
 * onboarding has been RETIRED (payouts are processed manually by admin —
 * see /api/admin/payouts), so this endpoint reports every provider as
 * fully active. It exists so the Payouts UI's onboarding panel renders
 * honest numbers instead of 404ing.
 *
 * PATCH (the legacy bypass toggle) is a no-op kept for UI compatibility.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const [attorneysRes, consultantsRes] = await Promise.all([
    auth.db.from('attorneys').select('id', { count: 'exact', head: true }),
    auth.db.from('consultants').select('id', { count: 'exact', head: true }),
  ])
  const total = (attorneysRes.count ?? 0) + (consultantsRes.count ?? 0)

  return ok({
    summary: {
      total,
      active: total, // connect retired — every provider is payable manually
      pending: 0,
      not_started: 0,
      bypassed: 0,
    },
    connect_retired: true,
  })
}

export async function PATCH() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  // Bypass toggling belonged to the retired Connect flow; payouts no longer
  // gate on onboarding, so there is nothing to toggle.
  return ok({ noop: true, message: 'Connect onboarding is retired — all providers are payable via manual payouts.' })
}
