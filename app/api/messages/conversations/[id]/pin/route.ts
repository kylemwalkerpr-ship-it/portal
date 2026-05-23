/**
 * POST /api/messages/conversations/[id]/pin
 * Body: { pinned: boolean }
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const body = await req.json().catch(() => ({}))
  const pinned = !!body.pinned

  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db
    .from('conversation_participants')
    .upsert({
      conversation_id: id,
      profile_id:      profileId,
      pinned_at:       pinned ? new Date().toISOString() : null,
    }, { onConflict: 'conversation_id,profile_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, pinned })
}
