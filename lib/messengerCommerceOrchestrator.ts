import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { scheduleAutoReply, getConversationAiState } from '@/lib/messengerAi'
import { buildMessengerPricingAuthority } from '@/lib/messengerPricingAuthority'
import { buildGroundedConversationMemory } from '@/lib/messengerConversationMemory'
import { buildOfferIntakeAssessment } from '@/lib/messengerOfferIntake'

const COMMERCE_TRAIL = /\b(price|pricing|cost|quote|offer|budget|how much|hire|book|order|purchase|buy|pay|package|deal|send me an offer|ready to proceed|move forward|go ahead)\b/i

async function maybeHandleOfferIntake(conversationId: string, triggerMessageId?: string | null) {
  const db = createSupabaseAdminClient()
  const conv = await getConversationAiState(db, conversationId)
  if (!conv || conv.ai_mode !== 'auto') return false

  const ids = [conv.participant_a, conv.participant_b].filter(Boolean)
  const { data: profiles } = await db.from('profiles').select('id,full_name,email,role').in('id', ids)
  const provider = (profiles || []).find((p: any) => ['attorney', 'consultant'].includes(String(p.role)))
  const client = (profiles || []).find((p: any) => ['client', 'student'].includes(String(p.role)))
  if (!provider || !client) return false

  const { data: rows } = await db
    .from('conversation_messages')
    .select('id,sender_id,type,body,attachment_url,attachment_name,metadata,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(120)
  const messages = (rows || []).filter((m: any) => !m?.metadata?.ai_typing && !m?.metadata?.ephemeral)
  const latestClient = [...messages].reverse().find((m: any) => m.sender_id === client.id)
  if (!latestClient) return false

  const recentClientText = messages
    .filter((m: any) => m.sender_id === client.id && m.body)
    .slice(-10)
    .map((m: any) => String(m.body))
    .join('\n')
  const intakeAlreadyActive = Boolean((conv.metadata as any)?.ai_offer_intake_active)
  if (!intakeAlreadyActive && !COMMERCE_TRAIL.test(recentClientText)) return false

  const pricing = await buildMessengerPricingAuthority({
    db,
    provider,
    client,
    messages,
    latestClientText: String(latestClient.body || ''),
  }).catch(() => null)
  if (!pricing) return false

  const memory = buildGroundedConversationMemory({
    messages,
    clientId: client.id,
    pricing,
    metadata: conv.metadata,
  })
  const intake = buildOfferIntakeAssessment({ messages, clientId: client.id, pricing, memory })
  const now = new Date().toISOString()

  const nextMeta = {
    ...(conv.metadata || {}),
    ai_memory: memory,
    ai_offer_intake_active: intake.status !== 'ready',
    ai_offer_intake_status: intake.status,
    ai_offer_intake_missing: intake.missing,
    ai_offer_intake_summary: intake.summary,
    ai_offer_intake_updated_at: now,
  }
  await db.from('conversations').update({ metadata: nextMeta, updated_at: now }).eq('id', conversationId)

  if (intake.status === 'ready') return false

  // Dedupe: if a YQAA intake question already exists after this client message,
  // do not insert another one when retries or realtime events race.
  const last = messages[messages.length - 1]
  if (last?.metadata?.ai_intake_request && last?.sender_id === provider.id) return true

  const disclosed = Boolean((conv.metadata as any)?.ai_disclosed)
  const providerLabel = provider.full_name || provider.email || 'the specialist'
  const intro = disclosed
    ? ''
    : `Hey — I’m **YQAA**, the YouSafe Quick Assistance Agent, helping you with ${providerLabel}. 🙂\n\n`
  const reply = `${intro}${intake.clientPrompt}`.slice(0, 1800)

  const { data: inserted } = await db.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_id: provider.id,
    type: 'text',
    body: reply,
    metadata: {
      ai_generated: true,
      ai_assistant: true,
      ai_brand: 'YQAA',
      ai_intake_request: true,
      ai_intake_missing: intake.missing,
      ai_intake_summary: intake.summary,
      disclosure: !disclosed,
    },
  }).select('id').maybeSingle()

  await db.from('conversations').update({
    metadata: {
      ...nextMeta,
      ai_disclosed: true,
      ai_last_reply_at: now,
      ai_last_trigger_message_id: triggerMessageId || latestClient.id,
      ai_last_message_id: inserted?.id || null,
      ai_follow_up_count: 0,
      ai_last_follow_up_at: null,
    },
    last_message_at: now,
    updated_at: now,
  }).eq('id', conversationId)

  return true
}

/**
 * Entry point for client-created Messenger events. If a purchase/offer thread
 * is missing material order details, YQAA asks for them first. Otherwise the
 * normal model pipeline runs unchanged.
 */
export function scheduleContextAwareAutoReply(conversationId: string, triggerMessageId?: string | null) {
  const work = maybeHandleOfferIntake(conversationId, triggerMessageId)
    .then((handled) => {
      if (!handled) scheduleAutoReply(conversationId, triggerMessageId)
    })
    .catch((err) => {
      console.warn('[messengerCommerceOrchestrator] intake gate failed open', err instanceof Error ? err.message : err)
      scheduleAutoReply(conversationId, triggerMessageId)
    })

  try {
    getCloudflareContext().ctx.waitUntil(work)
  } catch {
    void work
  }
}
