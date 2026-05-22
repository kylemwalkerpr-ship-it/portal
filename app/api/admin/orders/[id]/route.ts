import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { releaseEarningsForOrder } from '@/lib/earnings'
import { getPlatformSettings } from '@/lib/platformConfig'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, profile }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const body = await req.json()
  const payload: Record<string, unknown> = {}

  if ('consultant_id' in body) payload.consultant_id = body.consultant_id || null
  if ('status' in body) payload.status = body.status
  if ('escrow_status' in body) payload.escrow_status = body.escrow_status
  const refundRequested = body.refund === true || body.status === 'refunded'

  if (payload.escrow_status === 'released' && body.force === true) {
    const settings = await getPlatformSettings()
    if (!settings.allow_admin_force_release) {
      return Response.json({ error: 'Admin force-release is disabled in platform settings' }, { status: 403 })
    }
  }

  const { data: before } = await auth.db.from('orders').select('*').eq('id', id).single()
  const refundAmount = Math.round(Number(body.refund_amount_cents ?? 0)) || Math.round(Number(before?.amount_paid ?? before?.total_amount ?? 0) * (Number(before?.amount_paid) ? 1 : 100))

  if (refundRequested) {
    payload.refund_status = 'wallet_credit_pending'
    payload.wallet_credit_amount = Number(before?.total_amount || 0)
    payload.refund_method = 'wallet'
    payload.escrow_status = 'refunded'
    payload.status = 'cancelled'
    payload.cancelled_at = new Date().toISOString()
    payload.cancelled_by = auth.profile.id
    await auth.db.from('refund_ledger').insert({
      order_id: id,
      initiated_by: 'admin',
      amount: refundAmount,
      method: 'wallet',
      status: 'succeeded',
    })
  }

  const { data, error } = await auth.db.from('orders').update(payload).eq('id', id).select('*').single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if ('status' in payload && before?.status !== payload.status) {
    await auth.db.from('order_status_history').insert({
      order_id: id,
      from_status: before?.status ?? null,
      to_status: payload.status,
      changed_by_id: auth.profile.id,
      note: body.note || `Status changed by admin to ${payload.status}`,
    })
  }

  await auth.db.from('order_events').insert({
    order_id: id,
    actor_id: auth.profile.id,
    actor_role: 'admin',
    from_status: before?.status ?? null,
    to_status: String(payload.status || before?.status || 'updated'),
    note: body.note || body.reason || null,
  })
  await auth.db.from('admin_audit_log').insert({
    admin_id: auth.profile.id,
    action_type: body.action_type || (refundRequested ? 'issue_refund' : 'update_order'),
    target_table: 'orders',
    target_id: id,
    payload_snapshot: { before, after: data, request: body },
    reason: body.reason || body.note || null,
  })

  let earningsReleased: any[] = []
  if (payload.status === 'completed' || payload.escrow_status === 'released') {
    try {
      earningsReleased = await releaseEarningsForOrder(id)
    } catch (e) { console.error('[admin/orders] releaseEarningsForOrder failed:', e) }
  }

  return Response.json({ order: data, earningsReleased })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params

  await auth.db.from('order_status_history').delete().eq('order_id', id)
  await auth.db.from('order_items').delete().eq('order_id', id)

  const { error } = await auth.db.from('orders').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
