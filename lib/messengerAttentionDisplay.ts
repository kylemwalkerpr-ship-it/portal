import { evaluateProviderAttention } from '@/lib/messengerEscalationPolicy'

/** Participant-safe status for the Messenger attention notice. */
export function buildMessengerAttentionDisplay(args: {
  metadata: unknown
  messages: any[]
  providerId: string | null
  providerStatus: unknown
}) {
  const attention = evaluateProviderAttention({
    metadata: args.metadata,
    messages: args.messages,
    providerId: args.providerId || '',
  })
  const meta = args.metadata && typeof args.metadata === 'object'
    ? args.metadata as Record<string, unknown>
    : {}

  return {
    requested: Boolean(attention.requestedAt || meta.ai_provider_attention_requested === true),
    pending: attention.pending,
    human_replied: attention.humanRespondedAfterRequest,
    provider_available: args.providerStatus === 'active',
  }
}
