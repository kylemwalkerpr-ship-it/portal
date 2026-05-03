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

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  const [profilesRes, ordersRes, itemsRes, servicesRes] = await Promise.all([
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('orders').select('*').order('created_at', { ascending: false }),
    db.from('order_items').select('*'),
    db.from('services').select('*').order('category', { ascending: true }).order('title', { ascending: true }),
  ])

  const error = profilesRes.error || ordersRes.error || itemsRes.error || servicesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    users: profilesRes.data ?? [],
    orders: ordersRes.data ?? [],
    orderItems: itemsRes.data ?? [],
    services: servicesRes.data ?? [],
  })
}
