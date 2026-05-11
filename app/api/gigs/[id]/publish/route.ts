import { ok, fail } from '@/lib/apiEnvelope'
import { getPaymentSettingsForApi } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

export async function PATCH(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: gig } = await auth.db.from('gigs').select('*, tiers:gig_tiers(*)').eq('id', id).single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  const fields: Record<string, string> = {}
  if (!gig.title || gig.title.length > 80) fields.title = 'Title is required and must be 80 characters or less.'
  if (!gig.category) fields.category = 'Category is required.'
  if (!gig.pitch) fields.pitch = 'One-line pitch is required.'
  if (!gig.description || gig.description.length < 120) fields.description = 'Description must be at least 120 characters.'
  const tiers = (gig.tiers || []).filter((t: any) => t.is_active)
  if (!tiers.some((t: any) => t.tier === 'basic')) fields.tiers = 'Basic tier is required.'
  const settings = await getPaymentSettingsForApi()
  if (tiers.some((t: any) => Number(t.price) < settings.minimum_gig_price_cents || Number(t.price) > settings.maximum_gig_price_cents)) {
    fields.tiers = 'Tier prices must stay within admin min/max settings.'
  }
  if (Object.keys(fields).length) return fail('Gig is not ready to publish.', 422, { fields })

  const { data: updated, error } = await auth.db
    .from('gigs')
    .update({ status: 'active', published_at: gig.published_at || new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, tiers:gig_tiers(*)')
    .single()
  if (error || !updated) return fail(error?.message || 'Could not publish gig.', 500)
  return ok({ gig: updated })
}
