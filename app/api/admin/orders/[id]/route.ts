import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { triggerConsultantPayout } from '@/lib/payouts'
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

  if (payload.escrow_status === 'released' && body.force === true) {
    const settings = await getPlatformSettings()
    if (!settings.allow_admin_force_release) {
      return Response.json({ error: 'Admin force-release is disabled in platform settings' }, { status: 403 })
    }
  }

  const { data: before } = await auth.db.from('orders').select('status').eq('id', id).single()
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

  let payout = null
  if (payload.status === 'completed' || payload.escrow_status === 'released') {
    payout = await triggerConsultantPayout(id)
  }

  return Response.json({ order: data, payout })
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
