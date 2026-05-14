/**
 * GET /api/admin/payouts/connect
 * All providers and their Stripe Connect onboarding status.
 *
 * PATCH /api/admin/payouts/connect
 * Toggle stripe_bypass for a provider.
 * Body: { provider_id: string, provider_role: 'consultant'|'attorney', bypass: boolean }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const [{ data: profiles }, { data: consultants }, { data: attorneys }] = await Promise.all([
    auth.db.from('profiles').select('id, full_name, email, role, status').in('role', ['consultant', 'attorney']).eq('status', 'active'),
    auth.db.from('consultants').select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass'),
    auth.db.from('attorneys').select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass'),
  ])

  const connectMap: Record<string, any> = {}
  for (const c of [...(consultants ?? []), ...(attorneys ?? [])]) connectMap[c.profile_id] = c

  const enriched = (profiles ?? []).map(p => {
    const c = connectMap[p.id] || {}
    return {
      provider_id:    p.id,
      name:           p.full_name || p.email,
      email:          p.email,
      role:           p.role,
      stripe_account: c.stripe_account_id || null,
      onboarded:      Boolean(c.stripe_onboarding_complete),
      bypass:         Boolean(c.stripe_bypass),
      connect_ready:  Boolean(c.stripe_onboarding_complete || c.stripe_bypass),
      status:         c.stripe_account_id
        ? (c.stripe_onboarding_complete ? 'active' : 'pending')
        : 'not_started',
    }
  })

  const summary = {
    total:       enriched.length,
    active:      enriched.filter(p => p.status === 'active').length,
    pending:     enriched.filter(p => p.status === 'pending').length,
    not_started: enriched.filter(p => p.status === 'not_started').length,
    bypassed:    enriched.filter(p => p.bypass).length,
  }

  return ok({ providers: enriched, summary })
}

export async function PATCH(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  const { provider_id, provider_role, bypass } = body
  if (!provider_id)    return fail('provider_id is required.', 400)
  if (typeof bypass !== 'boolean') return fail('bypass must be boolean.', 400)

  const table = provider_role === 'attorney' ? 'attorneys' : 'consultants'

  const { error } = await auth.db
    .from(table)
    .update({ stripe_bypass: bypass, updated_at: new Date().toISOString() })
    .eq('profile_id', provider_id)

  if (error) return fail(error.message, 500)

  await auth.db.from('admin_audit_log').insert({
    admin_id:         auth.profileId,
    action_type:      bypass ? 'stripe_bypass_enabled' : 'stripe_bypass_disabled',
    target_table:     table,
    target_id:        provider_id,
    payload_snapshot: { bypass, provider_role },
    reason:           body.reason || null,
  })

  return ok({ updated: true, bypass })
}
