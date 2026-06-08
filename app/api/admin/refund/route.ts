import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

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

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  let body: any
  try { body = await req.json() } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, id } = body
  if (!type || !id) {
    return Response.json({ error: 'type and id are required' }, { status: 400 })
  }

  if (type === 'order') {
    const { data: order, error: fetchError } = await db
      .from('orders')
      .update({ status: 'refunded', escrow_status: 'refunded' })
      .eq('id', id)
      .select()
      .single()
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 })
    return Response.json({ refunded: order })
  }

  if (type === 'template_order') {
    const { data: tmplOrder, error: fetchError } = await db
      .from('template_orders')
      .update({ status: 'refunded' })
      .eq('id', id)
      .select()
      .single()
    if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 })
    return Response.json({ refunded: tmplOrder })
  }

  return Response.json({ error: 'Invalid type. Must be "order" or "template_order".' }, { status: 400 })
}
