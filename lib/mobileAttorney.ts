import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'
import { summary as earningsSummary } from './earnings'
import { applyOpenQueueFilter, getAcceptedInquiryIds } from './attorneyInquiries'

type Db = ReturnType<typeof createSupabaseAdminClient>

export type MobileAttorneyResult =
  | { status: 'authenticated'; db: Db; profile: { id: string; role: string; status: string; email: string | null; full_name: string | null }; attorneyId: string }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }
  | { status: 'forbidden'; message: string; httpStatus: 403 | 404 }

export async function resolveMobileAttorney(h: string | null | undefined): Promise<MobileAttorneyResult> {
  const auth = await verifyMobileBearer(h)
  if (auth.status !== 'authenticated') return { status: 'unauthenticated', reason: auth.reason }
  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db.from('profiles').select('id, role, status, email, full_name').eq('clerk_user_id', auth.userId).single()
  if (error || !profile) return { status: 'forbidden', message: 'Profile not found.', httpStatus: 404 }
  if (profile.role !== 'attorney') return { status: 'forbidden', message: 'Forbidden', httpStatus: 403 }
  if (profile.status === 'suspended') return { status: 'forbidden', message: 'Account suspended', httpStatus: 403 }
  const { data: att } = await db.from('attorneys').select('id').eq('profile_id', profile.id).single()
  if (!att?.id) return { status: 'forbidden', message: 'Attorney record not found.', httpStatus: 404 }
  return { status: 'authenticated', db, profile, attorneyId: att.id }
}

export function unauthRes(r: 'missing' | 'invalid') {
  return Response.json({ error: { message: r === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
}

// ── Home dashboard (slim) ───────────────────────────────────

export async function attorneyHome(auth: Extract<MobileAttorneyResult, { status: 'authenticated' }>) {
  const { db, profile, attorneyId } = auth
  const acceptedIds = await getAcceptedInquiryIds(db)

  const [ordersRes, attRes, openInqRes, myMsgsRes, myOffersRes] = await Promise.all([
    db.from('orders').select('id, status, escrow_status, payout_status, attorney_fee, deadline:delivery_deadline, created_at, progress, requirements').eq('consultant_id', profile.id),
    db.from('attorneys').select('available, tagline, headshot_url').eq('id', attorneyId).single(),
    applyOpenQueueFilter(db.from('inquiries').select('id, status, urgency, created_at'), acceptedIds),
    db.from('inquiry_messages').select('inquiry_id').eq('sender_profile_id', profile.id).eq('sender_role', 'attorney'),
    db.from('attorney_offers').select('inquiry_id, status').eq('attorney_id', attorneyId),
  ])

  const orders: any[] = (ordersRes as any).data ?? []
  const att: any = (attRes as any).data || null
  const openInqs: any[] = (openInqRes as any).data ?? []
  const myMsgs: any[] = (myMsgsRes as any).data ?? []
  const myOffers: any[] = (myOffersRes as any).data ?? []

  const now = Date.now()
  const earn = await earningsSummary(profile.id).catch(() => ({ owedCents: 0, releasableCents: 0, paidCents: 0 }))

  return Response.json({
    attorney: { tagline: att?.tagline || null, headshot_url: att?.headshot_url || null, available: att?.available !== false },
    orderStats: {
      total: orders.length,
      active: orders.filter((o: any) => o.status === 'in_progress').length,
      pendingPayout: earn.releasableCents / 100,
      completed: orders.filter((o: any) => o.status === 'completed').length,
    },
    inquiryStats: {
      open: openInqs.length,
      myEngaged: new Set(myMsgs.map((r: any) => r.inquiry_id).concat(myOffers.map((r: any) => r.inquiry_id))).size,
    },
    recentOrders: orders.filter((o: any) => ['in_progress', 'under_review'].includes(o.status)).slice(0, 5).map((o: any) => ({
      id: o.id, title: o.requirements || 'Order', status: o.status, progress: Number(o.progress) || 0, attorneyFee: Number(o.attorney_fee || 0), deadlineAt: o.deadline || null
    })),
  })
}

// ── Inquiries ────────────────────────────────────────────────

export async function attorneyInquiries(req: Request, auth: Extract<MobileAttorneyResult, { status: 'authenticated' }>) {
  const { db, profile, attorneyId } = auth
  const url = new URL(req.url)
  const view = url.searchParams.get('view') || 'open'
  const acceptedIds = await getAcceptedInquiryIds(db)

  let rows: any[]
  if (view === 'mine') {
    const [{ data: msgs }, { data: offers }] = await Promise.all([
      db.from('inquiry_messages').select('inquiry_id').eq('sender_profile_id', profile.id).eq('sender_role', 'attorney'),
      db.from('attorney_offers').select('inquiry_id').eq('attorney_id', attorneyId),
    ])
    const ids = [...new Set([...(msgs ?? []).map((r: any) => r.inquiry_id), ...(offers ?? []).map((r: any) => r.inquiry_id)])]
    if (!ids.length) return Response.json({ inquiries: [] })
    const { data } = await db.from('inquiries').select('*').in('id', ids).order('created_at', { ascending: false })
    rows = (data ?? []).filter((q: any) => q.source !== 'portal_attorney_chat')
  } else {
    const q = applyOpenQueueFilter(db.from('inquiries').select('id, email, full_name, case_type, case_type_label, urgency, status, created_at, target_attorney_profile_id').order('created_at', { ascending: false }).limit(200), acceptedIds)
    const { data } = await q
    rows = (data ?? []).map((q: any) => ({
      id: q.id, email: q.email, full_name: q.full_name,
      case_type: q.case_type, case_type_label: q.case_type_label,
      urgency: q.urgency, status: q.status, created_at: q.created_at,
      targeted_to_me: q.target_attorney_profile_id === profile.id
    }))
    rows.sort((a, b) => Number(b.targeted_to_me) - Number(a.targeted_to_me))
  }

  return Response.json({ inquiries: rows.map((q: any) => ({
    id: q.id, email: q.email, full_name: q.full_name, case_type: q.case_type, case_type_label: q.case_type_label,
    urgency: q.urgency, status: q.status, created_at: q.created_at, targeted_to_me: q.targeted_to_me || false
  })) })
}

// ── Orders ───────────────────────────────────────────────────

export async function attorneyOrders(req: Request, auth: Extract<MobileAttorneyResult, { status: 'authenticated' }>) {
  const { db, profile } = auth
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || ''
  let q = db.from('orders').select('id, order_number, client_id, status, escrow_status, attorney_fee, deadline:delivery_deadline, progress, requirements, created_at').eq('consultant_id', profile.id).order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  const { data } = await q
  const orders: any[] = (data ?? [])

  // Hydrate client names
  const clientIds = [...new Set(orders.map(o => o.client_id).filter(Boolean))]
  const { data: profiles } = clientIds.length ? await db.from('profiles').select('id, full_name').in('id', clientIds) : { data: [] }
  const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]))

  return Response.json({
    orders: orders.map(o => ({
      id: o.id, orderNumber: o.order_number || null, title: o.requirements || 'Order',
      clientName: nameById.get(o.client_id) || 'Client', status: o.status,
      progress: Number(o.progress) || 0, attorneyFee: Number(o.attorney_fee || 0),
      deadlineAt: o.deadline || null, createdAt: o.created_at
    }))
  })
}