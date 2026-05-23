/**
 * PATCH /api/admin/tickets/[id] — superadmin approves or denies a support
 * ticket. The on_support_ticket_decided() trigger fires the escrow RPC and
 * drops a [Admin] system message into the underlying conversation.
 *
 * Two-person rule: the table CHECK constraint blocks decided_by = raised_by,
 * the trigger fires only on pending → approved/denied transitions, and the
 * trigger re-raises on RPC failure so the UPDATE rolls back.
 */
import { requirePortalUser } from '@/lib/portalAuth'

type Decision = 'approved' | 'denied' | 'cancelled'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'admin') {
    return Response.json({ error: 'Forbidden — admin only.' }, { status: 403 })
  }

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: 'Invalid ticket id.' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const decision = typeof body.status === 'string' ? (body.status as Decision) : ''
  const notes = typeof body.decision_notes === 'string' ? body.decision_notes.trim().slice(0, 4000) : null

  if (!['approved', 'denied', 'cancelled'].includes(decision)) {
    return Response.json({ error: 'status must be approved, denied, or cancelled.' }, { status: 400 })
  }

  // Sanity: ticket must currently be pending. The trigger only fires on the
  // pending → decided transition, so any other state is a no-op or operator
  // mistake — fail loudly so the UI can refresh.
  const { data: existing } = await auth.db
    .from('support_tickets')
    .select('id, status, raised_by')
    .eq('id', id)
    .single()
  if (!existing) return Response.json({ error: 'Ticket not found.' }, { status: 404 })
  if (existing.status !== 'pending') {
    return Response.json({ error: `Ticket is already ${existing.status}.` }, { status: 409 })
  }
  if (existing.raised_by === auth.profileId) {
    // Belt-and-braces: table CHECK enforces this, return 403 for clarity.
    return Response.json({ error: 'Two-person rule — you cannot decide a ticket you raised.' }, { status: 403 })
  }

  const { data, error } = await auth.db
    .from('support_tickets')
    .update({
      status:          decision,
      decided_by:      auth.profileId,
      decided_at:      new Date().toISOString(),
      decision_notes:  notes,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, status, decided_at, decision_notes')
    .single()

  if (error) {
    // The trigger re-raises with a clear message on RPC failure.
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ticket: data })
}
