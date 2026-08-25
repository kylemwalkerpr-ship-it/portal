import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'
import { mintSignedDocumentUrl } from './documentStorage'

/**
 * Shared logic for /api/mobile/orders* — Bearer-verified student orders.
 *
 * Same query/response shapes as /api/student/orders and
 * /api/student/orders/[id] (cookie auth), but the identity comes from the
 * Bearer Clerk JWT so the native app can use it. Cookie auth is untouched.
 */

export type MobileStudentResult =
  | {
      status: 'authenticated'
      db: ReturnType<typeof createSupabaseAdminClient>
      profile: { id: string; role: string; status: string; email: string | null }
    }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }
  | { status: 'forbidden'; message: string; httpStatus: 403 | 404 }

/** Resolve the signed-in student (client/student role) from a Bearer JWT. */
export async function resolveMobileStudent(
  authorizationHeader: string | null | undefined,
): Promise<MobileStudentResult> {
  const auth = await verifyMobileBearer(authorizationHeader)
  if (auth.status !== 'authenticated') {
    return { status: 'unauthenticated', reason: auth.reason }
  }

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', auth.userId)
    .single()
  if (error || !profile) return { status: 'forbidden', message: 'Profile not found.', httpStatus: 404 }

  const isBuyer = profile.role === 'client' || profile.role === 'student'
  if (!isBuyer) return { status: 'forbidden', message: 'Forbidden', httpStatus: 403 }
  if (profile.status === 'suspended') return { status: 'forbidden', message: 'Account suspended', httpStatus: 403 }

  return { status: 'authenticated', db, profile }
}

export function unauthorizedResponse(reason: 'missing' | 'invalid') {
  const message =
    reason === 'missing'
      ? 'Missing session token. User must sign in.'
      : 'Invalid session token. User must sign in.'
  return Response.json({ error: { message }, signInRequired: true }, { status: 401 })
}

function dollarsFromCents(cents: unknown) {
  return Number(cents || 0) / 100
}

const SORT_COLUMNS = ['created_at', 'total_amount', 'deadline', 'progress'] as const

const STATUS_MAP: Record<string, string[]> = {
  pending: ['queued', 'created', 'pending'],
  active: ['active', 'in_progress'],
  review: ['review', 'under_review'],
  completed: ['completed'],
  cancelled: ['cancelled', 'canceled'],
  refunded: ['refunded'],
}

/**
 * GET /api/mobile/orders — paginated, filterable list of the student's orders.
 * Mirrors GET /api/student/orders exactly (same params, same output shape).
 */
