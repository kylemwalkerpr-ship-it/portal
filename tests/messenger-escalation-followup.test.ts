import {
  evaluateProviderAttention,
  isRecoverableSelfEscalationPause,
} from '@/lib/messengerEscalationPolicy'
import {
  buildGroundedConversationMemory,
  renderConversationMemory,
} from '@/lib/messengerConversationMemory'

describe('YQAA provider escalation follow-ups', () => {
  test('recovers an AI-created pause when no human actually took over', () => {
    expect(isRecoverableSelfEscalationPause('paused', {
      ai_escalation_reason: 'model_escalation',
      ai_escalated_at: '2026-09-09T16:18:00.000Z',
    })).toBe(true)

    expect(isRecoverableSelfEscalationPause('paused', {
      ai_escalation_reason: 'pricing_provider_review',
      ai_escalated_at: '2026-09-09T16:18:00.000Z',
    })).toBe(true)
  })

  test('never overrides an explicit provider/admin takeover', () => {
    expect(isRecoverableSelfEscalationPause('paused', {
      ai_escalation_reason: 'model_escalation',
      ai_mode_set_by: 'provider-1',
    })).toBe(false)

    expect(isRecoverableSelfEscalationPause('paused', {
      ai_escalation_reason: 'model_escalation',
      ai_paused_reason: 'admin_message',
    })).toBe(false)
  })

  test('knows when provider attention is pending versus actually answered', () => {
    const metadata = {
      ai_provider_attention_requested: true,
      ai_provider_attention_requested_at: '2026-09-09T16:18:00.000Z',
      ai_escalation_reason: 'model_escalation',
    }

    const pending = evaluateProviderAttention({
      metadata,
      providerId: 'provider-1',
      messages: [
        {
          sender_id: 'provider-1',
          body: 'I’ll flag Kyle.',
          created_at: '2026-09-09T16:18:00.000Z',
          metadata: { ai_generated: true },
        },
        {
          sender_id: 'client-1',
          body: 'Any feedback from Kyle?',
          created_at: '2026-09-09T16:27:00.000Z',
        },
      ],
    })
    expect(pending.pending).toBe(true)
    expect(pending.humanRespondedAfterRequest).toBe(false)

    const answered = evaluateProviderAttention({
      metadata,
      providerId: 'provider-1',
      messages: [
        {
          sender_id: 'provider-1',
          body: 'I reviewed this and can do a narrower scope.',
          created_at: '2026-09-09T16:24:00.000Z',
          metadata: {},
        },
      ],
    })
    expect(answered.pending).toBe(false)
    expect(answered.humanRespondedAfterRequest).toBe(true)
  })

  test('grounds the model that no provider feedback exists yet', () => {
    const memory = buildGroundedConversationMemory({
      clientId: 'client-1',
      pricing: { budget: null, intent: null } as any,
      metadata: {
        ai_provider_attention_requested: true,
        ai_provider_attention_requested_at: '2026-09-09T16:18:00.000Z',
        ai_escalation_reason: 'model_escalation',
      },
      messages: [
        {
          sender_id: 'provider-1',
          body: 'Got it — I’ll flag Kyle.',
          created_at: '2026-09-09T16:18:00.000Z',
          metadata: { ai_generated: true, ai_assistant: true },
        },
        {
          sender_id: 'client-1',
          body: 'Any feedback from Kyle?',
          created_at: '2026-09-09T16:27:00.000Z',
        },
        {
          sender_id: 'client-1',
          body: 'Hello??',
          created_at: '2026-09-09T16:28:00.000Z',
        },
      ],
    })

    expect(memory.provider_attention).toMatchObject({
      pending: true,
      human_reply_after_request: false,
    })
    const prompt = renderConversationMemory(memory)
    expect(prompt).toMatch(/NO human-provider reply/i)
    expect(prompt).toMatch(/answer promptly/i)
    expect(prompt).toMatch(/do not invent/i)
  })
})
