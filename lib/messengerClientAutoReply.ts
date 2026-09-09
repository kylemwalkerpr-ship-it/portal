import {
  getConversationAiState,
  scheduleAutoReply,
  setConversationAiMode,
} from '@/lib/messengerAi'
import { isRecoverableSelfEscalationPause } from '@/lib/messengerEscalationPolicy'

/**
 * Client-message entry point for YQAA.
 *
 * A legacy/model-created escalation is a request for provider attention, not a
 * human takeover. Recover those conversations before scheduling the reply so a
 * client asking "any update?" never hits a dark thread. Explicit provider/admin
 * pauses remain untouched because they carry ai_mode_set_by / ai_paused_reason.
 */
export async function scheduleClientAutoReply(
  db: any,
  conversationId: string,
  triggerMessageId?: string | null,
) {
  try {
    const state = await getConversationAiState(db, conversationId)
    if (state && isRecoverableSelfEscalationPause(state.ai_mode, state.metadata)) {
      await setConversationAiMode(db, conversationId, 'auto', {
        ai_reactivated_from_soft_escalation_at: new Date().toISOString(),
        ai_provider_attention_requested: true,
        ai_provider_attention_requested_at:
          state.metadata?.ai_provider_attention_requested_at ||
          state.metadata?.ai_escalated_at ||
          new Date().toISOString(),
      })
    }
  } catch (error) {
    console.warn(
      '[messengerClientAutoReply] soft-escalation recovery failed',
      error instanceof Error ? error.message : error,
    )
  }

  scheduleAutoReply(conversationId, triggerMessageId)
}
