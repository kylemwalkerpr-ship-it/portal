import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { DEFAULT_PLATFORM_SETTINGS } from '@/lib/platformConfig'

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
  return { db, adminProfileId: profile.id }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  const [profilesRes, ordersRes, itemsRes, servicesRes, settingsRes] = await Promise.all([
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('orders').select('*').order('created_at', { ascending: false }),
    db.from('order_items').select('*'),
    db.from('services').select('*').order('category', { ascending: true }).order('title', { ascending: true }),
    db.from('platform_settings').select('value').eq('key', 'default').single(),
  ])

  const error = profilesRes.error || ordersRes.error || itemsRes.error || servicesRes.error
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({
    users: profilesRes.data ?? [],
    orders: ordersRes.data ?? [],
    orderItems: itemsRes.data ?? [],
    services: servicesRes.data ?? [],
    settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(settingsRes.data?.value || {}) },
    currentAdminId: auth.adminProfileId,
  })
}
