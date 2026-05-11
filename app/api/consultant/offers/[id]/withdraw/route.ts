import { getCurrentConsultant } from '@/lib/consultant'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data, error } = await auth.db
    .from('consultant_offers')
    .update({ status: 'withdrawn', decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('consultant_id', auth.consultant.id)
    .eq('status', 'sent')
    .select('id, order_id')
    .single()

  if (error || !data) return Response.json({ error: 'Offer not found or already decided.' }, { status: 409 })

  await auth.db.from('order_messages').insert({
    order_id: data.order_id,
    sender_id: auth.profile.id,
    sender_role: 'system',
    body: 'Consultant withdrew their offer.',
  })

  return Response.json({ ok: true })
}
