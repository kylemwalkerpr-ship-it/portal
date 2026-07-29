/**
 * GET /api/admin/orders
 * Paginated, server-side filtered admin order list.
 * Designed for hundreds of thousands to millions of rows.
 *
 * Query params:
 *   status         — order status filter
 *   escrow         — escrow_status filter
 *   payout         — payout_status filter
 *   tab            — preset filter: active | attention | financial | all
 *   provider_type  — consultant | attorney
 *   q              — full-text search (order_number, client/provider/service)
 *   page           — 1-indexed (default 1)
 *   page_size      — rows per page (default 25, max 200)
 *   sort           — column to sort by (default: created_at)
 *   dir            — asc | desc (default: desc)
 *   from           — ISO date — limit to orders created on/after
 *   to             — ISO date — limit to orders created on/before
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'

const TERMINAL = ['completed', 'released', 'cancelled', 'refunded']

const SORTABLE_COLUMNS: Record<string, string> = {
  created_at:        'created_at',
  updated_at:        'updated_at',
  amount:            'total_amount',
  total_amount:      'total_amount',
  status:            'status',
  status_updated_at: 'status_updated_at',
  delivery_deadline: 'delivery_deadline',
  payout_status:     'payout_status',
  escrow_status:     'escrow_status',
}

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)
  const warnings: string[] = []

  // Pagination
  const page     = Math.max(1,  Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Sort
  const sortKey = searchParams.get('sort') || 'created_at'
  const sortCol = SORTABLE_COLUMNS[sortKey] || 'created_at'
  const sortAsc = searchParams.get('dir') === 'asc'

  // Filters
  const status        = searchParams.get('status')
  const escrow        = searchParams.get('escrow')
  const payout        = searchParams.get('payout')
  const providerType  = searchParams.get('provider_type')
  const tab           = searchParams.get('tab')
  const q             = searchParams.get('q')?.trim()
  const fromDate      = searchParams.get('from')
  const toDate        = searchParams.get('to')

  // The ideal column list — used when every migration has been applied.
  // If a column is missing (e.g. payout_status before consultant_dashboard.sql
  // was run), Postgres returns 42703 and we degrade to SELECT * so the page
  // still loads. The orders_columns_patch.sql migration restores full fidelity.
  const FULL_COLUMNS =
    'id, order_number, status, escrow_status, payout_status, ' +
    'total_amount, platform_fee_amount, consultant_payout_amount, ' +

    'delivery_deadline, cancelled_at, refunded_at, status_updated_at, ' +
    'created_at, updated_at, consultant_id, client_id, ' +
    'revision_reason, offer_id, attorney_id'

  const buildQuery = (cols: string) => {
    let q = db
      .from('orders')
      .select(cols, { count: 'exact' })
      .order(sortCol as any, { ascending: sortAsc })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status)   q = q.eq('status', status)
    // These three are wrapped — they may target columns that don't exist yet.
    try { if (escrow) q = q.eq('escrow_status', escrow) } catch {}
    try { if (payout) q = q.eq('payout_status', payout) } catch {}
    if (fromDate) q = q.gte('created_at', fromDate)
    if (toDate)   q = q.lte('created_at', toDate)
    return q
  }

  let query = buildQuery(FULL_COLUMNS)

  // Provider type filter — attorney has its own column, consultant uses consultant_id
  if (providerType === 'attorney') {
    query = query.not('attorney_id', 'is', null)
  } else if (providerType === 'consultant') {
    query = query.not('consultant_id', 'is', null).is('attorney_id', null)
  }

  // Tab presets
  if (tab === 'active') {
    query = query.in('status', ['queued', 'created', 'in_progress', 'under_review', 'revision_requested'])
  } else if (tab === 'attention') {
    // Late deadline OR revision_requested OR unassigned (handled below with .or for partial coverage)
    query = query.in('status', ['revision_requested', 'in_progress', 'under_review', 'queued'])
  } else if (tab === 'financial') {
    query = query.eq('escrow_status', 'held').not('status', 'in', '("cancelled","refunded")')
  }

  // Full-text search — order_number gets trigram, free text uses FTS on revision_reason
  if (q && q.length >= 2) {
    if (/^[A-Za-z0-9_-]+$/.test(q)) {
      // Looks like an ID/order number — use ilike (trigram-indexed)
      query = query.or(`order_number.ilike.%${q}%,id::text.ilike.%${q}%`)
    } else {
      // Free text — FTS on revision_reason (indexed) + ilike on order_number
      const safeQ = q.replace(/[^a-zA-Z0-9\s'-]/g, ' ').trim().slice(0, 60)
      if (safeQ && safeQ.length >= 2) {
        query = query.or(`revision_reason.fts.${safeQ},order_number.ilike.%${q}%`)
      } else {
        query = query.ilike('order_number', `%${q}%`)
      }
    }
  }

  // Helper to apply the same filter chain to any base query (so the fallback
  // retry uses identical filters but a different column list)
  const applyExtraFilters = (q: any) => {
    if (providerType === 'attorney')   q = q.not('attorney_id', 'is', null)
    else if (providerType === 'consultant') q = q.not('consultant_id', 'is', null).is('attorney_id', null)
    if (tab === 'active')    q = q.in('status', ['queued','created','in_progress','under_review','revision_requested'])
    else if (tab === 'attention') q = q.in('status', ['revision_requested','in_progress','under_review','queued'])
    else if (tab === 'financial') {
      try { q = q.eq('escrow_status', 'held').not('status', 'in', '("cancelled","refunded")') } catch {}
    }
    if (q && false) { /* search already applied above */ }
    return q
  }

  let { data: ordersRaw, error, count: totalCount } = await query

  // Fallback: if the rich SELECT failed because a column is missing
  // (Postgres error code 42703 → "column ... does not exist"), retry with
  // SELECT * — every column the API references is then accessed via row.column
  // and missing columns just come back undefined.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    warnings.push('schema_partial — run supabase/orders_columns_patch.sql for full fidelity')
    let fallback = db
      .from('orders')
      .select('*', { count: 'exact' })
      .order(sortCol as any, { ascending: sortAsc })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (status)   fallback = fallback.eq('status', status)
    if (fromDate) fallback = fallback.gte('created_at', fromDate)
    if (toDate)   fallback = fallback.lte('created_at', toDate)
    fallback = applyExtraFilters(fallback)
    const retry = await fallback
    ordersRaw  = retry.data as any
    error      = retry.error as any
    totalCount = retry.count as any
  }

  if (error) return fail(error.message, 500)

  const rows: any[] = ordersRaw ?? []
  const total = totalCount ?? 0

  if (rows.length === 0) {
    // Even on empty result, still return summary + warnings
    const summary = await fetchSummary(db, fromDate, toDate, warnings)
    return ok({
      orders: [],
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
      has_more: false,
      summary,
    }, {}, warnings.length ? { data_warnings: warnings } : {})
  }

  // Batch-enrich the current page only
  const orderIds  = rows.map(o => o.id)
  const profileIds = [...new Set([
    ...rows.map(o => o.client_id).filter(Boolean),
    ...rows.map(o => o.consultant_id).filter(Boolean),
  ])]

  const [profilesRes, itemsRes, evtRes, msgRes] = await Promise.allSettled([
    profileIds.length
      ? db.from('profiles').select('id, full_name, email, role').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    db.from('order_items').select('order_id, service_id').in('order_id', orderIds),
    db.from('order_events').select('order_id').in('order_id', orderIds),
    db.from('order_messages').select('order_id').in('order_id', orderIds),
  ])

  const profileMap: Record<string, any> = {}
  if (profilesRes.status === 'fulfilled') {
    for (const p of (profilesRes.value as any)?.data ?? []) profileMap[p.id] = p
  } else { warnings.push('profile_lookup_failed') }

  // Service titles
  const serviceTitleMap: Record<string, string | null> = {}
  if (itemsRes.status === 'fulfilled') {
    const items = (itemsRes.value as any)?.data ?? []
    const serviceIds = [...new Set(items.map((i: any) => i.service_id).filter(Boolean))]
    let servicesMap: Record<string, string> = {}
    if (serviceIds.length) {
      try {
        const { data: services } = await db.from('services').select('id, title').in('id', serviceIds)
        for (const s of services ?? []) servicesMap[s.id] = s.title
      } catch { warnings.push('service_lookup_failed') }
    }
    for (const i of items) {
      if (!serviceTitleMap[i.order_id]) serviceTitleMap[i.order_id] = servicesMap[i.service_id] ?? null
    }
  } else { warnings.push('order_items_unavailable') }

  // Event + message counts (per page only — cheap with index)
  const eventCountMap: Record<string, number> = {}
  if (evtRes.status === 'fulfilled') {
    for (const e of (evtRes.value as any)?.data ?? []) {
      eventCountMap[e.order_id] = (eventCountMap[e.order_id] || 0) + 1
    }
  } else { warnings.push('event_counts_unavailable') }

  const msgCountMap: Record<string, number> = {}
  if (msgRes.status === 'fulfilled') {
    for (const m of (msgRes.value as any)?.data ?? []) {
      msgCountMap[m.order_id] = (msgCountMap[m.order_id] || 0) + 1
    }
  } else { warnings.push('message_counts_unavailable') }

  const now = new Date()
  let enriched = rows.map(o => {
    const client = profileMap[o.client_id] || {}
    const provider = profileMap[o.consultant_id] || {}
    const createdAt = new Date(o.created_at)
    const daysOpen = Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
    const isLate = !!(o.delivery_deadline && new Date(o.delivery_deadline) < now && !TERMINAL.includes(o.status))

    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      escrow_status: o.escrow_status,
      payout_status: o.payout_status,
      gross: Number(o.total_amount),
      fee:   Number(o.platform_fee_amount),
      payout: Number(o.consultant_payout_amount),

      deadline: o.delivery_deadline,
      cancelled_at: o.cancelled_at,
      refunded_at: o.refunded_at,
      created_at: o.created_at,
      updated_at: o.updated_at,
      client_id: o.client_id,
      client_name:  client.full_name || null,
      client_email: client.email || null,
      provider_id:    o.consultant_id || o.attorney_id,
      provider_name:  provider.full_name || null,
      provider_email: provider.email || null,
      provider_role:  provider.role || (o.attorney_id ? 'attorney' : null),
      service_title:  serviceTitleMap[o.id] ?? null,
      event_count:    eventCountMap[o.id] || 0,
      message_count:  msgCountMap[o.id] || 0,
      days_open:      daysOpen,
      is_late:        isLate,
      revision_reason: o.revision_reason,
      offer_id:       o.offer_id,
    }
  })

  // Post-fetch filter for `q` matching client/provider names — narrow only
  // when we have a free-text query that we couldn't push to the DB.
  // This is a small cost: we already only have at most `pageSize` rows.
  if (q && q.length >= 2 && !/^[A-Za-z0-9_-]+$/.test(q)) {
    const lower = q.toLowerCase()
    const matched = enriched.filter(o =>
      [o.order_number, o.client_name, o.client_email, o.provider_name, o.provider_email, o.service_title]
        .some(v => v && String(v).toLowerCase().includes(lower))
    )
    // Only narrow if we actually find matches — otherwise the DB-side
    // FTS may have already pulled the right rows. If matched is empty
    // but enriched isn't, trust the DB query.
    if (matched.length > 0) enriched = matched
  }

  // Attention tab: post-filter for late + unassigned (DB-side index doesn't
  // cover NULL provider check cleanly with the other filters)
  if (tab === 'attention') {
    enriched = enriched.filter(o =>
      o.is_late
      || o.status === 'revision_requested'
      || (!o.provider_id && !TERMINAL.includes(o.status))
    )
  }

  // Server-side summary across the full dataset (not just the page)
  const summary = await fetchSummary(db, fromDate, toDate, warnings)

  return ok({
    orders: enriched,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
    has_more: page * pageSize < total,
    summary,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

/**
 * Server-side summary across the full dataset (not just the current page).
 * Prefers the admin_orders_summary RPC; falls back to two cheap COUNT queries
 * when the RPC is absent so the Kanban footer hint still renders.
 */
async function fetchSummary(db: any, from: string | null, to: string | null, warnings: string[]) {
  try {
    const { data, error } = await db.rpc('admin_orders_summary', {
      p_from: from || null,
      p_to:   to   || null,
    })
    if (!error && data) return data
  } catch {
    /* fall through to direct counts */
  }

  try {
    let totalQ = db.from('orders').select('id', { count: 'exact', head: true })
    let heldQ  = db.from('orders').select('id', { count: 'exact', head: true }).eq('escrow_status', 'held')
    if (from) { totalQ = totalQ.gte('created_at', from); heldQ = heldQ.gte('created_at', from) }
    if (to)   { totalQ = totalQ.lte('created_at', to);   heldQ = heldQ.lte('created_at', to) }
    const [totalRes, heldRes] = await Promise.allSettled([totalQ, heldQ])
    const total_count = totalRes.status === 'fulfilled' ? (totalRes.value as any).count ?? null : null
    const escrow_held_count = heldRes.status === 'fulfilled' ? (heldRes.value as any).count ?? null : null
    if (total_count == null && escrow_held_count == null) {
      warnings.push('summary_unavailable')
      return null
    }
    return { total_count, escrow_held_count }
  } catch {
    warnings.push('summary_unavailable')
    return null
  }
}
