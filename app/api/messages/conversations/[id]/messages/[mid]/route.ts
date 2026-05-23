/**
 * POST /api/messages/conversations/[id]/messages/[mid]
 * Toggle star on a message for the current participant.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(_req: Request, context: { params: Promise<{ id: string; mid: string }> }) {
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

  // Fetch current starred ids
  const { data: part } = await db
    .from('conversation_participants')
    .select('starred_message_ids')
    .eq('conversation_id', id)
    .eq('profile_id', profileId)
    .single()

  const currentIds: string[] = (part?.starred_message_ids as string[]) || []
  const isStarred = currentIds.includes(mid)
  const nextIds = isStarred
    ? currentIds.filter((x) => x !== mid)
    : [...currentIds, mid]

  const { error } = await db
    .from('conversation_participants')
    .upsert({
      conversation_id: id,
      profile_id: profileId,
      starred_message_ids: nextIds,
    }, { onConflict: 'conversation_id,profile_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, starred: !isStarred, starred_message_ids: nextIds })
}
