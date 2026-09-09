/**
 * POST /api/admin/messages/conversations/[id]/messages/[mid]/react
 * Toggle an admin reaction on any message in a Master Chats thread.
 */
import { requireAdminUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string; mid: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id, mid } = await context.params

  const { data: message } = await db
    .from('conversation_messages')
    .select('id')
    .eq('id', mid)
    .eq('conversation_id', id)
    .maybeSingle()
  if (!message) return Response.json({ error: 'Message not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const emoji = String(body.emoji || '').trim().slice(0, 16)
  if (!emoji) return Response.json({ error: 'emoji is required' }, { status: 400 })

  const { data: existing } = await db
    .from('conversation_message_reactions')
    .select('id')
    .eq('message_id', mid)
    .eq('profile_id', profileId)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    const { error } = await db.from('conversation_message_reactions').delete().eq('id', existing.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('conversation_message_reactions').insert({
      message_id: mid,
      profile_id: profileId,
      emoji,
    })
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  const { data: rows, error: rowsError } = await db
    .from('conversation_message_reactions')
    .select('emoji, profile_id')
    .eq('message_id', mid)
  if (rowsError) return Response.json({ error: rowsError.message }, { status: 500 })

  const grouped = new Map<string, { count: number; mine: boolean }>()
  for (const row of rows || []) {
    const current = grouped.get(row.emoji) || { count: 0, mine: false }
    current.count += 1
    if (row.profile_id === profileId) current.mine = true
    grouped.set(row.emoji, current)
  }

  return Response.json({
    ok: true,
    reactions: Array.from(grouped.entries()).map(([emoji, value]) => ({
      emoji,
      count: value.count,
      mine: value.mine,
    })),
  })
}
