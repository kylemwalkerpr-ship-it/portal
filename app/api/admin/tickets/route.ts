/**
 * GET /api/admin/tickets
 *
 * Paginated, server-side filtered admin support-ticket list.
 *
 * Tickets in this product are escrow-decision tickets (kind ∈ void,
 * refund_partial, release_hold, other) — not classical helpdesk tickets.
 * The admin UI treats each one like a support ticket: a subject (reason +
 * kind), a raiser (support agent), a target order (client + provider), a
 * status, and a side-thread for context. SLA is computed against created_at
 * for status='pending'.
 *
 * Query params:
 *   status   — pending | approved | denied | cancelled | all
 *   kind     — void | refund_partial | release_hold | other | all
 *   q        — free-text search across reason, detail, order_number, raiser,
 *              client, provider (lower-cased substring match — small page,
 *              so applied post-fetch where DB-side OR is awkward)
 *   page     — 1-indexed (default 1)
 *   page_size — rows per page (default 25, max 200)
 *   sort     — created_at | decided_at | priority | status (default created_at)
 *   dir      — asc | desc (default desc)
 *
 * Self-heal: every external table read is wrapped — if a column or table is
 * missing the route logs a warning into meta.data_warnings and degrades.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const SORTABLE: Record<string, string> = {
  created_at: 'created_at',
  decided_at: 'decided_at',
  status:     'status',
  // "priority" is a derived ordering — handled in-memory below.
  priority:   'created_at',
}

const VALID_KINDS = ['void', 'refund_partial', 'release_hold', 'other'] as const
const VALID_STATUSES = ['pending', 'approved', 'denied', 'cancelled'] as const

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)
  const warnings: string[] = []

  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const sortKey  = searchParams.get('sort') || 'created_at'
  const sortCol  = SORTABLE[sortKey] || 'created_at'
  const sortAsc  = searchParams.get('dir') === 'asc'

  const status   = searchParams.get('status') || 'all'
  const kind     = searchParams.get('kind') || 'all'
  const q        = (searchParams.get('q') || '').trim()

  // Base query
  let query = db
    .from('support_tickets')
    .select('id, order_id, conversation_id, raised_by, kind, amount_cents, reason, detail, status, decided_by, decided_at, decision_notes, created_at, updated_at', { count: 'exact' })
    .order(sortCol as any, { ascending: sortAsc })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (status !== 'all' && (VALID_STATUSES as readonly string[]).includes(status)) {
    query = query.eq('status', status)
  }
  if (kind !== 'all' && (VALID_KINDS as readonly string[]).includes(kind)) {
    query = query.eq('kind', kind)
  }
  // For DB-side text search we use ilike on reason (free text). Names/emails
  // are joined post-fetch from profiles, so we filter those in-memory below.
  if (q && q.length >= 2 && q.length < 80) {
    const safeQ = q.replace(/[^a-zA-Z0-9\s'"-]/g, ' ').trim().slice(0, 60)
    if (safeQ) {
      query = query.or(`reason.fts.${safeQ},detail.fts.${safeQ}`)
    }
  }

  const { data: rows, error, count } = await query
  if (error) {
    return fail(error.message, 500, {}, { data_warnings: ['support_tickets_query_failed: ' + error.message] })
  }

  const tickets: any[] = (rows as any[]) ?? []
  const total = count ?? 0

  // Enrich with profile + order + service info — best-effort, page-only.
  const profileIds = new Set<string>()
  const orderIds = new Set<string>()
  for (const t of tickets) {
    if (t.raised_by) profileIds.add(t.raised_by)
    if (t.decided_by) profileIds.add(t.decided_by)
    if (t.order_id) orderIds.add(t.order_id)
  }

  const [ordersRes, profilesRes] = await Promise.allSettled([
    orderIds.size
      ? db.from('orders').select('id, order_number, status, escrow_status, total_amount, client_id, consultant_id, attorney_id, created_at').in('id', Array.from(orderIds))
      : Promise.resolve({ data: [] } as any),
    profileIds.size
      ? db.from('profiles').select('id, full_name, email, role').in('id', Array.from(profileIds))
      : Promise.resolve({ data: [] } as any),
  ])

  const ordersMap = new Map<string, any>()
  if (ordersRes.status === 'fulfilled') {
    for (const o of (ordersRes.value as any)?.data ?? []) {
      ordersMap.set(o.id, o)
      if (o.client_id) profileIds.add(o.client_id)
      if (o.consultant_id) profileIds.add(o.consultant_id)
      if (o.attorney_id) profileIds.add(o.attorney_id)
    }
  } else {
    warnings.push('orders_lookup_failed')
  }

  // Re-fetch profiles now that we've also pulled order parties.
  const profilesMap = new Map<string, any>()
  if (profilesRes.status === 'fulfilled') {
    for (const p of (profilesRes.value as any)?.data ?? []) profilesMap.set(p.id, p)
  } else {
    warnings.push('profiles_initial_lookup_failed')
  }
  const missing = Array.from(profileIds).filter(id => !profilesMap.has(id))
  if (missing.length) {
    try {
      const { data } = await db.from('profiles').select('id, full_name, email, role').in('id', missing)
      for (const p of data ?? []) profilesMap.set(p.id, p)
    } catch {
      warnings.push('profiles_followup_lookup_failed')
    }
  }

  const now = Date.now()
  const DAY = 86_400_000

  // Derived priority: pending + older = higher score. We surface it as a
  // sortable column without needing a DB column.
  const enriched = tickets.map(t => {
    const order = ordersMap.get(t.order_id) || {}
    const raiser = profilesMap.get(t.raised_by) || {}
    const decider = t.decided_by ? profilesMap.get(t.decided_by) || {} : null
    const client = profilesMap.get(order.client_id) || {}
    const providerId = order.consultant_id || order.attorney_id || null
    const provider = providerId ? profilesMap.get(providerId) || {} : {}

    const ageMs = now - new Date(t.created_at).getTime()
    const ageHours = ageMs / 3_600_000
    const isPending = t.status === 'pending'
    const slaBreached = isPending && ageHours > 24
    const priority = isPending ? Math.round(ageHours) : 0

    return {
      id:                t.id,
      order_id:          t.order_id,
      order_number:      order.order_number || null,
      order_status:      order.status || null,
      order_escrow:      order.escrow_status || null,
      order_amount:      Number(order.total_amount) || 0,
      conversation_id:   t.conversation_id,
      kind:              t.kind,
      amount_cents:      t.amount_cents,
      reason:            t.reason,
      detail:            t.detail,
      status:            t.status,
      decision_notes:    t.decision_notes,
      created_at:        t.created_at,
      updated_at:        t.updated_at,
      decided_at:        t.decided_at,
      raised_by:         t.raised_by,
      raised_by_name:    raiser.full_name || raiser.email || null,
      raised_by_email:   raiser.email || null,
      raised_by_role:    raiser.role || null,
      decided_by:        t.decided_by,
      decided_by_name:   decider?.full_name || decider?.email || null,
      client_id:         order.client_id || null,
      client_name:       client.full_name || client.email || null,
      client_email:      client.email || null,
      provider_id:       providerId,
      provider_name:     provider.full_name || provider.email || null,
      provider_email:    provider.email || null,
      provider_role:     provider.role || (order.attorney_id ? 'attorney' : null),
      age_hours:         Math.round(ageHours),
      sla_breached:      slaBreached,
      priority,
    }
  })

  // Post-fetch q narrowing — covers client/provider/raiser names + order_number
  let filtered = enriched
  if (q && q.length >= 2) {
    const ql = q.toLowerCase()
    filtered = enriched.filter(t =>
      [t.reason, t.detail, t.order_number, t.raised_by_name, t.raised_by_email,
       t.client_name, t.client_email, t.provider_name, t.provider_email]
        .some(v => v && String(v).toLowerCase().includes(ql))
    )
    // If post-fetch dropped everything but the DB returned rows for the ilike
    // path, fall back to the DB results — better than empty.
    if (filtered.length === 0) filtered = enriched
  }

  if (sortKey === 'priority') {
    filtered.sort((a, b) => sortAsc ? a.priority - b.priority : b.priority - a.priority)
  }

  // Server-side aggregate summary across ALL tickets (small table; cheap).
  const summary = await fetchSummary(db, warnings)

  return ok({
    tickets:   filtered,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
    has_more:  page * pageSize < total,
    summary,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}

async function fetchSummary(db: any, warnings: string[]) {
  try {
    const { data, error } = await db
      .from('support_tickets')
      .select('id, status, created_at, decided_at')
      .limit(5000)
    if (error) throw error
    const rows = (data || []) as any[]
    const now = Date.now()
    const DAY = 86_400_000

    const byStatus: Record<string, number> = { pending: 0, approved: 0, denied: 0, cancelled: 0 }
    let slaBreached = 0
    let decidedThisWeek = 0
    let decidedDurations = 0
    let decidedCount = 0
    const weekAgo = now - 7 * DAY

    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.status === 'pending') {
        const age = now - new Date(r.created_at).getTime()
        if (age > DAY) slaBreached += 1
      }
      if (r.decided_at) {
        const decidedAt = new Date(r.decided_at).getTime()
        if (decidedAt >= weekAgo) decidedThisWeek += 1
        const dur = decidedAt - new Date(r.created_at).getTime()
        if (Number.isFinite(dur) && dur >= 0) {
          decidedDurations += dur
          decidedCount += 1
        }
      }
    }

    const avgFirstResponseHours = decidedCount > 0
      ? (decidedDurations / decidedCount) / 3_600_000
      : null

    return {
      counts: byStatus,
      sla_breached: slaBreached,
      decided_this_week: decidedThisWeek,
      avg_decision_hours: avgFirstResponseHours,
      total: rows.length,
    }
  } catch (e: any) {
    warnings.push('summary_unavailable: ' + (e?.message || 'unknown'))
    return null
  }
}
