import { requireAttorney } from '@/lib/attorneyAuth'

// Attorney marks the deliverable ready for client review. The actual escrow
// release happens when the client approves on their side (existing flow).
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: order, error: updErr } = await ctx.db
    .from('orders')
    .update({ status: 'under_review', progress: 100 })
    .eq('id', id)
    .eq('consultant_id', ctx.profileId)
    .select('id, status, client_id')
    .single()
  if (updErr || !order) return Response.json({ error: updErr?.message || 'Could not mark complete.' }, { status: 500 })

  const note = 'Deliverable submitted for client review. Please review the files and approve to release escrow.'
  await ctx.db.from('order_messages').insert({
    order_id: id,
    sender_id: ctx.profileId,
    sender_role: 'consultant',
    body: note,
  })

  // Mirror into the unified messenger so the client is notified there too.
  if ((order as any).client_id) {
    try {
      const { mirrorMessage } = await import('@/lib/conversations')
      await mirrorMessage(ctx.db, {
        participantA: ctx.profileId,
        participantB: (order as any).client_id,
        senderId: ctx.profileId,
        body: note,
        contextKind: 'order',
        contextId: id,
        refOrderId: id,
      })
    } catch { /* non-fatal */ }
  }

  return Response.json({ order })
}