export async function listMobileOrders(
  req: Request,
  auth: { db: any; profile: { id: string } },
) {
  const { db, profile } = auth
  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status') || 'all'
  const escrowParam = searchParams.get('escrow') || 'all'
  const productParam = searchParams.get('product') || 'all'
  const q = searchParams.get('q')?.trim() || ''
  const sort = (SORT_COLUMNS as readonly string[]).includes(searchParams.get('sort') || '')
    ? searchParams.get('sort')!
    : 'created_at'
  const dir = searchParams.get('dir') === 'asc'
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Column was renamed in DB to `delivery_deadline` — alias it back to
  // `deadline` so the return shape stays unchanged.
  const sortColumn = sort === 'deadline' ? 'delivery_deadline' : sort
  let qb = db
    .from('orders')
    .select('id, order_number, consultant_id, status, requirements, created_at, deadline:delivery_deadline, progress, total_amount, payout_status, escrow_status, terms_accepted_at, refund_policy_accepted_at', { count: 'exact' })
    .eq('client_id', profile.id)
    .order(sortColumn, { ascending: dir })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (statusParam !== 'all') {
    const mapped = STATUS_MAP[statusParam] || [statusParam]
    qb = qb.in('status', mapped)
  }
  if (escrowParam !== 'all') qb = qb.eq('escrow_status', escrowParam)
  if (q && q.length >= 2) {
    // plainto_tsquery (`plfts`): `-`/quotes in user queries can never raise
    // "syntax error in tsquery" (to_tsquery parses `-` as NOT).
    const safeQ = q.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (safeQ && safeQ.length >= 2) {
      qb = qb.or(`requirements.plfts.${safeQ},order_number.ilike.%${q}%`)
    } else {
      qb = qb.or(`order_number.ilike.%${q}%`)
    }
  }

  let { data: rows, error, count } = await qb

  // Self-heal: missing column (e.g. progress, escrow_status) — retry with SELECT *.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    let fb = db
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('client_id', profile.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (statusParam !== 'all') {
      const mapped = STATUS_MAP[statusParam] || [statusParam]
      fb = fb.in('status', mapped)
    }
    const r = await fb
    rows = r.data as any
    error = r.error as any
    count = r.count as any
  }

  if (error) throw new Error(error.message)

  const orderRows = rows ?? []
  const total = count ?? 0
  const orderIds = orderRows.map((o: any) => o.id)
  const consultantIds = Array.from(new Set(orderRows.map((o: any) => o.consultant_id).filter(Boolean)))

  const [itemsRes, profilesRes, filesRes, msgsRes] = await Promise.all([
    orderIds.length
      ? db.from('order_items').select('order_id, service_id').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    consultantIds.length
      ? db.from('profiles').select('id, email, full_name, role').in('id', consultantIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? db.from('order_files').select('order_id').in('order_id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? db.from('order_messages').select('order_id, created_at, body, from_role')
          .in('order_id', orderIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const serviceIds = Array.from(new Set((itemsRes.data ?? []).map((i: any) => i.service_id).filter(Boolean)))
  const servicesRes = serviceIds.length
    ? await db.from('services').select('id, title, product_type, category, icon').in('id', serviceIds)
    : { data: [], error: null }

  const itemByOrder = new Map((itemsRes.data ?? []).map((i: any) => [i.order_id, i]))
  const serviceById = new Map((servicesRes.data ?? []).map((s: any) => [s.id, s]))
  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))

  const fileCount = new Map<string, number>()
  for (const f of filesRes.data ?? []) fileCount.set((f as any).order_id, (fileCount.get((f as any).order_id) || 0) + 1)

  const lastMsg = new Map<string, { at: string; body: string; from: string }>()
  for (const m of msgsRes.data ?? []) {
    const oid = (m as any).order_id
    if (!lastMsg.has(oid)) {
      lastMsg.set(oid, { at: (m as any).created_at, body: String((m as any).body || '').slice(0, 120), from: (m as any).from_role || 'consultant' })
    }
  }

  const orders = orderRows.map((order: any) => {
    const item = itemByOrder.get(order.id)
    const service = item ? serviceById.get((item as any).service_id) : null
    const productType = (service as any)?.product_type === 'template' ? 'template' : 'service'
    const isTemplate = productType === 'template'
    const consultant = order.consultant_id ? profileById.get(order.consultant_id) : null
    const totalCents = Math.round(Number(order.total_amount || 0) * 100)
    const storedProgress = Number.isFinite(Number(order.progress)) ? Number(order.progress) : null
    const status = order.status === 'queued' ? 'pending'
      : order.status === 'created' ? 'created'
      : order.status === 'in_progress' ? 'active'
      : order.status === 'under_review' ? 'review'
      : order.status || 'pending'
    const fallbackProgress = status === 'completed' ? 100 : status === 'review' ? 90 : status === 'active' ? 50 : 0

    return {
      id: order.id,
      orderNumber: order.order_number || null,
      service: (service as any)?.title || order.requirements || 'Custom engagement',
      serviceId: (service as any)?.id ?? null,
      productType,
      category: (service as any)?.category || null,
      icon: (service as any)?.icon || null,
      consultant: isTemplate
        ? 'Digital delivery'
        : (consultant as any)?.full_name || (consultant as any)?.email || (order.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
      consultantId: order.consultant_id ?? null,
      status,
      rawStatus: order.status,
      date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
      createdAt: order.created_at || null,
      deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : '—',
      deadlineAt: order.deadline || null,
      progress: storedProgress ?? fallbackProgress,
      price: `$${dollarsFromCents(totalCents).toFixed(2)}`,
      totalCents,
      payoutStatus: order.payout_status || 'pending',
      escrowStatus: order.escrow_status || 'held',
      fileCount: fileCount.get(order.id) || 0,
      lastMessage: lastMsg.get(order.id) || null,
      termsAcceptedAt: order.terms_accepted_at || null,
      refundPolicyAcceptedAt: order.refund_policy_accepted_at || null,
    }
  })

  const filtered = productParam !== 'all'
    ? orders.filter(o => o.productType === productParam)
    : orders

  return {
    orders: filtered,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  }
}

/**
 * GET /api/mobile/orders/[id] — order detail with files minted as short-lived
 * signed URLs. Mirrors GET /api/student/orders/[id] exactly.
 */
export async function getMobileOrderDetail(
  id: string,
  auth: { db: any; profile: { id: string } },
): Promise<
  | { kind: 'ok'; payload: Record<string, unknown> }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
> {
  const { db, profile } = auth

  let { data: order, error } = await db
    .from('orders')
    .select('id, order_number, client_id, consultant_id, attorney_id, status, requirements, created_at, deadline:delivery_deadline, progress, total_amount, payout_status, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, auto_release_eligible_at, terms_accepted_at, refund_policy_accepted_at')
    .eq('id', id)
    .single()
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const r = await db.from('orders').select('*').eq('id', id).single()
    order = r.data as any
    error = r.error as any
  }
  if (error || !order) return { kind: 'not_found' }
  if (order.client_id !== profile.id) return { kind: 'forbidden' }

  const [itemsRes, consultantRes, filesRes, messagesRes, eventsRes, milestonesRes, scopeRes] = await Promise.allSettled([
    db.from('order_items').select('order_id, service_id, quantity, unit_price').eq('order_id', id),
    order.consultant_id
      ? db.from('profiles').select('id, full_name, email, avatar_url, role').eq('id', order.consultant_id).single()
      : Promise.resolve({ data: null }),
    db.from('order_files').select('id, name, size_bytes, uploader_role, uploader_id, mime_type, created_at, storage_path, is_sensitive, is_deleted').eq('order_id', id).order('created_at', { ascending: false }),
    db.from('order_messages').select('id, sender_id, sender_role, body, created_at, attachment_url, attachment_name').eq('order_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('order_events').select('id, event_type, from_status, to_status, notes, metadata, actor_id, created_at').eq('order_id', id).order('created_at', { ascending: false }).limit(50),
    db.from('order_milestones').select('*').eq('order_id', id).order('sequence', { ascending: true }),
    db.from('order_scope_changes').select('*').eq('order_id', id).order('created_at', { ascending: false }),
  ])

  const items = itemsRes.status === 'fulfilled' ? (itemsRes.value.data ?? []) : []
  const serviceIds = items.map((i: any) => i.service_id).filter(Boolean)
  const servicesRes = serviceIds.length
    ? await db.from('services').select('id, title, product_type, category, icon, description').in('id', serviceIds)
    : { data: [] }
  const services = servicesRes.data ?? []
  const primaryService = services[0] || null
  const isTemplate = primaryService?.product_type === 'template'
  const consultant = consultantRes.status === 'fulfilled' ? (consultantRes.value as any)?.data || null : null

  // Every file exchanged on this order, newest first, with a short-lived
  // signed URL so the app can view/download. Soft-deleted files excluded.
  const fileRowsRaw = filesRes.status === 'fulfilled' ? ((filesRes.value as any).data ?? []) : []
  const fileRows = (fileRowsRaw as any[]).filter(r => !r.is_deleted)
  const files = await Promise.all(
    fileRows.map(async (r: any) => {
      let url: string | null = null
      try {
        if (r.storage_path) {
          const signed = await mintSignedDocumentUrl(db, {
            bucket: 'order-files',
            path: r.storage_path,
            accessorProfileId: profile.id,
            filename: r.name,
            documentId: r.id,
            sensitive: !!r.is_sensitive,
            download: false,
          })
          url = 'signedUrl' in signed ? signed.signedUrl : null
        }
      } catch {
        /* leave url null */
      }
      return {
        id: r.id,
        name: r.name,
        size_bytes: r.size_bytes,
        mime_type: r.mime_type,
        uploader_role: r.uploader_role,
        uploader_id: r.uploader_id,
        created_at: r.created_at,
        url,
      }
    }),
  )

  const messages = messagesRes.status === 'fulfilled' ? (messagesRes.value.data ?? []) : []
  const events = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
  const milestones = milestonesRes.status === 'fulfilled' ? (milestonesRes.value.data ?? []) : []
  const scopeChanges = scopeRes.status === 'fulfilled' ? (scopeRes.value.data ?? []) : []

  const totalCents = Math.round(Number(order.total_amount || 0) * 100)
  const storedProgress = Number.isFinite(Number(order.progress)) ? Number(order.progress) : null
  const friendlyStatus = order.status === 'queued' ? 'pending'
    : order.status === 'created' ? 'created'
    : order.status === 'in_progress' ? 'active'
    : order.status === 'under_review' ? 'review'
    : order.status || 'pending'
  const fallbackProgress = friendlyStatus === 'completed' ? 100 : friendlyStatus === 'review' ? 90 : friendlyStatus === 'active' ? 50 : 0

  return {
    kind: 'ok',
    payload: {
      order: {
        id: order.id,
        orderNumber: order.order_number || null,
        service: primaryService?.title || order.requirements || 'Custom engagement',
        serviceId: primaryService?.id ?? null,
        category: primaryService?.category || null,
        icon: primaryService?.icon || null,
        description: primaryService?.description || null,
        productType: isTemplate ? 'template' : 'service',
        requirements: order.requirements || '',
        consultant: isTemplate
          ? 'Digital delivery'
          : consultant?.full_name || consultant?.email || (order.consultant_id ? 'Assigned consultant' : 'Awaiting assignment'),
        consultantId: order.consultant_id ?? null,
        consultantEmail: consultant?.email || null,
        consultantAvatarUrl: consultant?.avatar_url || null,
        status: friendlyStatus,
        rawStatus: order.status,
        date: order.created_at ? new Date(order.created_at).toLocaleDateString() : '—',
        createdAt: order.created_at || null,
        deadline: order.deadline ? new Date(order.deadline).toLocaleDateString() : '—',
        deadlineAt: order.deadline || null,
        progress: storedProgress ?? fallbackProgress,
        price: `$${dollarsFromCents(totalCents).toFixed(2)}`,
        totalCents,
        escrowStatus: order.escrow_status || 'held',
        escrowAmount: Math.round(Number(order.escrow_amount || 0) * 100),
        escrowReleasedAmount: Math.round(Number(order.escrow_released_amount || 0) * 100),
        escrowRefundedAmount: Math.round(Number(order.escrow_refunded_amount || 0) * 100),
        autoReleaseEligibleAt: order.auto_release_eligible_at || null,
        payoutStatus: order.payout_status || 'pending',
        termsAcceptedAt: order.terms_accepted_at || null,
        refundPolicyAcceptedAt: order.refund_policy_accepted_at || null,
      },
      items,
      services,
      files,
      messages: messages.reverse(), // oldest → newest for chronological render
      events,
      milestones,
      scopeChanges,
    },
  }
}
