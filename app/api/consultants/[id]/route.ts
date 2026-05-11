import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  if (typeof body?.stripe_bypass !== 'boolean') {
    return fail('stripe_bypass must be a boolean.', 422, { fields: { stripe_bypass: 'Required boolean.' } })
  }

  const { data: consultant, error } = await auth.db
    .from('consultants')
    .update({ stripe_bypass: body.stripe_bypass })
    .eq('id', id)
    .select('id, profile_id, user_id, stripe_bypass')
    .single()

  if (error || !consultant) {
    return fail(error?.message || 'Consultant not found.', error?.code === 'PGRST116' ? 404 : 500)
  }

  return ok({ consultant })
}
