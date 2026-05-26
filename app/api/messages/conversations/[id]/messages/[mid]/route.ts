/**
 * POST   /api/messages/conversations/[id]/messages/[mid]  — toggle star
 * DELETE /api/messages/conversations/[id]/messages/[mid]  — soft-delete a message
 *                                                          (sender only)
 */
import { requirePortalUser } from '@/lib/portalAuth'

async function ownershipCheck(db: any, convId: string, profileId: string) {
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', convId)
    .single()
  if (!conv) return { error: 'Conversation not found', status: 404 as const }
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { ok: true as const }
}

export async function POST(_req: Request, context: { params: Promise<{ id: string; mid: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id, mid } = await context.params

  const own = await ownershipCheck(db, id, profileId)
  if ('error' in own) return Response.json({ error: own.error }, { status: own.status })

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

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; mid: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id, mid } = await context.params

  const own = await ownershipCheck(db, id, profileId)
  if ('error' in own) return Response.json({ error: own.error }, { status: own.status })

  // Only the sender can delete. Verify sender_id matches the requester.
  const { data: msg } = await db
    .from('conversation_messages')
    .select('id, sender_id, type, attachment_url, body')
    .eq('id', mid)
    .eq('conversation_id', id)
    .maybeSingle()
  if (!msg) return Response.json({ error: 'Message not found' }, { status: 404 })
  if (msg.sender_id !== profileId) {
    return Response.json({ error: 'You can only delete your own messages.' }, { status: 403 })
  }

  // Soft-delete: keep the row but blank the content + flag a metadata bit.
  // Hard-delete would orphan reply_to_id references in other rows. The
  // bubble component renders deleted-state when metadata.deleted is true.
  const { error } = await db
    .from('conversation_messages')
    .update({
      body: '🚫 This message was deleted.',
      type: 'deleted',
      attachment_url: null,
      attachment_name: null,
      metadata: { deleted: true, deleted_at: new Date().toISOString() },
    })
    .eq('id', mid)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
