import { buildMessengerAttentionDisplay } from '@/lib/messengerAttentionDisplay'

describe('participant-safe Messenger provider attention display', () => {
  const metadata = {
    ai_provider_attention_requested: true,
    ai_provider_attention_requested_at: '2026-09-09T16:18:00.000Z',
    ai_escalation_reason: 'model_escalation',
    internal_pricing_note: 'never return this',
  }

  test('keeps a request pending until a real provider message follows it', () => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerStatus: 'active',
      messages: [
        { sender_id: 'provider-1', created_at: '2026-09-09T16:19:00.000Z', metadata: { ai_generated: true } },
        { sender_id: 'client-1', created_at: '2026-09-09T16:20:00.000Z' },
      ],
    })

    expect(state).toEqual({ requested: true, pending: true, human_replied: false, provider_available: true })
  })

  test('reports a human message without claiming review or approval is complete', () => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerStatus: 'active',
      messages: [{ sender_id: 'provider-1', created_at: '2026-09-09T16:20:00.000Z', metadata: {} }],
    })

    expect(state).toEqual({ requested: true, pending: false, human_replied: true, provider_available: true })
    expect(Object.keys(state)).not.toEqual(expect.arrayContaining(['review_completed', 'licensed_approval', 'pricing']))
  })

  test('treats a hidden or inactive profile as unavailable without exposing its raw status', () => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerStatus: 'hidden',
      messages: [],
    })

    expect(state).toEqual({ requested: true, pending: true, human_replied: false, provider_available: false })
    expect(state).not.toHaveProperty('providerStatus')
    expect(state).not.toHaveProperty('reason')
  })
})
