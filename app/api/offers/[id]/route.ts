import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

async function loadOffer(db: any, id: string) {
  return db
    .from('offers')
    .select('*, files:offer_files(*)')
    .eq('id', id)
    .single()
}

function canSeeOffer(offer: any, profileId: string) {
  return offer.sender_id === profileId || offer.recipient_id === profileId
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (!canSeeOffer(offer, auth.profileId) && auth.role !== 'admin') return fail('Forbidden.', 403)

  return ok({ offer })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.sender_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be cancelled.', 409)

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not cancel offer.', 500)
  return ok({ offer: updated })
}
