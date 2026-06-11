/**
 * GET  /api/orders/[id]/escrow  — client view of escrow status/timeline.
 * POST /api/orders/[id]/escrow  — client decisions on a delivered order:
 *     { action: 'approve_delivery' | 'request_revision' | 'raise_dispute', note? }
 *
 * Auth: requirePortalUser; must own the order (auth.profileId === order.client_id)
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { releaseEarningsForOrder } from '@/lib/earnings'
import { mirrorMessage } from '@/lib/conversations'

const APPROVABLE = ['under_review', 'review', 'delivered']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')
  const note = typeof body.note === 'string' ? body.note.slice(0, 1200) : null

  const ordRes = await db
    .from('orders')
    .select('id, status, escrow_status, escrow_amount, escrow_released_amount, client_id, consultant_id')
    .eq('id', orderId)
    .single() as any
  const ord = ordRes.data
  if (ordRes.error || !ord) return fail('Order not found.', 404)
  if (ord.client_id !== profileId) return fail('Only the client can act on this order.', 403)

  const counterpartId = ord.consultant_id || null
  const warnings: string[] = []

  // ── Approve & release ───────────────────────────────────────────────────
  if (action === 'approve_delivery') {
    if (!APPROVABLE.includes(String(ord.status))) {
      return fail(`This order can't be approved from its current state (${ord.status}).`, 409)
    }
    const previousEscrow = Number(ord.escrow_amount || 0)
    let releasedCount = 0
    try {
      const released = await releaseEarningsForOrder(orderId)
      releasedCount = Array.isArray(released) ? released.length : 0
    } catch (e: any) { warnings.push(`earnings_release_failed: ${e?.message || 'unknown'}`) }

    const { data: updated, error: updErr } = await db
      .from('orders')
      .update({
        status: 'completed',
        escrow_status: 'released',
        escrow_released_amount: Number(ord.escrow_released_amount || 0) + previousEscrow,
        escrow_amount: 0,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      // Concurrency guard: only transition if the order is STILL in an
      // approvable state — a simultaneous duplicate request matches zero
      // rows instead of double-applying the release.
      .in('status', APPROVABLE)
      .select('id, status, escrow_status')
      .maybeSingle() as any
    if (updErr) return fail(updErr.message, 500)
    if (!updated) return fail('This order was already approved.', 409)

    try {
      await db.from('escrow_events').insert({
        order_id: orderId, event_type: 'client_release', amount: -1 * previousEscrow, balance_after: 0,
        actor_id: profileId, actor_role: 'client', reason: 'Client approved the deliverable — escrow released.',
        metadata: { released_earnings: releasedCount },
      })
    } catch (e: any) { warnings.push(`escrow_event_failed: ${e?.message || 'unknown'}`) }

    if (counterpartId) {
      try {
        await mirrorMessage(db, {
          participantA: profileId, participantB: counterpartId, senderId: profileId,
          body: '✅ I’ve approved the deliverable and released payment from escrow. Thank you!',
          contextKind: 'order', contextId: orderId, refOrderId: orderId,
        })
      } catch { /* non-fatal */ }
    }
    return ok({ order: updated, released_earnings: releasedCount }, {}, warnings.length ? { data_warnings: warnings } : {})
  }

  // ── Request a revision ──────────────────────────────────────────────────
  if (action === 'request_revision') {
    if (!APPROVABLE.includes(String(ord.status))) {
      return fail(`This order can't be sent back for revision from its current state (${ord.status}).`, 409)
    }
    const { data: updated, error: updErr } = await db
      .from('orders')
      .update({ status: 'revision_requested', revision_reason: note, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('id, status')
      .single() as any
    if (updErr || !updated) return fail(updErr?.message || 'Could not request a revision.', 500)

    if (counterpartId) {
      try {
        await mirrorMessage(db, {
          participantA: profileId, participantB: counterpartId, senderId: profileId,
          body: `🔄 I’ve requested a revision.${note ? ` Notes: ${note}` : ''} Escrow stays held until the updated work is approved.`,
          contextKind: 'order', contextId: orderId, refOrderId: orderId,
        })
      } catch { /* non-fatal */ }
    }
    return ok({ order: updated })
  }

  // ── Raise a dispute ─────────────────────────────────────────────────────
  if (action === 'raise_dispute') {
    const { data: updated, error: updErr } = await db
      .from('orders')
      .update({ escrow_status: 'disputed', status: 'disputed', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('id, status, escrow_status')
      .single() as any
    if (updErr || !updated) return fail(updErr?.message || 'Could not raise a dispute.', 500)

    try {
      await db.from('escrow_events').insert({
        order_id: orderId, event_type: 'dispute_opened', balance_after: Number(ord.escrow_amount || 0),
        actor_id: profileId, actor_role: 'client', reason: note || 'Client raised a dispute.',
      })
    } catch (e: any) { warnings.push(`escrow_event_failed: ${e?.message || 'unknown'}`) }

    return ok({ order: updated }, {}, warnings.length ? { data_warnings: warnings } : {})
  }

  return fail('Unknown action. Use approve_delivery, request_revision, or raise_dispute.', 400)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id: orderId } = await params
  if (!orderId) return fail('Order id is required.', 400)

  const warnings: string[] = []

  // Load order + ownership check
  let order: any
  try {
    const { data, error } = await db
      .from('orders')
      .select('id, status, escrow_status, escrow_amount, escrow_released_amount, escrow_refunded_amount, auto_release_eligible_at, client_id, consultant_id, attorney_id, total_amount')
      .eq('id', orderId)
      .single() as any
    if (error || !data) return fail('Order not found.', 404)
    order = data
  } catch (err: any) {
    return fail(err.message || 'Order load failed.', 500)
  }

  if (order.client_id !== profileId) return fail('Forbidden', 403)

  // Parallel fetch milestones, pending scope changes, last 20 events
  const [milestonesRes, scopeRes, eventsRes] = await Promise.allSettled([
    db.from('order_milestones').select('*').eq('order_id', orderId).order('sequence', { ascending: true }),
    db.from('order_scope_changes').select('*').eq('order_id', orderId).eq('status', 'pending').order('created_at', { ascending: false }),
    db.from('escrow_events').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
  ])

  let milestones: any[] = []
  if (milestonesRes.status === 'fulfilled') {
    milestones = (((milestonesRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('milestones_unavailable') }

  let pendingScopeChanges: any[] = []
  if (scopeRes.status === 'fulfilled') {
    pendingScopeChanges = (((scopeRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('scope_changes_unavailable') }

  let events: any[] = []
  if (eventsRes.status === 'fulfilled') {
    events = (((eventsRes.value as any)?.data) ?? []) as any[]
  } else { warnings.push('events_unavailable') }

  return ok({
    order: {
      id: order.id,
      status: order.status,
      escrow_status: order.escrow_status,
      escrow_amount: Number(order.escrow_amount || 0),
      escrow_released_amount: Number(order.escrow_released_amount || 0),
      escrow_refunded_amount: Number(order.escrow_refunded_amount || 0),
      auto_release_eligible_at: order.auto_release_eligible_at,
      total_amount: Number(order.total_amount || 0),
    },
    milestones,
    pending_scope_changes: pendingScopeChanges,
    events,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
}
