/**
 * GET /api/admin/escrow/[id]/events
 *
 * Escrow event timeline for the admin dashboard's escrow detail drawer.
 * The drawer (components/design/admin-escrow.jsx:134) fetched this
 * endpoint and got a 404 — the route didn't exist, which kicked off
 * the recurring "events 404" line in the admin console.
 *
 * Implementation mirrors /api/admin/orders/[id]/timeline: pulls from
 * the order_events table (since escrow events ARE order events with
 * escrow_status transitions), resolves actor names, and falls back
 * gracefully when the table or a column is missing.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id: order_id } = await context.params
  const { db } = auth
  const warnings: string[] = []

  // Pull all order_events for this escrow's order. The escrow drawer
  // wants the full audit trail (status changes, freezes, disputes,
  // releases, refunds) which all flow through the order_events log.
  let events: Array<Record<string, unknown>> = []
  try {
    const { data, error } = await db
      .from('order_events')
      .select('id, actor_id, actor_role, from_status, to_status, note, created_at')
      .eq('order_id', order_id)
      .order('created_at', { ascending: true })
    if (error) {
      warnings.push(`order_events_error: ${error.message}`)
    } else {
      events = (data || []) as Array<Record<string, unknown>>
    }
  } catch (e) {
    warnings.push(`order_events_exception: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Resolve actor display names so the drawer can show "Jane Doe
  // released $X" instead of a bare UUID.
  const actorIds = Array.from(new Set(events.map((e) => e.actor_id as string).filter(Boolean)))
  const profileMap: Record<string, string> = {}
  if (actorIds.length > 0) {
    try {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds)
      for (const p of (profiles || []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) profileMap[p.id] = p.full_name
      }
    } catch {
      warnings.push('profile_lookup_failed')
    }
  }

  const enriched = events.map((e) => ({
    id: e.id,
    actor_id: e.actor_id,
    actor_name: e.actor_id ? profileMap[e.actor_id as string] || null : null,
    actor_role: e.actor_role,
    from_status: e.from_status,
    to_status: e.to_status,
    note: e.note,
    created_at: e.created_at,
  }))

  return ok(
    { events: enriched },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
