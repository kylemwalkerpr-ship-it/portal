import { ok, fail } from '@/lib/apiEnvelope'
import { getPaymentSettingsForApi, normalizeRevision, toCents } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

async function canEdit(auth: any, gigId: string) {
  const { data: gig } = await auth.db.from('gigs').select('provider_id').eq('id', gigId).single()
  return gig && (gig.provider_id === auth.profileId || auth.role === 'admin')
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string; tierId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id, tierId } = await context.params
  if (!(await canEdit(auth, id))) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = {}
  if ('title' in body) payload.title = String(body.title || '').slice(0, 40)
  if ('description' in body) payload.description = String(body.description || '').slice(0, 300)
  if ('price' in body) {
    const settings = await getPaymentSettingsForApi()
    const price = toCents(body.price)
    if (!Number.isInteger(price) || price < settings.minimum_gig_price_cents || price > settings.maximum_gig_price_cents) {
      return fail('Tier price is outside admin limits.', 422, { fields: { price: 'Outside admin min/max.' } })
    }
    payload.price = price
  }
  if ('delivery_days' in body) payload.delivery_days = Math.max(1, Number(body.delivery_days || 1))
  if ('revisions' in body) payload.revisions = normalizeRevision(body.revisions)
  if ('features' in body) payload.features = Array.isArray(body.features) ? body.features.slice(0, 8) : []
  if ('is_active' in body) payload.is_active = Boolean(body.is_active)

  const { data: tier, error } = await auth.db.from('gig_tiers').update(payload).eq('id', tierId).eq('gig_id', id).select('*').single()
  if (error || !tier) return fail(error?.message || 'Could not update tier.', 500)
  return ok({ tier })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; tierId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id, tierId } = await context.params
  if (!(await canEdit(auth, id))) return fail('Forbidden.', 403)
  const { count } = await auth.db.from('gig_tiers').select('id', { count: 'exact', head: true }).eq('gig_id', id)
  if ((count ?? 0) <= 1) return fail('At least one tier must remain.', 409)
  const { error } = await auth.db.from('gig_tiers').delete().eq('id', tierId).eq('gig_id', id)
  if (error) return fail(error.message, 500)
  return ok({ deleted: true })
}
