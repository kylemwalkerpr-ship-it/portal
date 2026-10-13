import fs from 'node:fs'
import path from 'node:path'
import { buildMessengerAttentionDisplay } from '@/lib/messengerAttentionDisplay'

describe('participant-safe Messenger provider attention display', () => {
  const availableProfile = {
    status: 'active',
    is_hidden: false,
    clerk_user_id: 'user_provider-1',
  }
  const availableListing = { available: true }
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
      providerProfile: availableProfile,
      providerListing: availableListing,
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
      providerProfile: availableProfile,
      providerListing: availableListing,
      messages: [{ sender_id: 'provider-1', created_at: '2026-09-09T16:20:00.000Z', metadata: {} }],
    })

    expect(state).toEqual({ requested: true, pending: false, human_replied: true, provider_available: true })
    expect(Object.keys(state)).not.toEqual(expect.arrayContaining(['review_completed', 'licensed_approval', 'pricing']))
  })

  test('finds a provider reply beyond the rendered oldest 500 messages', () => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerProfile: availableProfile,
      providerListing: availableListing,
      messages: Array.from({ length: 500 }, (_, index) => ({
        sender_id: 'client-1',
        created_at: `2026-09-09T16:${String(19 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
      })),
      attentionMessages: [{
        sender_id: 'provider-1',
        created_at: '2026-09-09T18:00:00.000Z',
        metadata: {},
      }],
    })

    expect(state).toEqual({ requested: true, pending: false, human_replied: true, provider_available: true })
  })

  test('human-only database filtering keeps a later human reply visible after 500 AI replies', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/messages/conversations/[id]/route.ts'), 'utf8')
    const attentionQuery = route.slice(route.indexOf(".select('id, sender_id, metadata, created_at')"))
      .split('attentionMessages = data || []')[0]
    for (const marker of ['ai_generated', 'ai_assistant', 'ai_typing']) {
      expect(attentionQuery).toContain(`metadata->>${marker}.is.null,metadata->>${marker}.eq.false`)
    }
    expect(attentionQuery.indexOf('.or(')).toBeLessThan(attentionQuery.indexOf('.limit(500)'))

    const candidates = [
      ...Array.from({ length: 500 }, (_, index) => ({
        sender_id: 'provider-1',
        created_at: `2026-09-09T16:${String(20 + Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
        metadata: { ai_generated: true, ai_assistant: true, ai_typing: false },
      })),
      { sender_id: 'provider-1', created_at: '2026-09-09T18:00:00.000Z', metadata: null },
    ]
    // Mirrors the query's null-inclusive exclusions before its .limit(500).
    const humanOnly = candidates.filter((message) =>
      !message.metadata?.ai_generated && !message.metadata?.ai_assistant && !message.metadata?.ai_typing,
    ).slice(0, 500)
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerProfile: availableProfile,
      providerListing: availableListing,
      messages: [],
      attentionMessages: humanOnly,
    })

    expect(humanOnly).toHaveLength(1)
    expect(state.pending).toBe(false)
    expect(state.human_replied).toBe(true)
  })

  test('does not count a later AI-generated provider message as a human reply', () => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerProfile: availableProfile,
      providerListing: availableListing,
      messages: [],
      attentionMessages: [{
        sender_id: 'provider-1',
        created_at: '2026-09-09T16:20:00.000Z',
        metadata: { ai_generated: true },
      }],
    })

    expect(state).toEqual({ requested: true, pending: true, human_replied: false, provider_available: true })
  })

  test.each([
    ['hidden', { ...availableProfile, is_hidden: true }, availableListing],
    ['inactive', { ...availableProfile, status: 'inactive' }, availableListing],
    ['unlinked', { ...availableProfile, clerk_user_id: null }, availableListing],
    ['placeholder-linked', { ...availableProfile, clerk_user_id: 'inactive:providers.invalid:one' }, availableListing],
    ['missing provider listing', availableProfile, null],
    ['unavailable listing', availableProfile, { available: false }],
    ['unknown profile fields', null, availableListing],
  ])('treats %s providers as unavailable without exposing private fields', (_label, providerProfile, providerListing) => {
    const state = buildMessengerAttentionDisplay({
      metadata,
      providerId: 'provider-1',
      providerProfile,
      providerListing,
      messages: [],
    })

    expect(state).toEqual({ requested: true, pending: true, human_replied: false, provider_available: false })
    expect(state).not.toHaveProperty('providerStatus')
    expect(state).not.toHaveProperty('reason')
    expect(Object.values(state).every((value) => typeof value === 'boolean')).toBe(true)
  })
})
