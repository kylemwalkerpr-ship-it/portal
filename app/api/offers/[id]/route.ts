import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const TERMINAL_STATUSES = ['paid', 'accepted', 'expired'] as const

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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const newStatus = body.status as string

  if (!['declined', 'cancelled'].includes(newStatus)) {
    return fail("status must be 'declined' or 'cancelled'.", 422)
  }

  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)

  if (TERMINAL_STATUSES.includes(offer.status as typeof TERMINAL_STATUSES[number])) {
    return fail(`Cannot change status of a ${offer.status} offer.`, 409)
  }

  if (newStatus === 'declined') {
    // Only the buyer (recipient) can decline
    if (auth.role !== 'client') return fail('Only clients can decline offers.', 403)
    if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  }

  if (newStatus === 'cancelled') {
    // Only the seller (sender) can cancel/withdraw
    const isProvider = ['attorney', 'consultant'].includes(auth.role)
    if (!isProvider && auth.role !== 'admin') return fail('Only providers can withdraw offers.', 403)
    if (offer.sender_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  }

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not update offer.', 500)
  return ok({ offer: updated })
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
