/**
 * POST /api/messages/conversations/[id]/ai-reply
 *
 * Manually trigger (or re-trigger) a SuperGrok AI reply for this thread.
 * Providers / admins only. Respects ai_mode unless { force: true }.
 */
import { requirePortalUser } from '@/lib/portalAuth'
import {
  getConversationAiState,
  isProviderRole,
  maybeAutoReply,
} from '@/lib/messengerAi'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))

  const state = await getConversationAiState(auth.db, id)
  if (!state) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  const isParticipant = state.participant_a === auth.profileId || state.participant_b === auth.profileId
  const allowed = auth.role === 'admin' || (isParticipant && isProviderRole(auth.role))
  if (!allowed) {
    return Response.json({ error: 'Only the provider or an admin can trigger AI reply.' }, { status: 403 })
  }

  try {
    const result = await maybeAutoReply({
      conversationId: id,
      triggerMessageId: body.trigger_message_id || null,
      force: body.force === true || state.ai_mode === 'paused',
    })
    return Response.json(result)
  } catch (e: any) {
    return Response.json({ error: e?.message || 'AI reply failed' }, { status: 500 })
  }
}
