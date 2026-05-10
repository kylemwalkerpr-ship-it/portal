import { requireClient } from '@/lib/clientAuth'

export const runtime = 'edge'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: offer } = await ctx.db
    .from('attorney_offers')
    .select('id, client_email, client_profile_id, status, inquiry_id')
    .eq('id', id)
    .single()
  if (!offer) return Response.json({ error: 'Offer not found.' }, { status: 404 })
  if (offer.client_profile_id !== ctx.profileId && offer.client_email !== ctx.email) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }
  if (offer.status !== 'sent') {
    return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })
  }

  await ctx.db
    .from('attorney_offers')
    .update({ status: 'declined', decided_at: new Date().toISOString(), client_profile_id: ctx.profileId })
    .eq('id', id)

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: offer.inquiry_id,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: 'Client declined the offer.',
  })

  return Response.json({ ok: true })
}
