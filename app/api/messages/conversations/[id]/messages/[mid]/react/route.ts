/**
 * POST /api/messages/conversations/[id]/messages/[mid]/react
 * Toggle a reaction emoji on a message for the current participant.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string; mid: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id, mid } = await context.params

  // Ownership check
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const emoji = String(body.emoji || '').trim()
  if (!emoji) return Response.json({ error: 'emoji is required' }, { status: 400 })

  // Toggle: delete if exists, else insert
  const { data: existing } = await db
    .from('conversation_message_reactions')
    .select('id')
    .eq('message_id', mid)
    .eq('profile_id', profileId)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    await db.from('conversation_message_reactions').delete().eq('id', existing.id)
  } else {
    await db.from('conversation_message_reactions').insert({
      message_id: mid,
      profile_id: profileId,
      emoji,
    })
  }

  // Return aggregated reactions for this message
  const { data: rows } = await db
    .from('conversation_message_reactions')
    .select('emoji, profile_id')
    .eq('message_id', mid)

  const grouped = new Map<string, { count: number; mine: boolean }>()
  for (const r of (rows || [])) {
    const cur = grouped.get(r.emoji) || { count: 0, mine: false }
    cur.count++
    if (r.profile_id === profileId) cur.mine = true
    grouped.set(r.emoji, cur)
  }

  const reactions = Array.from(grouped.entries()).map(([emoji, { count, mine }]) => ({
    emoji,
    count,
    mine,
  }))

  return Response.json({ ok: true, reactions })
}
