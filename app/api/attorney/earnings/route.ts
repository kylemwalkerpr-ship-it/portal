/**
 * GET /api/attorney/earnings
 * Paginated, filterable payout/earnings ledger. Each completed order is
 * one ledger entry (purchase income); refunds/clawbacks are surfaced as
 * negative-signed rows.
 *
 * Query params:
 *   status    — transferred | pending | failed | refunded | all
 *   q         — search across order_number, client_name, title
 *   from, to  — ISO date range on completed_at
 *   sort      — completed_at | attorney_fee | total_amount | created_at
 *   dir       — asc | desc (default desc)
 *   page      — 1-indexed (default 1)
 *   page_size — default 25, max 100
 *
 * Format: ?format=csv streams a CSV download honouring current filters.
 */
import { requireAttorney } from '@/lib/attorneyAuth'

const SORT_COLS = ['completed_at', 'attorney_fee', 'total_amount', 'created_at'] as const

export async function GET(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const statusF   = searchParams.get('status')  || 'all'
  const q         = searchParams.get('q')?.trim() || ''
  const fromISO   = searchParams.get('from')    || ''
  const toISO     = searchParams.get('to')      || ''
  const sort      = (SORT_COLS as readonly string[]).includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'completed_at'
  const dir       = searchParams.get('dir') === 'asc'
  const page      = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize  = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const format    = (searchParams.get('format') || 'json').toLowerCase()

  let qb = ctx.db
    .from('orders')
    .select('id, order_number, client_id, status, escrow_status, total_amount, attorney_fee, platform_fee, created_at, completed_at, payout_status, refunded_amount, refunded_at, source_offer_id, offer_id', { count: 'exact' })
    .eq('consultant_id', ctx.profileId)
    .order(sort, { ascending: dir, nullsFirst: false })

  if (statusF === 'transferred') qb = qb.eq('payout_status', 'transferred')
  if (statusF === 'pending')     qb = qb.not('payout_status', 'eq', 'transferred').not('payout_status', 'eq', 'failed').not('payout_status', 'eq', 'refunded')
  if (statusF === 'failed')      qb = qb.eq('payout_status', 'failed')
  if (statusF === 'refunded')    qb = qb.eq('payout_status', 'refunded')
  if (fromISO)                   qb = qb.gte('completed_at', fromISO)
  if (toISO)                     qb = qb.lte('completed_at', new Date(new Date(toISO).getTime() + 86_400_000).toISOString())
  if (q && q.length >= 2)        qb = qb.ilike('order_number', `%${q}%`)

  // For pagination we limit at the DB; we'll apply paging when no q searches client name
  qb = qb.range((page - 1) * pageSize, page * pageSize - 1)

  let { data: rows, error: rowsErr, count } = await qb
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

  // Hydrate client names + offer titles for the slice
  const clientIds = Array.from(new Set(orderRows.map((o: any) => o.client_id).filter(Boolean)))
  const offerIds = Array.from(new Set(orderRows.map((o: any) => o.source_offer_id).filter(Boolean)))
  const unifiedIds = Array.from(new Set(orderRows.map((o: any) => o.offer_id).filter(Boolean)))

  const [profilesRes, offersRes, unifiedRes] = await Promise.all([
    clientIds.length ? ctx.db.from('profiles').select('id, full_name, email').in('id', clientIds) : Promise.resolve({ data: [] }),
    offerIds.length ? ctx.db.from('attorney_offers').select('id, title').in('id', offerIds) : Promise.resolve({ data: [] }),
    unifiedIds.length ? ctx.db.from('offers').select('id, title').in('id', unifiedIds) : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const offerById = new Map((offersRes.data ?? []).map((o: any) => [o.id, o]))
  const unifiedById = new Map((unifiedRes.data ?? []).map((o: any) => [o.id, o]))

  const ledger = orderRows.map((o: any) => {
    const client: any = o.client_id ? profileById.get(o.client_id) : null
    const offer: any = o.source_offer_id ? offerById.get(o.source_offer_id) : o.offer_id ? unifiedById.get(o.offer_id) : null
    return {
      id: o.id,
      order_number: o.order_number || null,
      title: offer?.title || 'Custom engagement',
      client_name: client?.full_name || client?.email || 'Client',
      status: o.status,
      escrow_status: o.escrow_status || 'held',
      payout_status: o.payout_status || 'pending',
      total: Number(o.total_amount || 0),
      attorney_fee: Number(o.attorney_fee || 0),
      platform_fee: Number(o.platform_fee || 0),
      refunded_amount: Number(o.refunded_amount || 0),
      refunded_at: o.refunded_at || null,
      created_at: o.created_at,
      completed_at: o.completed_at || null,
    }
  })

  // Optional q search across hydrated client_name/title
  let filtered = ledger
  if (q && q.length >= 2) {
    const qLower = q.toLowerCase()
    filtered = filtered.filter(l =>
      (l.order_number || '').toLowerCase().includes(qLower) ||
      (l.title || '').toLowerCase().includes(qLower) ||
      (l.client_name || '').toLowerCase().includes(qLower)
    )
  }

  if (format === 'csv') {
    const header = ['Date', 'Order #', 'Client', 'Title', 'Status', 'Payout status', 'Total', 'Your fee', 'Platform fee', 'Refunded'].join(',')
    const lines = filtered.map(l => [
      l.completed_at || l.created_at,
      l.order_number || l.id,
      `"${(l.client_name || '').replace(/"/g, '""')}"`,
      `"${(l.title || '').replace(/"/g, '""')}"`,
      l.status,
      l.payout_status,
      l.total.toFixed(2),
      l.attorney_fee.toFixed(2),
      l.platform_fee.toFixed(2),
      l.refunded_amount.toFixed(2),
    ].join(','))
    return new Response([header, ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="yousafe-attorney-earnings-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  return Response.json({
    ledger: filtered,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
  })
}
