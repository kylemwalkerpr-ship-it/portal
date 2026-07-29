/**
 * GET /api/student/orders
 * Server-side paginated, filterable, searchable list of the current student's
 * orders. Mirrors the admin orders pattern so the student dashboard scales to
 * hundreds of orders without loading them all into the browser.
 *
 * Query params:
 *   status     — pending | active | review | completed | cancelled | refunded | all
 *   escrow     — held | released | refunded | disputed | all
 *   product    — service | template | all
 *   q          — search across order_number, requirements, service title
 *   sort       — created_at | total_amount | deadline | progress
 *   dir        — asc | desc (default desc)
 *   page       — 1-indexed page (default 1)
 *   page_size  — default 25, max 100
 */
import { getCurrentStudent } from '@/lib/student'

function dollarsFromCents(cents: unknown) { return Number(cents || 0) / 100 }

const SORT_COLUMNS = ['created_at', 'total_amount', 'deadline', 'progress'] as const

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const { searchParams } = new URL(req.url)
  const statusParam   = searchParams.get('status')   || 'all'
  const escrowParam   = searchParams.get('escrow')   || 'all'
  const productParam  = searchParams.get('product')  || 'all'
  const q             = searchParams.get('q')?.trim() || ''
  const sort          = (SORT_COLUMNS as readonly string[]).includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'created_at'
  const dir           = searchParams.get('dir') === 'asc'
  const page          = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize      = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Map UI-friendly status names to DB status values
  const STATUS_MAP: Record<string, string[]> = {
    pending:   ['queued', 'created', 'pending'],
    active:    ['active', 'in_progress'],
    review:    ['review', 'under_review'],
    completed: ['completed'],
    cancelled: ['cancelled', 'canceled'],
    refunded:  ['refunded'],
  }

  // Column was renamed in DB to `delivery_deadline` — alias it back to
  // `deadline` so the existing client + return shape stays unchanged.
  // The sort-by-deadline option must use the real DB column name.
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
    // FTS on requirements (natural language); order_number is a code — keep ilike.
    const safeQ = q.replace(/[^a-zA-Z0-9\s'-]/g, ' ').trim().slice(0, 60)
    if (safeQ && safeQ.length >= 2) {
      qb = qb.or(`requirements.fts.${safeQ},order_number.ilike.%${q}%`)
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

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const orderRows = rows ?? []
  const total = count ?? 0
  const orderIds = orderRows.map(o => o.id)
  const consultantIds = Array.from(new Set(orderRows.map(o => o.consultant_id).filter(Boolean)))

  // Batch fetch the page's related rows in parallel
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

  // Apply product filter post-hydration (since product_type lives on service)
  const filtered = productParam !== 'all'
    ? orders.filter(o => o.productType === productParam)
    : orders

  return Response.json({
    orders: filtered,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = /CPU|timeout|abort|budget|exceeded|terminated/i.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
