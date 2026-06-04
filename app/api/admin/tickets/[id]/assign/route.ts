/**
 * PATCH /api/admin/tickets/[id]/assign
 *
 * Assigns a ticket to an admin. The current schema doesn't have an
 * assigned_to column on support_tickets, so we self-heal:
 *   1. Try to UPDATE the column directly. If it exists, win.
 *   2. If it doesn't exist, fall back to (a) writing a system message into
 *      the backing conversation noting the assignment and (b) appending an
 *      "[assigned-to: <name>]" tag to decision_notes — both forms the
 *      drawer thread can render. A data_warnings flag tells the UI which
 *      path was taken.
 *
 * Body: { assignee_id: string }  // a profile.id with role='admin'
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db, profileId } = auth

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('Invalid ticket id.', 400)

  const body = await req.json().catch(() => ({}))
  const assigneeId: string | null =
    typeof body?.assignee_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.assignee_id) ? body.assignee_id : null
  if (!assigneeId) return fail('assignee_id must be a uuid.', 422)

  const warnings: string[] = []

  // 1. Verify ticket + assignee
  const { data: ticket, error: ticketErr } = await db
    .from('support_tickets')
    .select('id, order_id, conversation_id, decision_notes, status')
    .eq('id', id)
    .single()
  if (ticketErr || !ticket) return fail('Ticket not found.', 404)

  const { data: assignee } = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', assigneeId)
    .maybeSingle()
  if (!assignee) return fail('Assignee profile not found.', 404)
  if (assignee.role !== 'admin') return fail('Assignee must be an admin.', 422)

  const assigneeLabel = assignee.full_name || assignee.email || assigneeId
  let usedColumn = false

  // 2. Try direct column update — best path when the migration has run.
  try {
    const { error } = await db
      .from('support_tickets')
      .update({ assigned_to: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      usedColumn = true
    } else if (/column .*assigned_to.* does not exist/i.test(error.message || '')) {
      warnings.push('assigned_to_column_missing: falling back to conversation + decision_notes')
    } else {
      warnings.push('assigned_to_update_failed: ' + error.message)
    }
  } catch (e: any) {
    warnings.push('assigned_to_update_threw: ' + (e?.message || 'unknown'))
  }

  // 3. Fallback: stamp decision_notes + drop a system message into the
  //    conversation so the assignment is visible in the thread view.
  if (!usedColumn) {
    const tag = `[assigned-to:${assigneeLabel}]`
    const newNotes = ticket.decision_notes
      ? `${ticket.decision_notes.replace(/\s*\[assigned-to:[^\]]+\]\s*/g, '').trim()} ${tag}`.trim()
      : tag
    try {
      await db
        .from('support_tickets')
        .update({ decision_notes: newNotes, updated_at: new Date().toISOString() })
        .eq('id', id)
    } catch (e: any) {
      warnings.push('decision_notes_update_failed: ' + (e?.message || 'unknown'))
    }

    if (ticket.conversation_id) {
      try {
        await db.from('conversation_messages').insert({
          conversation_id: ticket.conversation_id,
          sender_id:       profileId,
          type:            'system',
          body:            `Ticket assigned to ${assigneeLabel}.`,
          metadata:        { source: 'admin_ticket_assign', ticket_id: id, assignee_id: assigneeId },
        })
      } catch (e: any) {
        warnings.push('conversation_message_failed: ' + (e?.message || 'unknown'))
      }
    }
  }

  // 4. Audit
  try {
    await db.from('admin_audit_log').insert({
      admin_id: profileId,
      action_type: 'ticket_assign',
      target_table: 'support_tickets',
      target_id: id,
      payload_snapshot: { assignee_id: assigneeId, via_column: usedColumn },
      reason: null,
    })
  } catch (e: any) {
    warnings.push('audit_log_failed: ' + (e?.message || 'unknown'))
  }

  return ok(
    {
      ticket_id:    id,
      assignee_id:  assigneeId,
      assignee_name: assigneeLabel,
      via_column:   usedColumn,
    },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
