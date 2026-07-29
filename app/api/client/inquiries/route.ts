import { requireClient } from '@/lib/clientAuth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

// Returns inquiries the signed-in client either owns by profile_id, or that
// match their email (covers anonymous submissions made before the user signed
// up, which we backfill on the fly).
export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  // Backfill any inquiries submitted with this email that don't yet have a profile_id.
  const backfill = await ctx.db
    .from('inquiries')
    .update({ client_profile_id: ctx.profileId })
    .eq('email', ctx.email)
    .is('client_profile_id', null)

  if (backfill.error) {
    if (isMissingTable(backfill.error.message)) {
      return Response.json({ inquiries: [], schema_pending: true })
    }
    console.error('[client/inquiries] backfill error', backfill.error.message)
  }

  const url = new URL(req.url)
  const includeArchived = url.searchParams.get('include') === 'archived'
  const statusFilter = url.searchParams.get('status') || undefined

  let query = ctx.db
    .from('inquiries')
    .select('id, case_type_label, case_type, country, urgency, recommended_tier, status, claimed_by_attorney_id, claimed_at, source, archived_at, archived_by_role, archived_reason, answers, created_at, updated_at')
    .eq('client_profile_id', ctx.profileId)
    .order('created_at', { ascending: false })

  if (!includeArchived) {
    query = query.is('archived_at', null)
  }
  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error: qErr } = await query

  if (qErr) {
    if (isMissingTable(qErr.message)) {
      return Response.json({ inquiries: [], schema_pending: true })
    }
    console.error('[client/inquiries] select error', qErr.message)
    return Response.json({ error: qErr.message }, { status: 500 })
  }

  const inquiries = (data ?? []).filter((q) => q.source !== 'portal_attorney_chat')

  // Join order_id from orders table via source_inquiry_id
  let enriched = inquiries
  if (inquiries.length > 0) {
    const ids = inquiries.map((q) => q.id)
    const { data: orders } = await ctx.db
      .from('orders')
      .select('id, source_inquiry_id')
      .in('source_inquiry_id', ids)
    const orderByInquiry = new Map((orders ?? []).map((o) => [o.source_inquiry_id, o.id]))
    enriched = inquiries.map((q) => ({
      ...q,
      order_id: orderByInquiry.get(q.id) || null,
    }))
  }

  return Response.json({ inquiries: enriched })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

function isMissingTable(message: string | undefined | null): boolean {
  if (!message) return false
  return /relation .*does not exist|could not find the table|schema cache/i.test(message)
}
