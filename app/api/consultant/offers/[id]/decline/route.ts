import { getCurrentStudent } from '@/lib/student'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: offer } = await auth.db
    .from('consultant_offers')
    .select('id, order_id, client_profile_id, status')
    .eq('id', id)
    .single()
  if (!offer) return Response.json({ error: 'Offer not found.' }, { status: 404 })
  if (offer.client_profile_id !== auth.profile.id) return Response.json({ error: 'Forbidden.' }, { status: 403 })
  if (offer.status !== 'sent') return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })

  await auth.db
    .from('consultant_offers')
    .update({ status: 'declined', decided_at: new Date().toISOString() })
    .eq('id', id)

  await auth.db.from('order_messages').insert({
    order_id: offer.order_id,
    sender_id: auth.profile.id,
    sender_role: 'system',
    body: 'Student declined the consultant offer.',
  })

  return Response.json({ ok: true })
}
