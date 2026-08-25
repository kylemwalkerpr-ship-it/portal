/**
 * GET /api/attorney/inquiries/search
 * Paginated, faceted inquiry queue for the attorney dashboard. Enriches each
 * row with competitive density (how many attorneys have already responded),
 * whether THIS attorney has engaged, age, and recommended-tier signal.
 *
 * Query params:
 *   view              — queue | mine | targeted  (default queue)
 *   q                 — search across case_type_label, country, full_name
 *   country           — ILIKE match
 *   case_type         — exact match against case_type
 *   urgency           — urgent | high | normal | low
 *   tier              — recommended_tier filter
 *   max_density       — only show inquiries with ≤ N attorneys already responding
 *   age_max_hours     — only show inquiries created within last N hours
 *   exclude_my_engaged — true to hide inquiries this attorney already touched
 *   sort              — created_at | urgency | density | targeted
 *   dir               — asc | desc
 *   page, page_size   — default 25, max 100
 */
import { requireAttorney } from '@/lib/attorneyAuth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { applyOpenQueueFilter, getAcceptedInquiryIds } from '@/lib/attorneyInquiries'

const URGENCY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const view              = searchParams.get('view') || 'queue'
  const q                 = searchParams.get('q')?.trim() || ''
  const country           = searchParams.get('country')?.trim() || ''
  const caseType          = searchParams.get('case_type')?.trim() || ''
  const urgency           = searchParams.get('urgency') || ''
  const tier              = searchParams.get('tier') || ''
  const maxDensity        = Number(searchParams.get('max_density') || 0)
  const ageMaxHours       = Number(searchParams.get('age_max_hours') || 0)
  const excludeMyEngaged  = searchParams.get('exclude_my_engaged') === 'true'
  const sort              = searchParams.get('sort') || 'created_at'
  const dir               = searchParams.get('dir') === 'asc'
  const page              = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize          = Math.min(100, Math.max(1, Number(searchParams.get('page_size') || 25)))

  // Find inquiries THIS attorney has touched (used for `mine` + density signals)
  const [{ data: myMsgRows }, { data: myOfferRows }] = await Promise.all([
    ctx.db.from('inquiry_messages').select('inquiry_id').eq('sender_profile_id', ctx.profileId).eq('sender_role', 'attorney'),
    ctx.db.from('attorney_offers').select('inquiry_id').eq('attorney_id', ctx.attorneyId),
  ])
  const myEngagedIds = new Set([
    ...(myMsgRows ?? []).map((r: any) => r.inquiry_id),
    ...(myOfferRows ?? []).map((r: any) => r.inquiry_id),
  ])

  // Build the base query — apply server-side filters where possible
  let qb = ctx.db
    .from('inquiries')
    .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, status, source, target_attorney_profile_id, claimed_by_attorney_id, created_at', { count: 'exact' })
    .neq('source', 'portal_attorney_chat')

  if (view === 'mine') {
    if (myEngagedIds.size === 0) return Response.json({ inquiries: [], total: 0, page, page_size: pageSize, total_pages: 1, has_more: false, facets: {} })
    qb = qb.in('id', [...myEngagedIds])
  } else if (view === 'targeted') {
    qb = qb.eq('target_attorney_profile_id', ctx.profileId)
  } else {
    // Canonical open-queue filter so search results match the queue.
    const acceptedInquiryIds = await getAcceptedInquiryIds(ctx.db)
    qb = applyOpenQueueFilter(qb, acceptedInquiryIds)
  }

  if (country)   qb = qb.ilike('country', `%${country}%`)
  if (caseType)  qb = qb.eq('case_type', caseType)
  if (urgency)   qb = qb.eq('urgency', urgency)
  if (tier)      qb = qb.eq('recommended_tier', tier)
  if (ageMaxHours > 0) qb = qb.gte('created_at', new Date(Date.now() - ageMaxHours * 3_600_000).toISOString())
  if (q) {
    // FTS on full_name (indexed via idx_consultant_applications_name_fts pattern);
    // case_type_label and country are short labels — keep ilike for those.
    // plainto_tsquery (`plfts`): `-`/quotes in user queries can never raise
    // "syntax error in tsquery" (to_tsquery parses `-` as NOT).
    const safeQ = q.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (safeQ && safeQ.length >= 2) {
      qb = qb.or(`full_name.plfts.${safeQ},case_type_label.ilike.%${q}%,country.ilike.%${q}%`)
    } else {
      qb = qb.or(`case_type_label.ilike.%${q}%,country.ilike.%${q}%`)
    }
  }

  // Server-side sort for created_at; in-memory for the rest
  if (sort === 'created_at') qb = qb.order('created_at', { ascending: dir })
  else qb = qb.order('created_at', { ascending: false })

  // Density / urgency / targeted-first sorts need post-hydration math, so we
  // pull a window of up to 300 rows when those sorts are active, then page in JS.
  const inMemorySort = sort !== 'created_at' || maxDensity > 0 || excludeMyEngaged
  if (inMemorySort) {
    qb = qb.limit(300)
  } else {
    qb = qb.range((page - 1) * pageSize, page * pageSize - 1)
  }

  let { data: rows, error: rowsErr, count } = await qb
  if (rowsErr && /relation .* does not exist|schema cache/i.test(rowsErr.message || '')) {
    return Response.json({ inquiries: [], total: 0, page, page_size: pageSize, total_pages: 1, has_more: false, facets: {}, schema_pending: true })
  }
  if (rowsErr) return Response.json({ error: rowsErr.message }, { status: 500 })

  const inquiries: any[] = rows ?? []
  const inquiryIds = inquiries.map(i => i.id)

  // Competitive density: distinct attorneys who have responded + active offer count
  let respondingMap = new Map<string, Set<string>>()
  let offerMap = new Map<string, number>()
  if (inquiryIds.length) {
    const [threadsRes, offersRes] = await Promise.all([
      ctx.db.from('inquiry_messages').select('inquiry_id, sender_profile_id').in('inquiry_id', inquiryIds).eq('sender_role', 'attorney'),
      ctx.db.from('attorney_offers').select('inquiry_id, status').in('inquiry_id', inquiryIds),
    ])
    for (const m of threadsRes.data ?? []) {
      const iid = (m as any).inquiry_id
      if (!respondingMap.has(iid)) respondingMap.set(iid, new Set())
      respondingMap.get(iid)!.add((m as any).sender_profile_id)
    }
    for (const o of offersRes.data ?? []) {
      const iid = (o as any).inquiry_id
      const st = (o as any).status
      if (!st || st === 'pending' || st === 'active') offerMap.set(iid, (offerMap.get(iid) || 0) + 1)
    }
  }

  // Hydrate
  let enriched = inquiries.map((i: any) => ({
    id: i.id,
    case_type_label: i.case_type_label || i.case_type,
    case_type: i.case_type,
    country: i.country,
    full_name: i.full_name,
    email: i.email,
    phone: i.phone,
    urgency: i.urgency,
    recommended_tier: i.recommended_tier,
    answers: i.answers,
    status: i.status,
    targeted_to_me: i.target_attorney_profile_id === ctx.profileId,
    my_engaged: myEngagedIds.has(i.id),
    claimed_by_me: i.claimed_by_attorney_id === ctx.profileId,
    attorneys_responding: respondingMap.get(i.id)?.size || 0,
    competing_offers: offerMap.get(i.id) || 0,
    created_at: i.created_at,
    age_hours: i.created_at ? Math.floor((Date.now() - new Date(i.created_at).getTime()) / 3_600_000) : 0,
  }))

  // Post-hydration filters
  if (maxDensity > 0)      enriched = enriched.filter(e => e.attorneys_responding <= maxDensity)
  if (excludeMyEngaged)    enriched = enriched.filter(e => !e.my_engaged)

  // Sorts
  if (sort === 'urgency') {
    enriched.sort((a, b) => (URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9))
  } else if (sort === 'density') {
    enriched.sort((a, b) => (dir ? 1 : -1) * (a.attorneys_responding - b.attorneys_responding))
  } else if (sort === 'targeted') {
    enriched.sort((a, b) => Number(b.targeted_to_me) - Number(a.targeted_to_me))
  } else if (sort === 'created_at' && !dir) {
    // Already DESC from query; targeted-first soft bump on queue view
    if (view === 'queue') {
      enriched.sort((a, b) => Number(b.targeted_to_me) - Number(a.targeted_to_me))
    }
  }

  const total = inMemorySort ? enriched.length : (count ?? enriched.length)
  const paged = inMemorySort ? enriched.slice((page - 1) * pageSize, page * pageSize) : enriched

  // Lightweight facets — derived from current result set so chips adapt
  const facets = {
    countries:  topValues(enriched.map(e => e.country).filter(Boolean)),
    case_types: topValues(enriched.map(e => e.case_type).filter(Boolean)),
    urgencies:  topValues(enriched.map(e => e.urgency).filter(Boolean)),
    tiers:      topValues(enriched.map(e => e.recommended_tier).filter(Boolean)),
  }

  return Response.json({
    inquiries: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    facets,
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

function topValues(values: any[], cap = 12): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(String(v), (counts.get(String(v)) || 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, cap).map(([k]) => k)
}
