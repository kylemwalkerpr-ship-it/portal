/**
 * YQAA engine for provider↔client DMs.
 *
 * - ai_mode on conversations.metadata: auto | paused | off
 * - Auto-reply on inbound client/student messages through the central Grok path
 * - Grounded conversation memory + non-repetitive conversational behavior
 * - Visible ephemeral "YQAA is typing…" bubble while work is in progress
 * - Server-calculated marketplace pricing authority before any AI-created offer
 * - Human Take over / admin intervention pauses AI
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  ensureSuperGrokAccessToken,
  XAI_API_BASE_DEFAULT,
  XAI_DEFAULT_MODEL,
} from '@/lib/xaiSuperGrokOAuth'
import {
  computeNetPayoutCents,
  computePlatformFeeCents,
  getPaymentSettingsForApi,
  normalizeRevision,
  toCents,
} from '@/lib/fiverr'
import { buildMessengerSiteKnowledge } from '@/lib/messengerSiteKnowledge'
import {
  buildMessengerPricingAuthority,
  guardMessengerOffer,
  pricingAuditSnapshot,
  renderPricingAuthority,
  type PricingAuthority,
} from '@/lib/messengerPricingAuthority'
import {
  buildGroundedConversationMemory,
  renderConversationMemory,
  withOfferInMemory,
  type YqaaConversationMemory,
} from '@/lib/messengerConversationMemory'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export type AiMode = 'auto' | 'paused' | 'off'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const CLIENT_ROLES = new Set(['client', 'student'])
const DEBOUNCE_MS = 8_000
const REPLY_COOLDOWN_MS = 4_000
const RESPONSES_TIMEOUT_MS = 18_000
const CHAT_TIMEOUT_MS = 10_000
const AUTH_CACHE_TTL_MS = 120_000
const MAX_OUTPUT_TOKENS = 1400
const AUTH_FAILURE_STATUS = new Set([401, 403])
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504])

const pendingLocks = new Map<string, Promise<AiReplyResult | null>>()
const lastTriggerAt = new Map<string, number>()
let authCache: { value: MessengerGrokAuth; expiresAt: number } | null = null

export interface AiReplyResult {
  replied: boolean
  skipped?: string
  messageId?: string
  offerId?: string | null
  aiMode?: AiMode
}

export function normalizeAiMode(raw: unknown): AiMode {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'paused' || v === 'off' || v === 'auto') return v
  return 'auto'
}

export function readAiMode(metadata: unknown): AiMode {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  return normalizeAiMode(meta.ai_mode)
}

export async function getConversationAiState(db: any, conversationId: string) {
  const { data, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, metadata, status')
    .eq('id', conversationId)
    .maybeSingle()
  if (error) {
    if (/metadata|column/i.test(error.message || '')) {
      const { data: fallback } = await db
        .from('conversations')
        .select('id, participant_a, participant_b, context_kind, context_id, status')
        .eq('id', conversationId)
        .maybeSingle()
      if (!fallback) return null
      return { ...fallback, metadata: {}, ai_mode: 'auto' as AiMode }
    }
    throw error
  }
  if (!data) return null
  const metadata = (data.metadata && typeof data.metadata === 'object' ? data.metadata : {}) as Record<string, any>
  return { ...data, metadata, ai_mode: readAiMode(metadata) }
}

export async function setConversationAiMode(
  db: any,
  conversationId: string,
  mode: AiMode,
  extra: Record<string, unknown> = {},
): Promise<AiMode> {
  const current = await getConversationAiState(db, conversationId)
  if (!current) throw new Error('Conversation not found')
  const metadata = {
    ...(current.metadata || {}),
    ...extra,
    ai_mode: mode,
    ai_mode_updated_at: new Date().toISOString(),
  }
  const { error } = await db
    .from('conversations')
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  if (error) throw new Error(error.message || 'Failed to update ai_mode')
  return mode
}

async function recordAiDiagnostic(
  db: any,
  conversationId: string,
  patch: Record<string, unknown>,
) {
  try {
    const current = await getConversationAiState(db, conversationId)
    if (!current) return
    const metadata = {
      ...(current.metadata || {}),
      ...patch,
      ai_mode: normalizeAiMode(
        patch.ai_mode ?? (current.metadata as any)?.ai_mode ?? current.ai_mode,
      ),
    }
    await db
      .from('conversations')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  } catch (err) {
    console.warn('[messengerAi] recordAiDiagnostic failed', err instanceof Error ? err.message : err)
  }
}

export type MessengerGrokAuth = {
  apiKey: string
  baseURL: string
  model: string
  authMode: 'supergrok' | 'vault' | 'env'
}

export async function resolveMessengerGrokAuth(): Promise<MessengerGrokAuth> {
  let vaultOverlay: Record<string, string> = {}
  try {
    const { buildVaultEnvOverrides } = await import('@/lib/aiKeyVault')
    vaultOverlay = await buildVaultEnvOverrides(false)
  } catch (err) {
    console.warn('[messengerAi] AI Key Vault overlay unavailable', err instanceof Error ? err.message : err)
  }

  const model =
    process.env.MESSENGER_AI_MODEL?.trim() ||
    vaultOverlay.XAI_MODEL?.trim() ||
    process.env.XAI_MODEL?.trim() ||
    XAI_DEFAULT_MODEL
  const baseURL = (
    vaultOverlay.XAI_BASE_URL?.trim() ||
    process.env.XAI_BASE_URL?.trim() ||
    XAI_API_BASE_DEFAULT
  ).replace(/\/+$/, '')

  try {
    const oauth = await ensureSuperGrokAccessToken()
    if (oauth?.accessToken) {
      return { apiKey: oauth.accessToken, baseURL, model, authMode: 'supergrok' }
    }
  } catch (err) {
    console.warn('[messengerAi] SuperGrok OAuth unavailable', err instanceof Error ? err.message : err)
  }

  const vaultKey = vaultOverlay.XAI_API_KEY?.trim() || ''
  if (vaultKey) return { apiKey: vaultKey, baseURL, model, authMode: 'vault' }

  const apiKey = process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim() || ''
  if (!apiKey) {
    throw new Error(
      'Grok is not configured for messenger AI. Connect SuperGrok in Content Studio (primary), or set XAI_API_KEY / GROK_API_KEY as fallback.',
    )
  }
  return { apiKey, baseURL, model, authMode: 'env' }
}

async function resolveGrokAuth(force = false): Promise<MessengerGrokAuth> {
  if (!force && authCache && authCache.expiresAt > Date.now()) return authCache.value
  const value = await resolveMessengerGrokAuth()
  authCache = { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS }
  return value
}

const SYSTEM_PROMPT = `You are **YQAA — the YouSafe Quick Assistance Agent** for YouSafe Consultancy.

IDENTITY:
- YQAA stands for **YouSafe Quick Assistance Agent**. You are YouSafe's disclosed AI assistance agent helping a client communicate with the provider on this thread.
- You are NOT the provider and never pretend to be a licensed attorney/consultant.
- First reply only (or after genuine identity confusion): disclose naturally that you are YQAA and AI-powered. Do NOT repeat that disclosure every turn.
- Never expose the underlying model/provider/authentication stack.

CONVERSATION QUALITY — VERY IMPORTANT:
- Sound like a capable, friendly human marketplace concierge: warm, relaxed, context-aware and direct.
- Vary your wording and sentence rhythm. Do not sound templated.
- You may use occasional natural emojis (for example 🙂, 👍, ✅, 🎓) when they fit the tone. Do not decorate every sentence.
- NEVER repeat information you already gave unless the client asks for it again, corrects it, or it is necessary to answer the new question.
- Especially do not repeat obvious platform facts, disclaimers, greetings, provider introductions, or the client's own facts in every reply.
- Use the supplied GROUNDED CONVERSATION MEMORY plus recent thread. If the client already gave a budget, country, deadline, documents, or scope, remember it and move forward instead of asking again.
- Ask at most one or two high-value clarifying questions at a time. Keep momentum.
- Acknowledge what the client actually said; do not mechanically summarize their whole message back to them.

SAFETY / YMYL:
1. No outcome guarantees for visas, cases, admissions, refunds, or timelines.
2. Do not invent legal advice, credentials, statutes, prices, policies, service availability, URLs, provider facts, or documents.
3. High-risk legal matters, court deadlines, criminal/asylum/removal matters, or material uncertainty → set escalate=true and explain briefly why the human provider should take over.
4. Never ask the client to leave YouSafe, pay off-platform, or share direct contact details.
5. Prefer supplied site/provider knowledge. If evidence is insufficient, say so rather than guessing.

DISCOVERY / ORDER TAKING:
- You may actively move the conversation toward an order when the client wants a service.
- Understand scope: destination/jurisdiction, work requested, documents, complexity, deadline, desired delivery and anything that materially changes effort.
- BEFORE making ANY price suggestion, quote, or offer, you MUST have a client-stated budget estimate/range in the offer currency. If no budget exists, ask for it naturally. Never disclose a proposed price first.
- Compare the budget against the server-calculated PRICING AUTHORITY appended below.
- If the client budget is below the guarded floor, explain respectfully and concisely why the requested scope cannot be responsibly offered at that amount, and offer either narrower scope or a revised budget.
- A high client budget is NOT permission to charge the whole budget. Price from evidence and scope, not opportunistically.

OFFERS — TRANSACTION AUTHORITY:
- The server, not you, is the final pricing authority. Your proposed offer is checked after your response and may be blocked or routed for provider review.
- Only create an offer when scope is sufficiently clear, budget is known, PRICING AUTHORITY status=ready, and you have a realistic title/description/delivery time.
- Never invent a gig_id. Only use provider-owned relevant gig IDs explicitly listed in the PRICING AUTHORITY / site context.
- If the current evidence cannot support an automated quote, keep offer=null and continue discovery or escalate.
- Do not expose internal fee percentages, seller payout calculations, guard formulas or internal revenue logic unless the client explicitly asks about platform pricing mechanics.

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "reply": "natural client-facing message",
  "escalate": false,
  "offer": null
}
OR when fully ready to send a guarded offer:
{
  "reply": "natural client-facing message introducing the offer without repeating prior explanations",
  "escalate": false,
  "offer": {
    "title": "short title",
    "description": "specific scope summary at least 30 characters",
    "price_usd": 199,
    "delivery_days": 5,
    "revisions": 1,
    "expires_in_days": 7,
    "gig_id": "only an allowed provider-owned relevant gig id, or omit"
  }
}`

type GrokDecision = {
  reply: string
  escalate?: boolean
  offer?: {
    title?: string
    description?: string
    price_usd?: number
    price?: number
    delivery_days?: number
    revisions?: number
    expires_in_days?: number
    gig_id?: string
  } | null
}

function parseDecision(raw: string): GrokDecision {
  const text = String(raw || '').trim()
  const fenced = text.match(/\{[\s\S]*\}/)
  const jsonStr = fenced ? fenced[0] : text
  try {
    const parsed = JSON.parse(jsonStr) as GrokDecision
    if (!parsed.reply || typeof parsed.reply !== 'string') throw new Error('missing reply')
    return parsed
  } catch {
    return {
      reply: text.slice(0, 4000) || 'I’m having trouble formatting that cleanly. I’ll keep the conversation here and let the provider step in rather than guess.',
      escalate: true,
      offer: null,
    }
  }
}

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

function parseResponsesContent(text: string) {
  try {
    const json = JSON.parse(text) as any
    return String(
      json?.output_text ||
      (Array.isArray(json?.output)
        ? json.output.flatMap((o: any) => o?.content || []).map((c: any) => c?.text || '').join('\n')
        : '') ||
      json?.choices?.[0]?.message?.content ||
      '',
    ).trim()
  } catch {
    return ''
  }
}

function parseChatContent(text: string) {
  try {
    const json = JSON.parse(text) as any
    return String(json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || '').trim()
  } catch {
    return ''
  }
}

async function postJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempts = 1,
): Promise<{ response: Response; text: string }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs)
      const text = await response.text()
      if (response.ok || !TRANSIENT_STATUS.has(response.status) || attempt === attempts - 1) {
        return { response, text }
      }
      await wait(250 * (attempt + 1))
    } catch (err) {
      lastError = err
      if (err instanceof Error && err.name === 'AbortError') throw err
      if (attempt === attempts - 1) throw err
      await wait(250 * (attempt + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Messenger model request failed')
}

async function callGrokChat(args: { system: string; user: string; conversationId: string }): Promise<string> {
  let auth = await resolveGrokAuth()
  const headers = () => ({
    Authorization: `Bearer ${auth.apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-grok-conv-id': `yqaa-messenger-${args.conversationId}`,
  })
  const input = [
    { role: 'system', content: args.system },
    { role: 'user', content: args.user },
  ]

  let responseDiagnostic = ''
  let responseStatus = 0
  try {
    let result = await postJson(
      `${auth.baseURL}/responses`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: auth.model,
          input,
          reasoning: { effort: 'low' },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          prompt_cache_key: `yqaa-messenger-${args.conversationId}`,
          store: false,
        }),
      },
      RESPONSES_TIMEOUT_MS,
      2,
    )
    responseStatus = result.response.status
    if (AUTH_FAILURE_STATUS.has(result.response.status)) {
      authCache = null
      auth = await resolveGrokAuth(true)
      result = await postJson(
        `${auth.baseURL}/responses`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            model: auth.model,
            input,
            reasoning: { effort: 'low' },
            max_output_tokens: MAX_OUTPUT_TOKENS,
            prompt_cache_key: `yqaa-messenger-${args.conversationId}`,
            store: false,
          }),
        },
        RESPONSES_TIMEOUT_MS,
        1,
      )
      responseStatus = result.response.status
    }
    responseDiagnostic = result.text.slice(0, 240)
    if (result.response.ok) {
      const content = parseResponsesContent(result.text)
      if (content) return content
    }
  } catch (err) {
    responseDiagnostic = err instanceof Error ? err.message : String(err)
  }

  let chatDiagnostic = ''
  let chatStatus = 0
  try {
    const result = await postJson(
      `${auth.baseURL}/chat/completions`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model: auth.model,
          temperature: 0.35,
          reasoning_effort: 'low',
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: input,
        }),
      },
      CHAT_TIMEOUT_MS,
      1,
    )
    chatStatus = result.response.status
    chatDiagnostic = result.text.slice(0, 240)
    if (result.response.ok) {
      const content = parseChatContent(result.text)
      if (content) return content
    }
  } catch (err) {
    chatDiagnostic = err instanceof Error ? err.message : String(err)
  }

  throw new Error(
    `Messenger model failed after bounded recovery (responses=${responseStatus || 'network'} ${responseDiagnostic}; chat=${chatStatus || 'network'} ${chatDiagnostic})`,
  )
}

async function summarizeAttachments(_db: any, messages: any[]): Promise<string> {
  const attachments = messages.filter((m) => m.attachment_url || m.type === 'attachment' || m.attachment_name)
  if (!attachments.length) return '(no attachments)'

  const lines: string[] = []
  for (const m of attachments.slice(-8)) {
    const name = m.attachment_name || 'file'
    const url = m.attachment_url || ''
    let excerpt = ''
    try {
      if (url && /\.(txt|csv|md)(\?|$)/i.test(name + url)) {
        const res = await fetchWithTimeout(url, {}, 3500)
        if (res.ok) excerpt = (await res.text()).slice(0, 2500)
      } else if (url && /\.pdf(\?|$)/i.test(name + url)) {
        const res = await fetchWithTimeout(url, {}, 4500)
        if (res.ok) {
          const ab = await res.arrayBuffer()
          const raw = new TextDecoder('latin1').decode(ab)
          const texts = [...raw.matchAll(/\((?:\\\)|[^)]){4,200}\)/g)]
            .map((x) => x[0].slice(1, -1))
            .filter((s) => /[A-Za-z]{3}/.test(s))
          excerpt = texts.join(' ').slice(0, 2500) || '(PDF attached; automatic text extraction is limited — confirm important facts with the client)'
        }
      } else if ((url && /^image\//i.test(String(m.metadata?.mime_type || ''))) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(name + url)) {
        excerpt = '(image attached — do not invent its contents)'
      }
    } catch {
      excerpt = '(attachment could not be fetched automatically)'
    }
    lines.push(`- ${name}${excerpt ? `\n  excerpt: ${excerpt}` : ''}`)
  }
  return lines.join('\n')
}

async function resolveProviderAndClient(db: any, conv: any) {
  const ids = [conv.participant_a, conv.participant_b].filter(Boolean)
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', ids)
  const list = profiles || []
  const provider = list.find((p: any) => PROVIDER_ROLES.has(String(p.role)))
  const client = list.find((p: any) => CLIENT_ROLES.has(String(p.role === 'student' ? 'client' : p.role)) || CLIENT_ROLES.has(String(p.role)))
  return { provider, client }
}

async function ensureInquiryThread(
  db: any,
  attorneyProfileId: string,
  clientProfileId: string,
  conversationContextId: string | null,
): Promise<string | null> {
  if (conversationContextId) {
    const { data } = await db.from('inquiries').select('id').eq('id', conversationContextId).maybeSingle()
    if (data?.id) return data.id
  }

  const { data: existing } = await db
    .from('inquiries')
    .select('id')
    .eq('client_profile_id', clientProfileId)
    .eq('target_attorney_profile_id', attorneyProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id

  const { data: clientProfile } = await db
    .from('profiles')
    .select('email, full_name, country')
    .eq('id', clientProfileId)
    .maybeSingle()
  const { data: created } = await db
    .from('inquiries')
    .insert({
      client_profile_id: clientProfileId,
      target_attorney_profile_id: attorneyProfileId,
      email: clientProfile?.email || `client-${clientProfileId}@yousafe.internal`,
      full_name: clientProfile?.full_name || 'YouSafe client',
      country: clientProfile?.country || 'US',
      case_type: 'attorney_chat',
      case_type_label: 'Attorney conversation',
      urgency: 'normal',
      answers: {},
      meta: { started_from: 'messenger_ai_offer', pre_intake: true },
      source: 'portal_messenger_ai',
      status: 'engaged',
    })
    .select('id')
    .maybeSingle()
  return created?.id || null
}

async function insertTypingBubble(db: any, conversationId: string, providerId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: providerId,
        type: 'system',
        body: 'YQAA is typing…',
        metadata: {
          ai_generated: true,
          ai_assistant: true,
          ai_brand: 'YQAA',
          ai_typing: true,
          ephemeral: true,
        },
      })
      .select('id')
      .maybeSingle()
    if (error) return null
    return data?.id || null
  } catch {
    return null
  }
}

async function clearTypingBubble(db: any, typingId: string | null) {
  if (!typingId) return
  try {
    await db.from('conversation_messages').delete().eq('id', typingId)
  } catch {
    /* best effort; stale typing rows are excluded from model memory next turn */
  }
}

