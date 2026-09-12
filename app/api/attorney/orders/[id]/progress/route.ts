import { requireAttorney } from '@/lib/attorneyAuth'
import { recordOrderActivity } from '@/lib/orderActivityAudit'

// Only an order that is actually in progress may be pushed to 'under_review'.
// A client-cancelled (or never-started) order must never be resurrected into
// review by a stale or concurrent request.
const REVIEWABLE = ['in_progress', 'under_review', 'revision_requested', 'active', 'review', 'delivered']

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  let body: { progress?: number; status?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.progress != null) {
    const n = Number(body.progress)
    if (!Number.isFinite(n) || n < 0 || n > 100) return Response.json({ error: 'progress must be 0–100.' }, { status: 400 })
    update.progress = Math.round(n)
  }
  if (body.status === 'review' || body.status === 'under_review') update.status = 'under_review'
  if (Object.keys(update).length === 0) return Response.json({ error: 'Nothing to update.' }, { status: 400 })

  // Read the order first so the write below is conditional on the state we saw.
  const { data: order } = await ctx.db
    .from('orders')
    .select('id, status, consultant_id, progress')
    .eq('id', id)
    .eq('consultant_id', ctx.profileId)
    .single()

  if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
  if (update.status === 'under_review' && !REVIEWABLE.includes(order.status)) {
    return Response.json({ error: `Order cannot be moved to review from status ${order.status}.` }, { status: 409 })
  }

  // Conditional update: only apply if the order is STILL in the state we read.
  // A client cancellation committed between read and write matches zero rows
  // -> 409, so a cancelled/terminal order can never be resurrected.
  const { data, error: updErr } = await ctx.db
    .from('orders')
    .update(update)
    .eq('id', id)
    .eq('consultant_id', ctx.profileId)
    .eq('status', order.status)
    .select('id, status, progress')
    .maybeSingle()
  if (updErr) return Response.json({ error: updErr?.message || 'Could not update.' }, { status: 500 })
  if (!data) return Response.json({ error: 'Order status changed by another request — refresh and try again.' }, { status: 409 })

  const nextStatus = String(data.status || order.status)
  const nextProgress = data.progress == null ? Number(order.progress || 0) : Number(data.progress)
  if (nextStatus !== String(order.status) || nextProgress !== Number(order.progress || 0)) {
    await recordOrderActivity(ctx.db, {
      orderId: id,
      actorId: ctx.profileId,
      actorRole: 'attorney',
      fromStatus: order.status,
      toStatus: nextStatus,
      note: nextStatus !== String(order.status)
        ? `Progress updated to ${nextProgress}% and delivery moved to client review.`
        : `Progress updated to ${nextProgress}%.`,
    })
  }

  return Response.json({ order: data })
}