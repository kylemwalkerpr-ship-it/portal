import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id: order_id } = await context.params
  const { db } = auth
  const warnings: string[] = []

  // 1. Fetch order_events
  let events: any[] = []
  try {
    const { data, error } = await db
      .from('order_events')
      .select('id, actor_id, actor_role, from_status, to_status, note, created_at')
      .eq('order_id', order_id)
      .order('created_at', { ascending: true })
    if (error) warnings.push(`order_events_error: ${error.message}`)
    else events = (data || []) as any[]
  } catch (e: any) {
    warnings.push(`order_events_exception: ${e?.message}`)
  }

  // 2. Fetch order_messages (table may not exist)
  let messages: any[] = []
  try {
    const { data, error } = await db
      .from('order_messages')
      .select('id, body, sender_role, sender_id, created_at')
      .eq('order_id', order_id)
      .order('created_at', { ascending: true })
    if (error) warnings.push(`order_messages_error: ${error.message}`)
    else messages = (data || []) as any[]
  } catch {
    warnings.push('order_messages_unavailable')
  }

  // 3. Resolve actor names from events
  const actorIds = [...new Set(events.map(e => e.actor_id).filter(Boolean))]
  const msgSenderIds = [...new Set(messages.map(m => m.sender_id).filter(Boolean))]
  const allIds = [...new Set([...actorIds, ...msgSenderIds])]
  const profileMap: Record<string, string> = {}
  if (allIds.length > 0) {
    try {
      const { data: profiles } = await db
        .from('profiles')
        .select('id, full_name')
        .in('id', allIds)
      ;(profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || p.id })
    } catch {
      warnings.push('profile_names_unavailable')
    }
  }

  // 4. Merge into unified timeline
  type TimelineItem = {
    type: 'event' | 'message'
    timestamp: string
    actor_name: string | null
    actor_role: string | null
    content: string | null
    from_status?: string | null
    to_status?: string | null
  }

  const timeline: TimelineItem[] = [
    ...events.map(e => ({
      type: 'event' as const,
      timestamp: e.created_at,
      actor_name: e.actor_id ? (profileMap[e.actor_id] || e.actor_id) : null,
      actor_role: e.actor_role || null,
      content: e.note || null,
      from_status: e.from_status || null,
      to_status: e.to_status || null,
    })),
    ...messages.map(m => ({
      type: 'message' as const,
      timestamp: m.created_at,
      actor_name: m.sender_id ? (profileMap[m.sender_id] || m.sender_id) : null,
      actor_role: m.sender_role || null,
      content: m.body || null,
    })),
  ]

  // 5. Sort by timestamp ascending
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return ok({ timeline, order_id }, {}, warnings.length ? { data_warnings: warnings } : {})
}
