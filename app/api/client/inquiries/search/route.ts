/**
 * GET /api/client/inquiries/search
 * Paginated, filterable, searchable inquiry list for the student-facing
 * "My Inquiries" page. Enriches each row with thread/offer counts so the
 * list view can render "3 attorneys responding · 1 offer" without an
 * N+1 round trip.
 *
 * Query params:
 *   status     — open | engaged | claimed | converted | closed | cancelled | all
 *   q          — search across case_type_label, country
 *   urgency    — urgent | high | normal | low
 *   from, to   — ISO date range on created_at
 *   sort       — created_at | status | urgency
 *   dir        — asc | desc (default desc)
 *   page, page_size — defaults 25 / 100 max
 */
import { requireClient } from '@/lib/clientAuth'

export async function GET(req: Request) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const statusF   = searchParams.get('status')   || 'all'
  const q         = searchParams.get('q')?.trim() || ''
  const urgency   = searchParams.get('urgency')  || ''
  const fromISO   = searchParams.get('from')     || ''
  const toISO     = searchParams.get('to')       || ''
  const sort      = ['created_at','status','urgency'].includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'created_at'
  const dir       = searchParams.get('dir') === 'asc'
  const page      = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize  = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Backfill anonymous inquiries submitted before sign-up
  await ctx.db
    .from('inquiries')
    .update({ client_profile_id: ctx.profileId })
    .eq('email', ctx.email)
    .is('client_profile_id', null)

  let qb = ctx.db
    .from('inquiries')
    .select('id, case_type_label, country, urgency, status, claimed_by_attorney_id, claimed_at, source, created_at', { count: 'exact' })
    .eq('client_profile_id', ctx.profileId)
    .neq('source', 'portal_attorney_chat')
    .order(sort, { ascending: dir })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (statusF !== 'all') qb = qb.eq('status', statusF)
  if (urgency)           qb = qb.eq('urgency', urgency)
  if (fromISO)           qb = qb.gte('created_at', fromISO)
  if (toISO)             qb = qb.lte('created_at', new Date(new Date(toISO).getTime() + 86_400_000).toISOString())
  if (q)                 qb = qb.or(`case_type_label.ilike.%${q}%,country.ilike.%${q}%`)

  let { data: rows, error: rowsErr, count } = await qb

  // Schema-pending or missing table — gracefully degrade
  if (rowsErr && /relation .* does not exist|schema cache/i.test(rowsErr.message || '')) {
    return Response.json({ inquiries: [], total: 0, page, page_size: pageSize, total_pages: 1, has_more: false, byStatus: {}, schema_pending: true })
  }
  if (rowsErr) return Response.json({ error: rowsErr.message }, { status: 500 })

  const list: any[] = rows ?? []
  const inquiryIds = list.map(i => i.id)

  // Enrichment: thread + offer counts per inquiry
  let threadMap: Record<string, number> = {}
  let offerMap:  Record<string, number> = {}
  let latestMsgMap: Record<string, string> = {}
  if (inquiryIds.length) {
    const [threadsRes, offersRes, msgsRes] = await Promise.all([
      ctx.db.from('inquiry_threads').select('inquiry_id, attorney_id').in('inquiry_id', inquiryIds),
      ctx.db.from('offers').select('inquiry_id, status').in('inquiry_id', inquiryIds),
      ctx.db.from('inquiry_messages').select('inquiry_id, created_at').in('inquiry_id', inquiryIds).order('created_at', { ascending: false }),
    ])
    const seenAttorneys = new Map<string, Set<string>>()
    for (const t of threadsRes.data ?? []) {
      const iid = (t as any).inquiry_id
      const aid = (t as any).attorney_id
      if (!seenAttorneys.has(iid)) seenAttorneys.set(iid, new Set())
      seenAttorneys.get(iid)!.add(aid)
    }
    for (const [iid, set] of seenAttorneys.entries()) threadMap[iid] = set.size

    for (const o of offersRes.data ?? []) {
      const iid = (o as any).inquiry_id
      const st = (o as any).status
      // Count active (pending) offers; declined/withdrawn don't help the student decide
      if (st === 'pending' || st === 'active' || !st) offerMap[iid] = (offerMap[iid] || 0) + 1
    }
    for (const m of msgsRes.data ?? []) {
      const iid = (m as any).inquiry_id
      if (!latestMsgMap[iid]) latestMsgMap[iid] = (m as any).created_at
    }
  }

  // byStatus universe count (independent of filters) for tab badges
  const byStatus: Record<string, number> = {}
  try {
    const { data: allRows } = await ctx.db
      .from('inquiries')
      .select('status')
      .eq('client_profile_id', ctx.profileId)
      .neq('source', 'portal_attorney_chat')
    for (const r of allRows ?? []) byStatus[(r as any).status] = (byStatus[(r as any).status] ?? 0) + 1
  } catch {}

  const enriched = list.map((row: any) => ({
    ...row,
    attorneys_responding: threadMap[row.id] || 0,
    pending_offers:       offerMap[row.id]  || 0,
    last_activity_at:     latestMsgMap[row.id] || row.created_at,
  }))

  return Response.json({
    inquiries: enriched,
    total: count ?? enriched.length,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil((count ?? enriched.length) / pageSize)),
    has_more: page * pageSize < (count ?? enriched.length),
    byStatus,
  })
}