function containsPriceSuggestion(text: string) {
  return /(?:\$\s*\d|\b(?:usd|cad)\s*\d|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:usd|cad|dollars?)\b)/i.test(String(text || ''))
}

function commerceIntent(text: string) {
  return /\b(price|pricing|cost|quote|offer|budget|how much|hire|book|order|purchase|buy|pay|package|deal|send me an offer|ready to proceed|move forward)\b/i.test(String(text || ''))
}

async function createOfferFromDecision(
  db: any,
  args: {
    conversationId: string
    conv: any
    provider: any
    client: any
    offer: NonNullable<GrokDecision['offer']>
    pricing: PricingAuthority
    memory: YqaaConversationMemory
    guardedPriceCents: number
  },
): Promise<{ id: string; title: string; priceCents: number; currency: string; memory: YqaaConversationMemory } | null> {
  const settings = await getPaymentSettingsForApi()
  const title = String(args.offer.title || '').trim().slice(0, 120)
  const descriptionRaw = String(args.offer.description || '').trim().slice(0, 1200)
  const description = descriptionRaw.length >= 30
    ? descriptionRaw
    : `${descriptionRaw || title} — custom scope agreed in YouSafe Messenger.`.slice(0, 1200)
  const price = Math.max(0, Math.round(args.guardedPriceCents))
  const deliveryDays = Number(args.offer.delivery_days)
  const revisions = normalizeRevision(args.offer.revisions ?? 1)
  const expiresInDays = Math.max(1, Math.min(60, Number(args.offer.expires_in_days || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)

  if (title.length < 5 || description.length < 30) return null
  if (!Number.isInteger(price) || price < settings.minimum_offer_amount_cents) return null
  if (settings.maximum_offer_amount_cents > 0 && price > settings.maximum_offer_amount_cents) return null
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1) return null

  const providerType = args.provider.role === 'consultant' ? 'consultant' : 'attorney'
  const inquiryId = providerType === 'attorney'
    ? await ensureInquiryThread(
        db,
        args.provider.id,
        args.client.id,
        args.conv.context_kind === 'inquiry' ? args.conv.context_id : null,
      )
    : null
  if (providerType === 'attorney' && !inquiryId) return null

  let attachedGigId: string | null = null
  const rawGigId = typeof args.offer.gig_id === 'string' ? args.offer.gig_id.trim() : ''
  if (rawGigId && args.pricing.providerRelevantGigIds.includes(rawGigId)) {
    const { data: gig } = await db
      .from('gigs')
      .select('id, provider_id, status')
      .eq('id', rawGigId)
      .maybeSingle()
    if (gig && gig.provider_id === args.provider.id && gig.status !== 'archived') attachedGigId = gig.id
  }

  const chatId = providerType === 'attorney' ? inquiryId! : args.conversationId

  // Idempotency: do not fire an identical pending AI offer twice if retries or
  // duplicate inbound events race each other.
  try {
    const { data: duplicate } = await db
      .from('offers')
      .select('id,title,price,currency')
      .eq('chat_id', chatId)
      .eq('sender_id', args.provider.id)
      .eq('recipient_id', args.client.id)
      .eq('status', 'pending')
      .eq('price', price)
      .eq('title', title)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (duplicate?.id) {
      const memory = withOfferInMemory(args.memory, {
        id: duplicate.id,
        title,
        priceCents: price,
        currency: duplicate.currency || settings.primary_currency,
      })
      return { id: duplicate.id, title, priceCents: price, currency: duplicate.currency || settings.primary_currency, memory }
    }
  } catch {
    /* proceed; DB uniqueness is not relied on for correctness */
  }

  const offerInsert: Record<string, any> = {
    chat_id: chatId,
    sender_id: args.provider.id,
    sender_type: providerType,
    recipient_id: args.client.id,
    title,
    description,
    price,
    currency: settings.primary_currency,
    delivery_days: deliveryDays,
    revisions,
    expires_at: expiresAt.toISOString(),
  }
  if (attachedGigId) offerInsert.gig_id = attachedGigId

  const { data: offer, error } = await db.from('offers').insert(offerInsert).select('id').maybeSingle()
  if (error || !offer) {
    console.error('[messengerAi] offer insert failed', error?.message)
    return null
  }

  const platformFee = computePlatformFeeCents(price, providerType, settings)
  const netPayout = computeNetPayoutCents(price, providerType, settings)
  const audit = pricingAuditSnapshot(args.pricing)
  const messageBody = `Custom offer · ${title} · ${settings.primary_currency.toUpperCase()} ${(price / 100).toFixed(0)} · ${deliveryDays}-day delivery`

  if (providerType === 'attorney' && inquiryId) {
    await db.from('inquiry_messages').insert({
      inquiry_id: inquiryId,
      sender_role: 'system',
      sender_profile_id: args.provider.id,
      body: messageBody,
    }).then(() => null, () => null)
  }

  await db.from('conversation_messages').insert({
    conversation_id: args.conversationId,
    sender_id: args.provider.id,
    type: 'offer',
    body: messageBody,
    ref_offer_id: offer.id,
    ref_inquiry_id: inquiryId,
    metadata: {
      title,
      price,
      currency: settings.primary_currency,
      delivery_days: deliveryDays,
      expires_at: expiresAt.toISOString(),
      ai_generated: true,
      ai_assistant: true,
      ai_brand: 'YQAA',
      pricing_guarded: true,
      pricing_reference_mean_cents: args.pricing.referenceMeanCents,
      pricing_floor_cents: args.pricing.minimumAutoOfferCents,
    },
  }).then(() => null, () => null)

  // Auditable commercial trail: seller/platform protection decisions can be
  // reviewed later without exposing them to the client-facing conversation.
  await db.from('admin_audit_log').insert({
    admin_id: null,
    action_type: 'yqaa_offer_created',
    target_table: 'offers',
    target_id: offer.id,
    payload_snapshot: {
      conversation_id: args.conversationId,
      provider_id: args.provider.id,
      client_id: args.client.id,
      final_price_cents: price,
      platform_fee_cents: platformFee,
      net_payout_cents: netPayout,
      attached_gig_id: attachedGigId,
      pricing: audit,
    },
    reason: 'YQAA Messenger offer passed deterministic marketplace pricing authority.',
  }).then(() => null, () => null)

  const memory = withOfferInMemory(args.memory, {
    id: offer.id,
    title,
    priceCents: price,
    currency: settings.primary_currency,
  })
  return { id: offer.id, title, priceCents: price, currency: settings.primary_currency, memory }
}

export async function maybeAutoReply(opts: {
  conversationId: string
  triggerMessageId?: string | null
  force?: boolean
}): Promise<AiReplyResult> {
  const key = opts.conversationId
  const existing = pendingLocks.get(key)
  if (existing) return existing

  const run = (async (): Promise<AiReplyResult> => {
    const now = Date.now()
    const last = lastTriggerAt.get(key) || 0
    if (!opts.force && now - last < DEBOUNCE_MS) return { replied: false, skipped: 'debounced' }
    lastTriggerAt.set(key, now)

    const db = createSupabaseAdminClient()
    const conv = await getConversationAiState(db, opts.conversationId)
    if (!conv) return { replied: false, skipped: 'not_found' }
    const aiMode = conv.ai_mode as AiMode
    if (aiMode !== 'auto' && !opts.force) return { replied: false, skipped: `ai_mode_${aiMode}`, aiMode }

    const { provider, client } = await resolveProviderAndClient(db, conv)
    if (!provider || !client) {
      await recordAiDiagnostic(db, opts.conversationId, {
        ai_last_skip: 'not_provider_client_thread',
        ai_last_skip_at: new Date().toISOString(),
      })
      return { replied: false, skipped: 'not_provider_client_thread', aiMode }
    }

    const { data: messages } = await db
      .from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, metadata, created_at')
      .eq('conversation_id', opts.conversationId)
      .order('created_at', { ascending: true })
      .limit(120)

    const msgs = (messages || []).filter((m: any) => !m?.metadata?.ai_typing)
    const lastMsg = msgs[msgs.length - 1]
    if (!lastMsg) return { replied: false, skipped: 'empty_thread', aiMode }

    if (aiMode === 'auto' && (conv.metadata as any)?.ai_mode == null) {
      await recordAiDiagnostic(db, opts.conversationId, {
        ai_mode: 'auto',
        ai_mode_defaulted_at: new Date().toISOString(),
      })
      conv.metadata = { ...(conv.metadata || {}), ai_mode: 'auto' }
    }

    if (!opts.force && lastMsg.sender_id !== client.id) return { replied: false, skipped: 'last_not_client', aiMode }

    const meta = conv.metadata || {}
    if (opts.triggerMessageId && meta.ai_last_trigger_message_id === opts.triggerMessageId) {
      return { replied: false, skipped: 'already_replied_trigger', aiMode }
    }
    if (meta.ai_last_reply_at && Date.now() - new Date(String(meta.ai_last_reply_at)).getTime() < REPLY_COOLDOWN_MS) {
      return { replied: false, skipped: 'cooldown', aiMode }
    }

    const lastAi = [...msgs].reverse().find((m: any) => m?.metadata?.ai_generated && !m?.metadata?.ai_typing)
    if (lastAi && lastMsg.created_at && lastAi.created_at >= lastMsg.created_at) {
      return { replied: false, skipped: 'ai_already_after_client', aiMode }
    }

    const latestClientText = [...msgs].reverse().find((m: any) => m.sender_id === client.id)?.body || lastMsg.body || ''
    const disclosed = Boolean(meta.ai_disclosed)
    const history = msgs
      .slice(-40)
      .map((m: any) => {
        const who = m.sender_id === provider.id
          ? m?.metadata?.ai_generated ? 'YQAA' : 'PROVIDER'
          : m.sender_id === client.id ? 'CLIENT' : 'OTHER'
        const body = m.body || (m.attachment_name ? `[attachment: ${m.attachment_name}]` : `[${m.type}]`)
        return `${who}: ${body}`
      })
      .join('\n')

    const typingId = await insertTypingBubble(db, opts.conversationId, provider.id)
    let memory: YqaaConversationMemory | null = null

    try {
      const [docSummary, sitePack, pricing] = await Promise.all([
        summarizeAttachments(db, msgs),
        buildMessengerSiteKnowledge({
          db,
          provider,
          latestUserMessage: String(latestClientText || ''),
        }).catch((err) => {
          console.warn('[messengerAi] site knowledge pack failed', err instanceof Error ? err.message : err)
          return null
        }),
        buildMessengerPricingAuthority({
          db,
          provider,
          client,
          messages: msgs,
          latestClientText: String(latestClientText || ''),
        }).catch((err) => {
          console.warn('[messengerAi] pricing authority failed', err instanceof Error ? err.message : err)
          return null
        }),
      ])

      if (!pricing) {
        await clearTypingBubble(db, typingId)
        await recordAiDiagnostic(db, opts.conversationId, {
          ai_last_skip: 'pricing_authority_unavailable',
          ai_last_skip_at: new Date().toISOString(),
          ai_last_error: 'Pricing authority could not be constructed safely.',
          ai_last_error_at: new Date().toISOString(),
        })
        return { replied: false, skipped: 'pricing_authority_unavailable', aiMode }
      }

      memory = buildGroundedConversationMemory({
        messages: msgs,
        clientId: client.id,
        pricing,
        metadata: conv.metadata,
      })
      await recordAiDiagnostic(db, opts.conversationId, { ai_memory: memory })

      const providerLabel = provider.full_name || provider.email || 'this YouSafe specialist'
      const systemBase = SYSTEM_PROMPT.replace(/\{provider\}/g, providerLabel)
      const systemWithContext = [
        systemBase,
        sitePack?.systemAppendix || '',
        renderPricingAuthority(pricing),
        renderConversationMemory(memory),
      ].filter(Boolean).join('\n\n')

      const userPrompt = [
        `Provider: ${provider.full_name || provider.email} (role=${provider.role})`,
        `Client: ${client.full_name || client.email}`,
        `Context: ${conv.context_kind || 'general'}${conv.context_id ? ` #${conv.context_id}` : ''}`,
        `YQAA disclosure already sent: ${disclosed ? 'yes — do not repeat it unless identity is genuinely at issue' : 'no — disclose naturally once'}`,
        '',
        'Recent thread (use it; do not repeat facts already answered):',
        history || '(no messages)',
        '',
        'Document / attachment summaries:',
        docSummary,
      ].join('\n')

      let decision: GrokDecision
      try {
        const raw = await callGrokChat({
          system: systemWithContext,
          user: userPrompt,
          conversationId: opts.conversationId,
        })
        decision = parseDecision(raw)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[messengerAi] model call failed', msg)
        await recordAiDiagnostic(db, opts.conversationId, {
          ai_last_skip: 'grok_error',
          ai_last_skip_at: new Date().toISOString(),
          ai_last_error: msg.slice(0, 500),
          ai_last_error_at: new Date().toISOString(),
          ai_last_trigger_message_id: opts.triggerMessageId || lastMsg.id,
        })
        return { replied: false, skipped: 'grok_error', aiMode }
      }

      let replyText = String(decision.reply || '').trim().slice(0, 8000)
      let approvedOffer: { priceCents: number } | null = null
      let providerReview = false

      // Never let the model bypass budget-first pricing merely by placing a
      // number in prose rather than the structured offer field.
      if (!pricing.budget && containsPriceSuggestion(replyText)) {
        const guard = guardMessengerOffer({ pricing })
        if (!guard.ok) replyText = guard.reply
        decision.offer = null
      }

      // When the client is actively asking to buy/quote and no budget exists,
      // keep the next step focused: ask budget instead of wandering through a
      // long generic sales answer.
      if (!pricing.budget && commerceIntent(String(latestClientText || '')) && !decision.escalate) {
        const guard = guardMessengerOffer({ pricing })
        if (!guard.ok && guard.reason === 'missing_budget') replyText = guard.reply
        decision.offer = null
      }

      if (pricing.status === 'budget_too_low' && pricing.budget && !decision.escalate) {
        const guard = guardMessengerOffer({ pricing })
        if (!guard.ok && guard.reason === 'budget_too_low') replyText = guard.reply
        decision.offer = null
      }

      if (decision.offer && !decision.escalate) {
        const guard = guardMessengerOffer({
          pricing,
          proposedPriceUsd: decision.offer.price_usd,
          proposedPrice: decision.offer.price,
          gigId: decision.offer.gig_id || null,
        })
        if (guard.ok) {
          approvedOffer = { priceCents: guard.priceCents }
        } else {
          replyText = guard.reply
          decision.offer = null
          providerReview = Boolean(guard.needsProviderReview)
        }
      }

      if (!replyText) return { replied: false, skipped: 'empty_reply', aiMode }
      if (!disclosed && !/\byqaa\b|yousafe quick assistance agent|ai-powered|artificial intelligence/i.test(replyText)) {
        replyText = `Hey — I’m **YQAA**, the **YouSafe Quick Assistance Agent**, helping you connect with ${providerLabel}. I’m AI-powered, and I’ll keep this moving while bringing the provider in whenever human judgment is needed. 🙂\n\n${replyText}`
      }

      await clearTypingBubble(db, typingId)

      const { data: inserted, error: insertErr } = await db
        .from('conversation_messages')
        .insert({
          conversation_id: opts.conversationId,
          sender_id: provider.id,
          type: 'text',
          body: replyText,
          metadata: {
            ai_generated: true,
            ai_assistant: true,
            ai_brand: 'YQAA',
            ai_escalate: Boolean(decision.escalate || providerReview),
            disclosure: true,
            pricing_status: pricing.status,
            pricing_reference_mean_cents: pricing.referenceMeanCents,
          },
        })
        .select('id')
        .maybeSingle()

      if (insertErr || !inserted) {
        const msg = insertErr?.message || 'insert returned no row'
        console.error('[messengerAi] insert reply failed', msg)
        await recordAiDiagnostic(db, opts.conversationId, {
          ai_last_skip: 'insert_failed',
          ai_last_skip_at: new Date().toISOString(),
          ai_last_error: String(msg).slice(0, 500),
          ai_last_error_at: new Date().toISOString(),
        })
        return { replied: false, skipped: 'insert_failed', aiMode }
      }

      let offerId: string | null = null
      if (decision.offer && approvedOffer && !decision.escalate && !providerReview) {
        try {
          const created = await createOfferFromDecision(db, {
            conversationId: opts.conversationId,
            conv,
            provider,
            client,
            offer: decision.offer,
            pricing,
            memory,
            guardedPriceCents: approvedOffer.priceCents,
          })
          if (created) {
            offerId = created.id
            memory = created.memory
          }
        } catch (err) {
          console.warn('[messengerAi] offer create skipped', err instanceof Error ? err.message : err)
        }
      }

      const shouldEscalate = Boolean(decision.escalate || providerReview)
      const nextMode: AiMode = shouldEscalate ? 'paused' : aiMode
      const nextMeta = {
        ...(conv.metadata || {}),
        ai_mode: nextMode,
        ai_disclosed: true,
        ai_brand: 'YQAA',
        ai_memory: memory,
        ai_last_reply_at: new Date().toISOString(),
        ai_last_trigger_message_id: opts.triggerMessageId || lastMsg.id,
        ai_last_message_id: inserted.id,
        ai_last_offer_id: offerId,
        ai_last_pricing_status: pricing.status,
        ai_last_pricing_reference_mean_cents: pricing.referenceMeanCents,
        ai_last_error: null,
        ai_last_skip: null,
        ...(shouldEscalate ? { ai_escalated_at: new Date().toISOString(), ai_escalation_reason: providerReview ? 'pricing_provider_review' : 'model_escalation' } : {}),
      }
      await db
        .from('conversations')
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq('id', opts.conversationId)
        .then(() => null, () => null)

      return { replied: true, messageId: inserted.id, offerId, aiMode: nextMode }
    } finally {
      await clearTypingBubble(db, typingId)
    }
  })().finally(() => {
    pendingLocks.delete(key)
  })

  pendingLocks.set(key, run)
  return run
}

export function scheduleAutoReply(conversationId: string, triggerMessageId?: string | null) {
  const work = maybeAutoReply({ conversationId, triggerMessageId })
    .then(async (result) => {
      if (result?.replied) return result
      const skip = result?.skipped
      if (skip === 'empty_reply' || skip === 'empty_thread' || skip === 'not_found') {
        try {
          const db = createSupabaseAdminClient()
          await recordAiDiagnostic(db, conversationId, {
            ai_last_skip: skip,
            ai_last_skip_at: new Date().toISOString(),
            ai_last_error: `YQAA skipped: ${skip}`,
            ai_last_error_at: new Date().toISOString(),
          })
        } catch {
          /* ignore */
        }
      }
      return result
    })
    .catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[messengerAi] scheduleAutoReply', msg)
      try {
        const db = createSupabaseAdminClient()
        await recordAiDiagnostic(db, conversationId, {
          ai_last_skip: 'schedule_exception',
          ai_last_skip_at: new Date().toISOString(),
          ai_last_error: msg.slice(0, 500),
          ai_last_error_at: new Date().toISOString(),
          ai_last_trigger_message_id: triggerMessageId || null,
        })
      } catch {
        /* ignore */
      }
    })

  try {
    getCloudflareContext().ctx.waitUntil(work)
  } catch {
    void work
  }
}

export function isClientRole(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase()
  return r === 'client' || r === 'student'
}

export function isProviderRole(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase()
  return r === 'attorney' || r === 'consultant'
}
