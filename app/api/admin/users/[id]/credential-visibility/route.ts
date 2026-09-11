import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * Admin override for a provider's public professional identifier.
 *
 * override = null  -> respect provider preference
 * override = true  -> force visible on provider bio card
 * override = false -> force hidden on provider bio card
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const override = body?.override
  if (!(override === null || typeof override === 'boolean')) {
    return fail('override must be true, false, or null.', 400)
  }

  const { data: profile, error: profileError } = await auth.db
    .from('profiles')
    .select('id, role')
    .eq('id', id)
    .maybeSingle()

  if (profileError) return fail(profileError.message, 500)
  if (!profile) return fail('Provider not found.', 404)
  if (!['attorney', 'consultant'].includes(profile.role)) {
    return fail('Credential visibility is only available for provider profiles.', 400)
  }

  const table = profile.role === 'attorney' ? 'attorneys' : 'consultants'
  const column = profile.role === 'attorney'
    ? 'admin_show_bar_number_override'
    : 'admin_show_registration_number_override'

  const { data: provider, error: updateError } = await auth.db
    .from(table)
    .update({ [column]: override })
    .eq('profile_id', id)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (updateError) return fail(updateError.message, 500)

  await auth.db.from('admin_audit_log').insert({
    admin_id: auth.profileId,
    action_type: 'credential_visibility_override',
    target_table: table,
    target_id: provider?.id ?? id,
    payload_snapshot: {
      provider_profile_id: id,
      role: profile.role,
      override,
    },
    reason: override === null
      ? 'Admin cleared credential visibility override; provider preference applies.'
      : `Admin forced credential identifier ${override ? 'visible' : 'hidden'} on public bio card.`,
  })

  return ok({
    role: profile.role,
    override,
    provider_record: provider ?? null,
  })
}
