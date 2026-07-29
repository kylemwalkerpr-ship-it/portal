import { requirePortalUser } from '@/lib/portalAuth'
import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['admin', 'support'].includes(auth.role)) {
    return fail('Forbidden.', 403)
  }

  const url = new URL(req.url)
  const archivedParam = url.searchParams.get('archived') || 'all'
  const statusFilter = url.searchParams.get('status') || undefined
  const q = (url.searchParams.get('q') || '').trim()
  const page = Math.max(1, Number(url.searchParams.get('page') || 1))
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 25)))

  let query = auth.db
    .from('inquiries')
    .select('id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, email, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (archivedParam === 'true') {
    query = query.not('archived_at', 'is', null)
  } else if (archivedParam === 'false') {
    query = query.is('archived_at', null)
  }

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  if (q && q.length >= 2) {
    query = query.or(`case_type_label.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data, error: qErr, count } = await query

  if (qErr) return fail(qErr.message, 500)

  const inquiries = data ?? []
  let enriched = inquiries
  if (inquiries.length > 0) {
    const ids = inquiries.map((inq) => inq.id)
    const { data: orders } = await auth.db
      .from('orders')
      .select('id, source_inquiry_id')
      .in('source_inquiry_id', ids)
    const orderByInquiry = new Map((orders ?? []).map((o) => [o.source_inquiry_id, o.id]))
    enriched = inquiries.map((inq) => ({
      ...inq,
      order_id: orderByInquiry.get(inq.id) || null,
    }))
  }

  return ok({
    inquiries: enriched,
    total: count ?? 0,
    page,
    limit,
    total_pages: Math.ceil((count ?? 0) / limit),
    has_more: page * limit < (count ?? 0),
  })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
