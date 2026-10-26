jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
import { createSupabaseAdminClient } from '@/lib/supabase'
import { maybeAutoReply } from '@/lib/messengerAi'

function database(committed: boolean, conversationId: string) {
  const consent = { conversation_id: conversationId, subject_id: 'client', provider_id: 'provider', version: 1, granted: true, cross_site_linking: false, memory_after: '2026-01-01T00:00:00Z' }
  const now = Date.now()
  return { rpc: async (name: string) => ({ data: name === 'read_yqaa_memory' ? { consent, facts: [], excluded_source_ids: [] } : true, error: null }), from(table: string) {
    let inserting = false
    const result = () => ({ data: table === 'conversations'
      ? { id: 'thread', participant_a: 'client', participant_b: 'provider', metadata: { ai_mode: 'auto', ai_last_reply_at: new Date(now - 500).toISOString() } }
      : table === 'profiles' ? [{ id: 'client', role: 'client' }, { id: 'provider', role: 'consultant' }]
      : table === 'yqaa_consent' ? consent
      : table === 'yqaa_reply_commits' ? committed ? { reply_message_id: 'durable-reply' } : null
      : inserting ? null : [
        { id: 'new-client-turn', sender_id: 'client', created_at: new Date(now).toISOString(), body: 'Can you explain the next step?' },
        { id: 'prior-reply', sender_id: 'provider', created_at: new Date(now - 500).toISOString(), metadata: { ai_generated: true }, body: 'Prior reply' },
      ], error: null })
    const q: any = { select: () => q, eq: () => q, gt: () => q, in: () => q, order: () => q, limit: () => q,
      insert: () => { inserting = true; return q }, maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve) }
    return q
  } }
}

test('a new client follow-up within the old cooldown reaches reply preparation', async () => {
  ;(createSupabaseAdminClient as jest.Mock).mockReturnValue(database(false, 'fast-followup'))
  const markStage = jest.fn(async (stage: string) => { if (stage === 'pricing_and_evidence') throw new Error('preparation reached') })
  await expect(maybeAutoReply({ conversationId: 'fast-followup', triggerMessageId: 'new-client-turn', runtime: {
    signal: new AbortController().signal, markStage,
  } as any })).rejects.toThrow('preparation reached')
  expect(markStage).toHaveBeenCalledWith('pricing_and_evidence')
})

test('the same committed trigger still returns its durable reply without new work', async () => {
  ;(createSupabaseAdminClient as jest.Mock).mockReturnValue(database(true, 'committed-followup'))
  const markStage = jest.fn()
  await expect(maybeAutoReply({ conversationId: 'committed-followup', triggerMessageId: 'new-client-turn', runtime: {
    signal: new AbortController().signal, markStage,
  } as any })).resolves.toMatchObject({ replied: true, messageId: 'durable-reply' })
  expect(markStage).not.toHaveBeenCalled()
})
