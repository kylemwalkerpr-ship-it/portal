/**
 * GET/PATCH /api/admin/messages/conversations/[id]/ai-mode
 * Admin oversight controls for SuperGrok AI closer (Take over / Resume / Off).
 */
import { requireAdminUser } from '@/lib/portalAuth'
import {
  getConversationAiState,
  setConversationAiMode,
  type AiMode,
} from '@/lib/messengerAi'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  const state = await getConversationAiState(auth.db, id)
  if (!state) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  return Response.json({
    conversation_id: id,
    ai_mode: state.ai_mode,
    metadata: {
      ai_disclosed: Boolean(state.metadata?.ai_disclosed),
      ai_last_reply_at: state.metadata?.ai_last_reply_at || null,
      ai_escalated_at: state.metadata?.ai_escalated_at || null,
    },
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const requested = String(body.ai_mode ?? body.mode ?? '').trim().toLowerCase()
  if (requested !== 'auto' && requested !== 'paused' && requested !== 'off') {
    return Response.json({ error: "ai_mode must be 'auto' | 'paused' | 'off'" }, { status: 400 })
  }
  try {
    const next = await setConversationAiMode(auth.db, id, requested as AiMode, {
      ai_mode_set_by: auth.profileId,
      ai_mode_set_role: 'admin',
    })
    return Response.json({ conversation_id: id, ai_mode: next })
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Failed to update ai_mode' }, { status: 500 })
  }
}
