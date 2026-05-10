import { requireAttorney } from '@/lib/attorneyAuth'

// Attorney marks the deliverable ready for client review. The actual escrow
// release happens when the client approves on their side (existing flow).
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: order, error: updErr } = await ctx.db
    .from('orders')
    .update({ status: 'review', progress: 100 })
    .eq('id', id)
    .eq('consultant_id', ctx.profileId)
    .select('id, status')
    .single()
  if (updErr || !order) return Response.json({ error: updErr?.message || 'Could not mark complete.' }, { status: 500 })

  await ctx.db.from('order_messages').insert({
    order_id: id,
    sender_id: ctx.profileId,
    sender_role: 'consultant',
    body: 'Deliverable submitted for client review. The client can now approve and release escrow.',
  })

  return Response.json({ order })
}
