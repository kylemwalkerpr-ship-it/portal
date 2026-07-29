/**
 * GET /api/attorney/orders/search
 * Paginated, status-tabbed, searchable list of orders where the signed-in
 * attorney is the consultant_id. Mirrors /api/student/orders shape so the
 * UI patterns line up.
 *
 * Query params:
 *   status     — pending | active | review | completed | cancelled | refunded | disputed | all
 *   escrow     — held | released | refunded | disputed | all
 *   q          — order_number / requirements ILIKE
 *   from, to   — ISO date range on created_at
 *   sort       — created_at | deadline | total_amount | attorney_fee | progress
 *   dir        — asc | desc (default desc)
 *   page       — 1-indexed (default 1)
 *   page_size  — default 25, max 100
 */
import { requireAttorney } from '@/lib/attorneyAuth'

const SORT_COLS = ['created_at', 'deadline', 'total_amount', 'attorney_fee', 'progress'] as const
const STATUS_MAP: Record<string, string[]> = {
  pending:   ['queued', 'created', 'pending'],
  active:    ['active', 'in_progress'],
  review:    ['review', 'under_review'],
  completed: ['completed'],
  cancelled: ['cancelled', 'canceled'],
  refunded:  ['refunded'],
  disputed:  ['disputed'],
}

