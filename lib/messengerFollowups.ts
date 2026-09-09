import { createSupabaseAdminClient } from '@/lib/supabase'
import { getConversationAiState, resolveMessengerGrokAuth } from '@/lib/messengerAi'

const HOUR = 60 * 60 * 1000
export const FOLLOW_UP_DELAYS_MS = [24 * HOUR, 72 * HOUR] as const
const MAX_FOLLOW_UPS = FOLLOW_UP_DELAYS_MS.length
const MODEL_TIMEOUT_MS = 9000

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function parseContent(raw: string) {
  try {
    const json = JSON.parse(raw) as any
    const text = String(
      json?.output_text ||
      (Array.isArray(json?.output)
        ? json.output.flatMap((o: any) => o?.content || []).map((c: any) => c?.text || '').join('\n')
        : '') ||
      json?.choices?.[0]?.message?.content ||
      '',
    ).trim()
    return text.replace(/^['"]|['"]$/g, '').trim()
  } catch {
    return ''
  }
}

export function followUpDue(args: {
  nowMs: number
  lastMessageAt: string | number | Date
  followUpCount: number
  aiMode: string
  lastWasYqaa: boolean
  terminalOffer?: boolean
}) {
  if (args.aiMode !== 'auto' || !args.lastWasYqaa || args.terminalOffer) return false
  const count = Math.max(0, Math.floor(Number(args.followUpCount) || 0))
  if (count >= MAX_FOLLOW_UPS) return false
  const lastMs = new Date(args.lastMessageAt).getTime()
  if (!Number.isFinite(lastMs)) return false
  return args.nowMs - lastMs >= FOLLOW_UP_DELAYS_MS[count]
}

async function generateFollowUp(args: {
  conversationId: string
  providerName: string
  clientName: string
  history: string
  memory: unknown
  pendingOffer: boolean
  followUpNumber: number
}) {
  const auth = await resolveMessengerGrokAuth()
  const system = `You are YQAA, the YouSafe Quick Assistance Agent, writing a gentle follow-up in an existing Marketplace DM.

RULES:
- Write 1–2 short conversational sentences only.
- Sound warm, natural and specific to the thread; do not repeat the previous answer.
- Use at most one cheerful, respectful ice-breaker emoji such as 🙂, 👋, ✨ or 👍 when it feels natural.
- Never invent new facts, legal advice, pricing, deadlines or provider claims.
- Do NOT create, revise, discount or suggest a new offer. Do not pressure the client.
- If an offer is pending, you may simply ask whether they want anything clarified before deciding.
- If there is no pending offer, pick up the client's last goal naturally and ask whether they still want help with the next step.
- Do not repeat the AI disclosure or obvious platform information.`
  const user = [
    `Provider: ${args.providerName}`,
    `Client: ${args.clientName}`,
    `Follow-up number: ${args.followUpNumber}`,
    `Pending offer: ${args.pendingOffer ? 'yes' : 'no'}`,
    `Grounded memory: ${JSON.stringify(args.memory || {})}`,
    '',
    'Recent thread:',
    args.history,
  ].join('\n')

  try {
    const res = await fetchWithTimeout(`${auth.baseURL.replace(/\/+$/, '')}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-grok-conv-id': `yqaa-followup-${args.conversationId}`,
      },
      body: JSON.stringify({
        model: auth.model,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        reasoning: { effort: 'low' },
        max_output_tokens: 180,
        store: false,
      }),
    }, MODEL_TIMEOUT_MS)
    const raw = await res.text()
    if (res.ok) {
      const text = parseContent(raw).slice(0, 600)
      if (text) return text
    }
  } catch {
    // Fall through to a safe deterministic check-in.
  }

  return args.pendingOffer
    ? 'Just checking in 🙂 — if you want, I can clarify anything about the offer before you decide.'
    : 'Just checking in 👋 — would you like to keep going with the next step we were discussing?'
}

async function processConversation(db: any, conversationId: string, nowMs: number) {
  const conv = await getConversationAiState(db, conversationId)
  if (!conv || conv.status !== 'active' || conv.ai_mode !== 'auto') return { sent: false, reason: 'inactive' }

  const ids = [conv.participant_a, conv.participant_b].filter(Boolean)
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, role')
    .in('id', ids)
  const provider = (profiles || []).find((p: any) => ['attorney', 'consultant'].includes(String(p.role)))
  const client = (profiles || []).find((p: any) => ['client', 'student'].includes(String(p.role)))
  if (!provider || !client) return { sent: false, reason: 'not_marketplace_dm' }

  const { data: rows } = await db
    .from('conversation_messages')
    .select('id, sender_id, type, body, ref_offer_id, metadata, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(80)
  const messages = (rows || []).filter((m: any) => !m?.metadata?.ai_typing && !m?.metadata?.ephemeral)
  const last = messages[messages.length - 1]
  if (!last) return { sent: false, reason: 'empty' }

  const lastWasYqaa = last.sender_id === provider.id && Boolean(last?.metadata?.ai_generated || last?.metadata?.ai_assistant)
  const count = Math.max(0, Number((conv.metadata as any)?.ai_follow_up_count || 0))

  let pendingOffer = false
  let terminalOffer = false
  const offerId = last.ref_offer_id || (conv.metadata as any)?.ai_last_offer_id || null
  if (offerId) {
    const { data: offer } = await db.from('offers').select('id,status').eq('id', offerId).maybeSingle()
    if (offer?.status === 'pending') pendingOffer = true
    if (offer && ['accepted', 'paid', 'declined', 'cancelled', 'expired'].includes(offer.status)) terminalOffer = true
  }

  if (!followUpDue({
    nowMs,
    lastMessageAt: last.created_at,
    followUpCount: count,
    aiMode: conv.ai_mode,
    lastWasYqaa,
    terminalOffer,
  })) return { sent: false, reason: 'not_due' }

  const history = messages.slice(-12).map((m: any) => {
    const who = m.sender_id === client.id ? 'CLIENT' : m.sender_id === provider.id ? (m?.metadata?.ai_generated ? 'YQAA' : 'PROVIDER') : 'OTHER'
    return `${who}: ${String(m.body || `[${m.type}]`).slice(0, 700)}`
  }).join('\n')

  const text = await generateFollowUp({
    conversationId,
    providerName: provider.full_name || 'the specialist',
    clientName: client.full_name || 'the client',
    history,
    memory: (conv.metadata as any)?.ai_memory || {},
    pendingOffer,
    followUpNumber: count + 1,
  })

  const nowIso = new Date(nowMs).toISOString()
  const { data: inserted, error } = await db.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_id: provider.id,
    type: 'text',
    body: text,
    metadata: {
      ai_generated: true,
      ai_assistant: true,
      ai_brand: 'YQAA',
      ai_follow_up: true,
      ai_follow_up_number: count + 1,
      disclosure: false,
    },
  }).select('id').maybeSingle()
  if (error || !inserted?.id) return { sent: false, reason: 'insert_failed' }

  await db.from('conversations').update({
    metadata: {
      ...(conv.metadata || {}),
      ai_follow_up_count: count + 1,
      ai_last_follow_up_at: nowIso,
      ai_last_message_id: inserted.id,
    },
    last_message_at: nowIso,
    updated_at: nowIso,
  }).eq('id', conversationId)

  return { sent: true, conversationId, messageId: inserted.id }
}

export async function runYqaaFollowUps(args: { limit?: number; nowMs?: number } = {}) {
  const db = createSupabaseAdminClient()
  const nowMs = args.nowMs ?? Date.now()
  const limit = Math.max(1, Math.min(100, Number(args.limit || 50)))
  const earliest = new Date(nowMs - FOLLOW_UP_DELAYS_MS[0]).toISOString()

  const { data: conversations, error } = await db
    .from('conversations')
    .select('id,last_message_at,status')
    .eq('status', 'active')
    .lt('last_message_at', earliest)
    .order('last_message_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message || 'Could not load follow-up candidates')

  const results: any[] = []
  for (const conv of conversations || []) {
    try {
      results.push(await processConversation(db, conv.id, nowMs))
    } catch (err) {
      results.push({ sent: false, conversationId: conv.id, reason: err instanceof Error ? err.message : String(err) })
      await wait(25)
    }
  }

  return {
    scanned: (conversations || []).length,
    sent: results.filter((r) => r?.sent).length,
    skipped: results.filter((r) => !r?.sent).length,
    results,
  }
}
