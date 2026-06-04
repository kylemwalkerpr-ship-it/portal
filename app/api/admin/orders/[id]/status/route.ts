/**
 * POST /api/admin/orders/[id]/status
 *
 * Single-purpose status-transition endpoint used by the admin Kanban board.
 * Records both an order_event (for the timeline) and an admin_audit_log
 * entry, keeping behaviour identical to the existing PATCH /[id] flow but
 * with a tighter contract (just the columns the Kanban drop produces).
 *
 * Body: { to_status: string, reason?: string }
 *
 * Returns: { ok: true, order: { id, status, status_updated_at } }
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

// Statuses that must never be transitioned via this lightweight endpoint —
// these have side effects (escrow movement, refund ledger) and belong to the
// richer PATCH /[id] route instead.
const FORBIDDEN_TARGETS = new Set(['refunded', 'released'])

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id: order_id } = await context.params
  const { db, profileId } = auth

  let body: { to_status?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body', 400)
  }

  const toStatus = String(body.to_status || '').trim()
  if (!toStatus) return fail('to_status is required', 422)
  if (FORBIDDEN_TARGETS.has(toStatus)) {
    return fail(`Use the dedicated refund/release route for status="${toStatus}"`, 422)
  }

  const reason = body.reason ? String(body.reason).trim() : null

  // Load order to capture from_status for the audit trail. We intentionally
  // do NOT block "no-op" transitions — admins occasionally re-stamp a
  // status to clear a stuck queue; the event log makes that visible.
  const { data: before, error: loadErr } = await db
    .from('orders')
    .select('id, status')
    .eq('id', order_id)
    .single()

  if (loadErr || !before) return fail('Order not found', 404)

  const fromStatus = (before as any).status as string | null

  // Patch order. status_updated_at is owned by a DB trigger in most schemas;
  // we set it explicitly here as a fallback for environments without the
  // trigger so the Kanban "days in current state" badge is accurate.
  const nowIso = new Date().toISOString()
  const { data: updated, error: updateErr } = await db
    .from('orders')
    .update({ status: toStatus, status_updated_at: nowIso })
    .eq('id', order_id)
    .select('id, status, status_updated_at')
    .single()

  if (updateErr) {
    // Retry without status_updated_at if the column doesn't exist on this
    // deployment — the rest of the operation can still succeed.
    if (/column .*status_updated_at.* does not exist/i.test(updateErr.message || '')) {
      const retry = await db
        .from('orders')
        .update({ status: toStatus })
        .eq('id', order_id)
        .select('id, status')
        .single()
      if (retry.error) return fail(retry.error.message, 500)
    } else {
      return fail(updateErr.message, 500)
    }
  }

  // Order event — drives the drawer timeline. Best-effort; never block.
  try {
    await db.from('order_events').insert({
      order_id,
      actor_id: profileId,
      actor_role: 'admin',
      from_status: fromStatus,
      to_status: toStatus,
      note: reason || `Status changed by admin to ${toStatus}`,
    })
  } catch { /* timeline is informational; swallow */ }

  // Status history (separate table; some deployments have it, some don't)
  try {
    await db.from('order_status_history').insert({
      order_id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by_id: profileId,
      note: reason || `Status changed by admin to ${toStatus}`,
    })
  } catch { /* table may not exist; swallow */ }

  // Audit log — required for SOC-style review trails.
  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'update_order_status',
      target_table: 'orders',
      target_id: order_id,
      payload_snapshot: { from_status: fromStatus, to_status: toStatus },
      reason: reason,
    })
  } catch { /* audit log is best-effort */ }

  return ok({ ok: true, order: updated ?? { id: order_id, status: toStatus } })
}
