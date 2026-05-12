import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Only providers can withdraw offers.', 403)

  const { id } = await context.params
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.sender_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Offer not found or already decided.', 409)

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not withdraw offer.', 500)

  if (offer.sender_type === 'attorney') {
    await auth.db.from('inquiry_messages').insert({
      inquiry_id: offer.chat_id,
      sender_role: 'system',
      sender_profile_id: auth.profileId,
      body: 'Attorney withdrew their offer.',
    })
  } else {
    await auth.db.from('order_messages').insert({
      order_id: offer.chat_id,
      sender_id: auth.profileId,
      sender_role: 'system',
      body: 'Consultant withdrew their offer.',
    })
  }

  return ok({ offer: { ...updated, status: 'withdrawn' } })
}
