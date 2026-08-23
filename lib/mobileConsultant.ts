import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'

type Db = ReturnType<typeof createSupabaseAdminClient>

export async function resolveMobileConsultant(h: string | null | undefined) {
  const auth = await verifyMobileBearer(h)
  if (auth.status !== 'authenticated') return { status: 'unauthenticated' as const, reason: auth.reason }
  const db = createSupabaseAdminClient()
  const { data: p, error } = await db.from('profiles').select('id, role, status, email, full_name').eq('clerk_user_id', auth.userId).single()
  if (error || !p) return { status: 'forbidden' as const, message: 'Profile not found.', httpStatus: 404 as const }
  if (p.role !== 'consultant') return { status: 'forbidden' as const, message: 'Forbidden', httpStatus: 403 as const }
  if (p.status === 'suspended') return { status: 'forbidden' as const, message: 'Account suspended', httpStatus: 403 as const }
  return { status: 'authenticated' as const, db, profile: p }
}

export function unauthRes(r: 'missing' | 'invalid') {
  return Response.json({ error: { message: r === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
}

export async function consultantHome(auth: { db: Db; profile: any }) {
  const { db, profile } = auth
  const [ordersRes, gigsRes] = await Promise.all([
    db.from('orders').select('id, status, progress, created_at, requirements').eq('consultant_id', profile.id).order('created_at', { ascending: false }).limit(20),
    db.from('gigs').select('id, slug, title, status, order_count, starting_price').eq('provider_id', profile.id).order('created_at', { ascending: false }).limit(20),
  ])
  const orders: any[] = (ordersRes as any).data ?? []
  const gigs: any[] = (gigsRes as any).data ?? []

  return Response.json({
    orderStats: {
      total: orders.length,
      active: orders.filter((o: any) => o.status === 'in_progress').length,
      completed: orders.filter((o: any) => o.status === 'completed').length,
    },
    gigs: gigs.map((g: any) => ({
      id: g.id, slug: g.slug, title: g.title, status: g.status,
      orderCount: g.order_count || 0, startingPrice: g.starting_price || null,
    })),
    recentOrders: orders.slice(0, 5).map((o: any) => ({
      id: o.id, title: o.requirements || 'Order', status: o.status, progress: Number(o.progress) || 0, createdAt: o.created_at,
    })),
  })
}

export async function consultantOrders(req: Request, auth: { db: Db; profile: any }) {
  const { db, profile } = auth
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  let q = db.from('orders').select('id, order_number, client_id, status, escrow_status, total_amount, deadline:delivery_deadline, progress, requirements, created_at').eq('consultant_id', profile.id).order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  const { data } = await q
  const orders: any[] = (data ?? [])

  const clientIds = [...new Set(orders.map(o => o.client_id).filter(Boolean))]
  const { data: profiles } = clientIds.length ? await db.from('profiles').select('id, full_name').in('id', clientIds) : { data: [] }
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))

  return Response.json({
    orders: orders.map(o => ({
      id: o.id, orderNumber: o.order_number || null, title: o.requirements || 'Order',
      clientName: nameById.get(o.client_id) || 'Client', status: o.status,
      progress: Number(o.progress) || 0, attorneyFee: Number(o.total_amount || 0),
      deadlineAt: o.deadline || null, createdAt: o.created_at
    }))
  })
}
