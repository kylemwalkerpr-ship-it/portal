/**
 * /api/support/tickets — support-agent surface.
 *
 *   GET  → list tickets visible to the current user (support/admin only).
 *          Filter: ?status=pending|approved|denied|cancelled  &order_id=<uuid>
 *   POST → support agent raises a new ticket against an order.
 *
 * Buyers and sellers never see this endpoint — RLS blocks them, the route
 * also checks role explicitly so an SDK-side bypass still 403s.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

type Kind = 'void' | 'refund_partial' | 'release_hold' | 'other'
const VALID_KIND: Kind[] = ['void', 'refund_partial', 'release_hold', 'other']

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (!['support', 'admin'].includes(auth.role)) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const orderId = url.searchParams.get('order_id')

  let q = auth.db
    .from('support_tickets')
    .select('id, order_id, conversation_id, raised_by, kind, amount_cents, reason, detail, status, decided_by, decided_at, decision_notes, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && ['pending', 'approved', 'denied', 'cancelled'].includes(status)) {
    q = q.eq('status', status)
  }
  if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
    q = q.eq('order_id', orderId)
  }

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ tickets: data ?? [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const postAbortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', postAbortHandler)

  try {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'support') {
    return Response.json({ error: 'Only support agents can raise tickets.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const orderId = typeof body.order_id === 'string' ? body.order_id.trim() : ''
  const conversationId = typeof body.conversation_id === 'string' && body.conversation_id ? body.conversation_id.trim() : null
  const kind = typeof body.kind === 'string' ? (body.kind as Kind) : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const detail = typeof body.detail === 'string' ? body.detail.trim().slice(0, 4000) : null
  const amountCents = body.amount_cents != null ? Math.floor(Number(body.amount_cents)) : null

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return Response.json({ error: 'order_id is required.' }, { status: 400 })
  }
  if (!VALID_KIND.includes(kind as Kind)) {
    return Response.json({ error: `kind must be one of ${VALID_KIND.join(', ')}.` }, { status: 400 })
  }
  if (reason.length < 8) {
    return Response.json({ error: 'Reason is required (≥8 chars).' }, { status: 400 })
  }
  if (kind === 'refund_partial') {
    if (!Number.isFinite(amountCents) || (amountCents ?? 0) <= 0) {
      return Response.json({ error: 'amount_cents > 0 is required for refund_partial.' }, { status: 400 })
    }
  }

  // Confirm the order exists and is reachable.
  const { data: order } = await auth.db
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 })

  const { data, error } = await auth.db
    .from('support_tickets')
    .insert({
      order_id:        orderId,
      conversation_id: conversationId,
      raised_by:       auth.profileId,
      kind,
      amount_cents:    kind === 'refund_partial' ? amountCents : null,
      reason,
      detail,
    })
    .select('id, order_id, kind, status, reason, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ticket: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: message }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', postAbortHandler)
  }
}
