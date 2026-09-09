export type ProviderAttentionState = {
  pending: boolean
  requestedAt: string | null
  reason: string | null
  humanRespondedAfterRequest: boolean
}

const SELF_ESCALATION_REASONS = new Set(['model_escalation', 'pricing_provider_review'])

function asMeta(metadata: unknown): Record<string, any> {
  return metadata && typeof metadata === 'object' ? metadata as Record<string, any> : {}
}

/**
 * Older YQAA builds converted a model/provider-review escalation into ai_mode=paused.
 * That was not a real human takeover and stranded clients when the provider stayed
 * silent. Only recover pauses that are clearly AI-created; manual/admin pauses carry
 * ai_mode_set_by / ai_paused_reason and remain authoritative.
 */
export function isRecoverableSelfEscalationPause(aiMode: unknown, metadata: unknown) {
  const meta = asMeta(metadata)
  if (String(aiMode || '').toLowerCase() !== 'paused') return false
  if (meta.ai_mode_set_by || meta.ai_paused_reason) return false
  return SELF_ESCALATION_REASONS.has(String(meta.ai_escalation_reason || ''))
}

export function evaluateProviderAttention(args: {
  metadata: unknown
  messages: any[]
  providerId: string
}): ProviderAttentionState {
  const meta = asMeta(args.metadata)
  const requestedAt = typeof meta.ai_provider_attention_requested_at === 'string'
    ? meta.ai_provider_attention_requested_at
    : typeof meta.ai_escalated_at === 'string'
      ? meta.ai_escalated_at
      : null
  const reason = typeof meta.ai_escalation_reason === 'string' ? meta.ai_escalation_reason : null
  const requestedMs = requestedAt ? new Date(requestedAt).getTime() : 0

  const humanRespondedAfterRequest = requestedMs > 0 && (args.messages || []).some((message: any) => {
    if (message?.sender_id !== args.providerId) return false
    if (message?.metadata?.ai_generated || message?.metadata?.ai_assistant || message?.metadata?.ai_typing) return false
    const createdMs = message?.created_at ? new Date(message.created_at).getTime() : 0
    return createdMs > requestedMs
  })

  const explicitlyPending = meta.ai_provider_attention_requested === true
  const legacyPending = Boolean(requestedAt && SELF_ESCALATION_REASONS.has(String(reason || '')))

  return {
    pending: Boolean((explicitlyPending || legacyPending) && !humanRespondedAfterRequest),
    requestedAt,
    reason,
    humanRespondedAfterRequest,
  }
}

export function renderProviderAttentionAuthority(state: ProviderAttentionState, providerLabel: string) {
  const provider = String(providerLabel || 'the specialist').trim() || 'the specialist'
  const lines = [
    '# PROVIDER ATTENTION STATUS — SERVER-CALCULATED',
    `Provider: ${provider}`,
    `Attention requested: ${state.requestedAt ? 'yes' : 'no'}`,
    `Human provider replied after that request: ${state.humanRespondedAfterRequest ? 'yes' : 'no'}`,
    `Provider attention currently pending: ${state.pending ? 'yes' : 'no'}`,
    '',
    'MANDATORY HANDOFF BEHAVIOR:',
    '- A request for provider attention does NOT mean YQAA should go silent. Keep answering the client unless AI mode was explicitly paused/off by a provider or admin.',
    '- If attention is pending and the client asks for an update, feedback, status, or says hello again, state plainly that there is no new human-provider reply in the thread yet. Never invent, imply, or paraphrase provider feedback that does not exist.',
    '- Stay useful while the provider is pending: answer safe platform/process questions, retain the conversation context, and help refine scope or documents without pretending to make the provider’s personal judgment.',
    '- Keep status replies short, warm, conversational, and non-repetitive. One respectful emoji is fine when natural.',
    '- If human provider replied after the attention request, use only the actual provider message(s) in the thread as provider feedback.',
  ]
  return lines.join('\n')
}
