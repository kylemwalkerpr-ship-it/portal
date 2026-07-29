/**
 * GET /api/admin/escrow
 * Paginated escrow list for admin.
 *
 * Query params:
 *   state      — held | partial_released | released | disputed | frozen | refunded | auto_release_ready | all (default held)
 *   q          — search by order_number, client, provider name/email
 *   page       — 1-indexed (default 1)
 *   page_size  — rows per page (default 25, max 200)
 *   sort       — escrow_amount | auto_release_eligible_at | status_updated_at | created_at
 *   dir        — asc | desc (default desc)
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'

const SORTABLE_COLUMNS: Record<string, string> = {
  escrow_amount:            'escrow_amount',
  auto_release_eligible_at: 'auto_release_eligible_at',
  status_updated_at:        'status_updated_at',
  created_at:               'created_at',
}

const ESCROW_STATES = ['held', 'partial_released', 'released', 'disputed', 'frozen', 'refunded']

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

  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))

  const sortKey = searchParams.get('sort') || 'created_at'
  const sortCol = SORTABLE_COLUMNS[sortKey] || 'created_at'
  const sortAsc = searchParams.get('dir') === 'asc'

  const state = (searchParams.get('state') || 'held').toLowerCase()
  const q     = searchParams.get('q')?.trim()

  let query = db
    .from('orders')
    .select(
      'id, order_number, status, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, ' +
      'total_amount, platform_fee_amount, consultant_payout_amount, auto_release_eligible_at, ' +
      'escrow_disputed_at, escrow_frozen_at, escrow_dispute_reason, escrow_frozen_reason, ' +
      'client_id, consultant_id, attorney_id, status_updated_at, created_at, updated_at',
      { count: 'exact' }
    )
    .order(sortCol as any, { ascending: sortAsc })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (state === 'auto_release_ready') {
    query = query.eq('escrow_status', 'held').lte('auto_release_eligible_at', new Date().toISOString())
  } else if (ESCROW_STATES.includes(state)) {
    query = query.eq('escrow_status', state)
  } else if (state !== 'all') {
    // unknown state — default to held
    query = query.eq('escrow_status', 'held')
  }

  if (q && q.length >= 2 && /^[A-Za-z0-9_-]+$/.test(q)) {
    query = query.or(`order_number.ilike.%${q}%,id::text.ilike.%${q}%`)
  } else if (q && q.length >= 2) {
    query = query.ilike('order_number', `%${q}%`)
  }

  let { data: ordersRaw, error, count: totalCount } = await query as any

  // Self-heal: if a newer escrow column is missing, retry with SELECT * so
  // missing values come back as undefined instead of 500-ing the whole page.
  // Run supabase/orders_escrow_columns_patch.sql to restore full fidelity.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    warnings.push('schema_partial — run supabase/orders_escrow_columns_patch.sql for full fidelity')
    let fb = db.from('orders').select('*', { count: 'exact' })
      .order(sortCol as any, { ascending: sortAsc })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (state === 'auto_release_ready') {
      fb = fb.eq('escrow_status', 'held')
    } else if (ESCROW_STATES.includes(state)) {
      fb = fb.eq('escrow_status', state)
    }
    if (q && q.length >= 2) fb = fb.ilike('order_number', `%${q}%`)
    const retry = await fb as any
    ordersRaw = retry.data
    error = retry.error
    totalCount = retry.count
  }

  if (error) return fail(error.message, 500)

  const rows: any[] = ordersRaw ?? []
  const total = totalCount ?? 0

  // Fetch summary regardless
  const summary = await fetchSummary(db, warnings)

  if (rows.length === 0) {
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

  const orderIds   = rows.map(o => o.id)
  const profileIds = [...new Set([
    ...rows.map(o => o.client_id).filter(Boolean),
    ...rows.map(o => o.consultant_id).filter(Boolean),
    ...rows.map(o => o.attorney_id).filter(Boolean),
  ])]

  const [profilesRes, milestonesRes, scopeRes] = await Promise.allSettled([
    profileIds.length
      ? db.from('profiles').select('id, full_name, email, role').in('id', profileIds)
      : Promise.resolve({ data: [] }),
    db.from('order_milestones').select('order_id, status').in('order_id', orderIds),
    db.from('order_scope_changes').select('order_id, status').in('order_id', orderIds).eq('status', 'pending'),
  ])

  const profileMap: Record<string, any> = {}
  if (profilesRes.status === 'fulfilled') {
    for (const p of ((profilesRes.value as any)?.data ?? []) as any[]) profileMap[p.id] = p
  } else { warnings.push('profile_lookup_failed') }

  const milestoneCountMap: Record<string, number> = {}
  if (milestonesRes.status === 'fulfilled') {
    for (const m of ((milestonesRes.value as any)?.data ?? []) as any[]) {
      milestoneCountMap[m.order_id] = (milestoneCountMap[m.order_id] || 0) + 1
    }
  } else { warnings.push('milestone_counts_unavailable') }

  const scopeCountMap: Record<string, number> = {}
  if (scopeRes.status === 'fulfilled') {
    for (const s of ((scopeRes.value as any)?.data ?? []) as any[]) {
      scopeCountMap[s.order_id] = (scopeCountMap[s.order_id] || 0) + 1
    }
  } else { warnings.push('scope_changes_unavailable') }

  const now = Date.now()
  const enriched = rows.map(o => {
    const client = profileMap[o.client_id] || {}
    const providerId = o.consultant_id || o.attorney_id
    const provider = profileMap[providerId] || {}
    const sinceTs = new Date(o.status_updated_at || o.created_at).getTime()
    const daysInEscrow = Math.floor((now - sinceTs) / 86400000)

    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      escrow_status: o.escrow_status,
      escrow_amount: Number(o.escrow_amount || 0),
      escrow_released_amount: Number(o.escrow_released_amount || 0),
      escrow_refunded_amount: Number(o.escrow_refunded_amount || 0),
      total_amount: Number(o.total_amount || 0),
      platform_fee_amount: Number(o.platform_fee_amount || 0),
      consultant_payout_amount: Number(o.consultant_payout_amount || 0),
      auto_release_eligible_at: o.auto_release_eligible_at,
      escrow_disputed_at: o.escrow_disputed_at,
      escrow_frozen_at: o.escrow_frozen_at,
      escrow_dispute_reason: o.escrow_dispute_reason,
      escrow_frozen_reason: o.escrow_frozen_reason,
      client_id: o.client_id,
      client_name:  client.full_name || null,
      client_email: client.email || null,
      provider_id: providerId,
      provider_name:  provider.full_name || null,
      provider_email: provider.email || null,
      provider_role:  provider.role || (o.attorney_id ? 'attorney' : 'consultant'),
      status_updated_at: o.status_updated_at,
      created_at: o.created_at,
      updated_at: o.updated_at,
      days_in_escrow: daysInEscrow,
      milestone_count: milestoneCountMap[o.id] || 0,
      open_scope_change_count: scopeCountMap[o.id] || 0,
    }
  })

  // Post-fetch filter for q matching names — narrow page when q present and not pure id
  let final = enriched
  if (q && q.length >= 2 && !/^[A-Za-z0-9_-]+$/.test(q)) {
    const lower = q.toLowerCase()
    const matched = enriched.filter(o =>
      [o.order_number, o.client_name, o.client_email, o.provider_name, o.provider_email]
        .some(v => v && String(v).toLowerCase().includes(lower))
    )
    if (matched.length > 0) final = matched
  }

  return ok({
    orders: final,
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

async function fetchSummary(db: any, warnings: string[]) {
  try {
    const { data, error } = await db.rpc('admin_escrow_summary')
    if (error) throw error
    return data
  } catch {
    warnings.push('summary_rpc_unavailable')
    return null
  }
}
