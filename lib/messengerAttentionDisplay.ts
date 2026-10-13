import { evaluateProviderAttention } from '@/lib/messengerEscalationPolicy'
import { isPlaceholderClerkId } from '@/lib/auth/roles'

/** Participant-safe status for the Messenger attention notice. */
export function buildMessengerAttentionDisplay(args: {
  metadata: unknown
  messages: any[]
  attentionMessages?: any[]
  providerId: string | null
  providerProfile?: { status?: unknown; is_hidden?: unknown; clerk_user_id?: unknown } | null
  providerListing?: { available?: unknown } | null
}) {
  const attention = evaluateProviderAttention({
    metadata: args.metadata,
    messages: args.messages,
    attentionMessages: args.attentionMessages,
    providerId: args.providerId || '',
  })
  const meta = args.metadata && typeof args.metadata === 'object'
    ? args.metadata as Record<string, unknown>
    : {}

  return {
    requested: Boolean(attention.requestedAt || meta.ai_provider_attention_requested === true),
    pending: attention.pending,
    human_replied: attention.humanRespondedAfterRequest,
    provider_available: Boolean(
      args.providerProfile?.status === 'active' &&
      args.providerProfile?.is_hidden === false &&
      typeof args.providerProfile?.clerk_user_id === 'string' &&
      args.providerProfile.clerk_user_id.startsWith('user_') &&
      !isPlaceholderClerkId(args.providerProfile.clerk_user_id) &&
      args.providerListing?.available === true,
    ),
  }
}
