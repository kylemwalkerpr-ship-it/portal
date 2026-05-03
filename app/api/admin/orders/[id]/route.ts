import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { triggerConsultantPayout } from '@/lib/payouts'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db }
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

  const { data, error } = await auth.db.from('orders').update(payload).eq('id', id).select('*').single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  let payout = null
  if (payload.status === 'completed' || payload.escrow_status === 'released') {
    payout = await triggerConsultantPayout(id)
  }

  return Response.json({ order: data, payout })
}