export async function GET(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const statusF   = searchParams.get('status')   || 'all'
  const escrowF   = searchParams.get('escrow')   || 'all'
  const q         = searchParams.get('q')?.trim() || ''
  const fromISO   = searchParams.get('from')     || ''
  const toISO     = searchParams.get('to')       || ''
  const sort      = (SORT_COLS as readonly string[]).includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'created_at'
  const dir       = searchParams.get('dir') === 'asc'
  const page      = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize  = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // `deadline` is a SELECT alias for the real `delivery_deadline` column —
  // PostgREST .order() needs the real column name, so map it (otherwise the
  // query 400s on "column orders.deadline does not exist" and falls back to a
  // wasteful full-table re-query that silently drops the sort).
  const sortColumn = sort === 'deadline' ? 'delivery_deadline' : sort

  let qb = ctx.db
    .from('orders')
    .select('id, order_number, client_id, status, escrow_status, total_amount, attorney_fee, platform_fee, progress, deadline:delivery_deadline, created_at, completed_at, source_offer_id, offer_id, payout_status, requirements', { count: 'exact' })
    .eq('consultant_id', ctx.profileId)
    .order(sortColumn, { ascending: dir, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (statusF !== 'all') {
    const mapped = STATUS_MAP[statusF] || [statusF]
    qb = qb.in('status', mapped)
  }
  if (escrowF !== 'all') qb = qb.eq('escrow_status', escrowF)
  if (fromISO)           qb = qb.gte('created_at', fromISO)
  if (toISO)             qb = qb.lte('created_at', new Date(new Date(toISO).getTime() + 86_400_000).toISOString())
  if (q && q.length >= 2) {
    // FTS on requirements (natural language); order_number is a code — keep ilike.
    const safeQ = q.replace(/[^a-zA-Z0-9\s'-]/g, ' ').trim().slice(0, 60)
    if (safeQ && safeQ.length >= 2) {
      qb = qb.or(`requirements.fts.${safeQ},order_number.ilike.%${q}%`)
    } else {
      qb = qb.or(`order_number.ilike.%${q}%`)
    }
  }

  let { data: rows, error: rowsErr, count } = await qb

  // Self-heal if a newer column (e.g. progress, payout_status) is missing.
  if (rowsErr && /column .* does not exist/i.test(rowsErr.message || '')) {
    const r = await ctx.db
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('consultant_id', ctx.profileId)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    rows = r.data as any
    rowsErr = r.error as any
    count = r.count as any
  }
  if (rowsErr) return Response.json({ error: rowsErr.message }, { status: 500 })

  const orderRows = rows ?? []
  const total = count ?? orderRows.length

  // Hydrate clients, offer titles, message counts, file counts
  const clientIds = Array.from(new Set(orderRows.map((o: any) => o.client_id).filter(Boolean)))
  const offerIds = Array.from(new Set(orderRows.map((o: any) => o.source_offer_id).filter(Boolean)))
  const unifiedIds = Array.from(new Set(orderRows.map((o: any) => o.offer_id).filter(Boolean)))
  const orderIds = orderRows.map((o: any) => o.id)

  const [profilesRes, offersRes, unifiedRes, msgsRes, filesRes] = await Promise.all([
    clientIds.length ? ctx.db.from('profiles').select('id, full_name, email, avatar_url').in('id', clientIds) : Promise.resolve({ data: [] }),
    offerIds.length ? ctx.db.from('attorney_offers').select('id, title').in('id', offerIds) : Promise.resolve({ data: [] }),
    unifiedIds.length ? ctx.db.from('offers').select('id, title').in('id', unifiedIds) : Promise.resolve({ data: [] }),
    orderIds.length ? ctx.db.from('order_messages').select('order_id, sender_role, created_at, body').in('order_id', orderIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    orderIds.length ? ctx.db.from('order_files').select('order_id').in('order_id', orderIds) : Promise.resolve({ data: [] }),
  ])

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const offerById   = new Map((offersRes.data ?? []).map((o: any) => [o.id, o]))
  const unifiedById = new Map((unifiedRes.data ?? []).map((o: any) => [o.id, o]))
  const fileCount = new Map<string, number>()
  for (const f of filesRes.data ?? []) fileCount.set((f as any).order_id, (fileCount.get((f as any).order_id) || 0) + 1)
  const lastMsg = new Map<string, { at: string; from: string; body: string }>()
  const unreadFromClient = new Map<string, number>()
  for (const m of msgsRes.data ?? []) {
    const oid = (m as any).order_id
    if (!lastMsg.has(oid)) {
      lastMsg.set(oid, { at: (m as any).created_at, from: (m as any).sender_role || 'client', body: String((m as any).body || '').slice(0, 120) })
    }
    if ((m as any).sender_role === 'client') {
      const age = Date.now() - new Date((m as any).created_at).getTime()
      if (age < 30 * 86_400_000) unreadFromClient.set(oid, (unreadFromClient.get(oid) || 0) + 1)
    }
  }

  const orders = orderRows.map((o: any) => {
    const client: any = o.client_id ? profileById.get(o.client_id) : null
    const offer: any = o.source_offer_id ? offerById.get(o.source_offer_id) : o.offer_id ? unifiedById.get(o.offer_id) : null
    const status = o.status === 'queued' ? 'pending'
      : o.status === 'created' ? 'created'
      : o.status === 'in_progress' ? 'active'
      : o.status === 'under_review' ? 'review'
      : o.status || 'pending'
    const storedProgress = Number.isFinite(Number(o.progress)) ? Number(o.progress) : null
    const fallbackProgress = status === 'completed' ? 100 : status === 'review' ? 90 : status === 'active' ? 50 : 10

    const deadlineMs = o.deadline ? new Date(o.deadline).getTime() : null
    const overdue = deadlineMs ? deadlineMs < Date.now() && status !== 'completed' : false

    return {
      id: o.id,
      orderNumber: o.order_number || null,
      title: offer?.title || o.requirements || 'Custom engagement',
      clientName: client?.full_name || client?.email || 'Client',
      clientEmail: client?.email || null,
      clientAvatar: client?.avatar_url || null,
      status,
      rawStatus: o.status,
      escrowStatus: o.escrow_status || 'held',
      payoutStatus: o.payout_status || 'pending',
      total:        Number(o.total_amount || 0),
      attorneyFee:  Number(o.attorney_fee || 0),
      platformFee:  Number(o.platform_fee || 0),
      progress:     storedProgress ?? fallbackProgress,
      createdAt:    o.created_at,
      deadlineAt:   o.deadline || null,
      completedAt:  o.completed_at || null,
      overdue,
      fileCount:    fileCount.get(o.id) || 0,
      unreadFromClient: unreadFromClient.get(o.id) || 0,
      lastMessage:  lastMsg.get(o.id) || null,
    }
  })

  return Response.json({
    orders,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  })
}
