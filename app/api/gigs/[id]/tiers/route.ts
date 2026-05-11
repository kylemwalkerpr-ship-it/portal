import { ok, fail } from '@/lib/apiEnvelope'
import { getPaymentSettingsForApi, normalizeRevision, toCents } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

async function canEdit(auth: any, gigId: string) {
  const { data: gig } = await auth.db.from('gigs').select('provider_id').eq('id', gigId).single()
  return gig && (gig.provider_id === auth.profileId || auth.role === 'admin')
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  if (!(await canEdit(auth, id))) return fail('Forbidden.', 403)

  const { count } = await auth.db.from('gig_tiers').select('id', { count: 'exact', head: true }).eq('gig_id', id)
  if ((count ?? 0) >= 3) return fail('A gig can have at most 3 tiers.', 409)

  const body = await req.json().catch(() => ({}))
  const settings = await getPaymentSettingsForApi()
  const price = toCents(body.price)
  if (!Number.isInteger(price) || price < settings.minimum_gig_price_cents || price > settings.maximum_gig_price_cents) {
    return fail('Tier price is outside admin limits.', 422, { fields: { price: 'Outside admin min/max.' } })
  }

  const { data: tier, error } = await auth.db.from('gig_tiers').insert({
    gig_id: id,
    tier: body.tier,
    title: String(body.title || body.tier || '').slice(0, 40),
    description: String(body.description || '').slice(0, 300),
    price,
    delivery_days: Math.max(1, Number(body.delivery_days || 1)),
    revisions: normalizeRevision(body.revisions ?? 1),
    features: Array.isArray(body.features) ? body.features.slice(0, 8) : [],
  }).select('*').single()
  if (error || !tier) return fail(error?.message || 'Could not create tier.', 500)
  return ok({ tier }, { status: 201 })
}
