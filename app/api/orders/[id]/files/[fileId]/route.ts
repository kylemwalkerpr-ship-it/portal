/**
 * DELETE /api/orders/:id/files/:fileId   — soft-delete a file (uploader/admin)
 * POST   /api/orders/:id/files/:fileId    — "send": share the file into the
 *                                           order's messenger conversation
 *
 * Companion to /api/orders/[id]/files. Lets a provider fully manage an uploaded
 * deliverable from the order view.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { mirrorMessage } from '@/lib/conversations'

type Db = ReturnType<typeof import('@/lib/supabase').createSupabaseAdminClient>

async function loadOrderAndFile(db: Db, orderId: string, fileId: string, profileId: string, role: string) {
  const { data: order } = await db
    .from('orders')
    .select('id, client_id, consultant_id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { error: 'Order not found', status: 404 as const }
  const isParticipant = order.client_id === profileId || order.consultant_id === profileId || role === 'admin'
  if (!isParticipant) return { error: 'Forbidden', status: 403 as const }

  const { data: file } = await db
    .from('order_files')
    .select('id, order_id, name, uploader_id')
    .eq('id', fileId)
    .eq('order_id', orderId)
    .maybeSingle()
  if (!file) return { error: 'File not found', status: 404 as const }
  return { order, file }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id, fileId } = await context.params

  const res = await loadOrderAndFile(auth.db, id, fileId, auth.profileId, auth.role)
  if ('error' in res) return Response.json({ error: res.error }, { status: res.status })

  // Only the uploader (or an admin) can delete.
  if (res.file.uploader_id !== auth.profileId && auth.role !== 'admin') {
    return Response.json({ error: 'Only the uploader can delete this file.' }, { status: 403 })
  }

  let { error } = await auth.db
    .from('order_files')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: auth.profileId })
    .eq('id', fileId)
  if (error && /column .*(is_deleted|deleted_at|deleted_by).* does not exist/i.test(error.message || '')) {
    // Fallback for environments without soft-delete columns: hard delete.
    const del = await auth.db.from('order_files').delete().eq('id', fileId)
    error = del.error as any
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function POST(_req: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id, fileId } = await context.params

  const res = await loadOrderAndFile(auth.db, id, fileId, auth.profileId, auth.role)
  if ('error' in res) return Response.json({ error: res.error }, { status: res.status })

  // Counterpart = the other participant on the order.
  const counterpartId =
    res.order.client_id === auth.profileId ? res.order.consultant_id
    : res.order.consultant_id === auth.profileId ? res.order.client_id
    : null
  if (!counterpartId) return Response.json({ error: 'No conversation partner for this order.' }, { status: 400 })

  try {
    await mirrorMessage(auth.db, {
      participantA: auth.profileId,
      participantB: counterpartId,
      senderId: auth.profileId,
      body: `📎 Shared a deliverable: ${res.file.name}. You can download it from this order’s Deliverables.`,
      contextKind: 'order',
      contextId: id,
      refOrderId: id,
    })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Could not send.' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
