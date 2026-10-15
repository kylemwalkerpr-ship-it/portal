jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
import { createSupabaseAdminClient } from '@/lib/supabase'
import { maybeAutoReply } from '@/lib/messengerAi'

function database(committed: boolean) {
  const now = Date.now()
  return { from(table: string) {
    let inserting = false
    const result = () => ({ data: table === 'conversations'
      ? { id: 'thread', participant_a: 'client', participant_b: 'provider', metadata: { ai_mode: 'auto', ai_last_reply_at: new Date(now - 500).toISOString() } }
      : table === 'profiles' ? [{ id: 'client', role: 'client' }, { id: 'provider', role: 'consultant' }]
      : table === 'yqaa_reply_commits' ? committed ? { reply_message_id: 'durable-reply' } : null
      : inserting ? null : [
        { id: 'prior-reply', sender_id: 'provider', created_at: new Date(now - 500).toISOString(), metadata: { ai_generated: true }, body: 'Prior reply' },
        { id: 'new-client-turn', sender_id: 'client', created_at: new Date(now).toISOString(), body: 'Can you explain the next step?' },
      ], error: null })
    const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q,
      insert: () => { inserting = true; return q }, maybeSingle: async () => result(),
      then: (resolve: any) => Promise.resolve(result()).then(resolve) }
    return q
  } }
}

test('a new client follow-up within the old cooldown reaches reply preparation', async () => {
  ;(createSupabaseAdminClient as jest.Mock).mockReturnValue(database(false))
  const markStage = jest.fn(async (stage: string) => { if (stage === 'pricing_and_evidence') throw new Error('preparation reached') })
  await expect(maybeAutoReply({ conversationId: 'fast-followup', triggerMessageId: 'new-client-turn', runtime: {
    signal: new AbortController().signal, markStage,
  } as any })).rejects.toThrow('preparation reached')
  expect(markStage).toHaveBeenCalledWith('pricing_and_evidence')
})

test('the same committed trigger still returns its durable reply without new work', async () => {
  ;(createSupabaseAdminClient as jest.Mock).mockReturnValue(database(true))
  const markStage = jest.fn()
  await expect(maybeAutoReply({ conversationId: 'committed-followup', triggerMessageId: 'new-client-turn', runtime: {
    signal: new AbortController().signal, markStage,
  } as any })).resolves.toMatchObject({ replied: true, messageId: 'durable-reply' })
  expect(markStage).not.toHaveBeenCalled()
})
