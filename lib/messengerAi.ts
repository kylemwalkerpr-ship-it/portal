/**
 * SuperGrok AI closer for provider↔client DMs (Part B).
 *
 * - ai_mode on conversations.metadata: auto | paused | off
 * - Auto-reply on inbound client/student messages via Grok / xAI
 * - Disclosure + YMYL safety; escalate when unsure
 * - Optional offer creation via the same shape as quick-offer
 * - Human Take over / human outbound message pauses AI
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
import { getCloudflareContext } from '@opennextjs/cloudflare'

export type AiMode = 'auto' | 'paused' | 'off'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const CLIENT_ROLES = new Set(['client', 'student'])
const DEBOUNCE_MS = 8_000
const REPLY_COOLDOWN_MS = 4_000

/** In-process debounce locks (per isolate / worker). */
const pendingLocks = new Map<string, Promise<AiReplyResult | null>>()
const lastTriggerAt = new Map<string, number>()

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
  // Default: AI closer is on until a human pauses / turns it off.
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
    // Column may not exist until migration is applied — treat as empty metadata.
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


/** Persist AI skip/error diagnostics on conversation.metadata (no secrets). */
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
    console.warn(
      '[messengerAi] recordAiDiagnostic failed',
      err instanceof Error ? err.message : err,
    )
  }
}

export type MessengerGrokAuth = {
  apiKey: string
  baseURL: string
  model: string
  authMode: 'supergrok' | 'vault' | 'env'
}

/**
 * Credential resolution (Content Studio parity):
 * 1. SuperGrok OAuth / vault tokens in ai_settings (device login)
 * 2. AI Key Vault pasted grok key (ai_provider_keys → XAI_API_KEY)
 * 3. Worker / process env XAI_API_KEY or GROK_API_KEY (fallback only)
 *
 * Portal SuperGrok auth is primary — do not require a separate pasted key
 * when Content Studio OAuth already works.
 */
export async function resolveMessengerGrokAuth(): Promise<MessengerGrokAuth> {
  let vaultOverlay: Record<string, string> = {}
  try {
    const { buildVaultEnvOverrides } = await import('@/lib/aiKeyVault')
    vaultOverlay = await buildVaultEnvOverrides(false)
  } catch (err) {
    console.warn(
      '[messengerAi] AI Key Vault overlay unavailable',
      err instanceof Error ? err.message : err,
    )
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

  // 1) SuperGrok OAuth (same path as Content Studio refreshAiVault)
  try {
    const oauth = await ensureSuperGrokAccessToken()
    if (oauth?.accessToken) {
      return { apiKey: oauth.accessToken, baseURL, model, authMode: 'supergrok' }
    }
  } catch (err) {
    console.warn('[messengerAi] SuperGrok OAuth unavailable', err instanceof Error ? err.message : err)
  }

  // 2) Vault pasted key (Content Studio Configure → grok)
  const vaultKey = vaultOverlay.XAI_API_KEY?.trim() || ''
  if (vaultKey) {
    return { apiKey: vaultKey, baseURL, model, authMode: 'vault' }
  }

  // 3) Env fallback only
  const apiKey =
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    ''
  if (!apiKey) {
    throw new Error(
      'Grok is not configured for messenger AI. Connect SuperGrok in Content Studio (primary), or set XAI_API_KEY / GROK_API_KEY as fallback.',
    )
  }
  return { apiKey, baseURL, model, authMode: 'env' }
}

/** @deprecated use resolveMessengerGrokAuth */
async function resolveGrokAuth(): Promise<MessengerGrokAuth> {
  return resolveMessengerGrokAuth()
}

const SYSTEM_PROMPT = `You are **YouSafe Assistant** — the marketplace concierge for YouSafe (Yousafe Consultancy).

IDENTITY (non-negotiable):
- You are YouSafe's disclosed AI site assistant. You help clients and students connect with a licensed provider (attorney or consultant) on this thread.
- You are NOT the provider, NOT a licensed attorney/consultant, and you never silently impersonate them.
- Speak as YouSafe Assistant supporting "{provider}" (the live specialist named in context) — warm marketplace host + helpful closer, not a dry bot footer.
- First reply (and whenever unclear) must include a natural on-brand disclosure, e.g.:
  "Hey — I'm YouSafe Assistant, the AI concierge on YouSafe helping you connect with {provider}. I'm not a licensed attorney myself — I'll help scope your needs and loop in the human specialist when it matters."
  Adapt tone to the client's message; keep it human and confident, not a legal disclaimer dump.

VOICE / BRAND:
- Professional, warm, immigration & education marketplace confident.
- Clear, concise, encouraging — like a sharp marketplace host who knows escrow, gigs, and offers.
- Prefer short paragraphs or tight bullets (2–5 beats). No corporate fluff, no scare tactics.
- Celebrate that YouSafe keeps messaging, documents, offers, and escrow on one trusted platform.

HARD RULES (legal / YMYL):
1. Always disclose YouSafe Assistant (AI) — never claim you are the licensed provider.
2. No outcome guarantees (visa approvals, case wins, refunds, timelines as promises).
3. Do not invent jurisdiction-specific legal advice, bar numbers, credentials, or statutes. Scope discovery only; escalate for licensed opinions.
4. High-risk / uncertain / court deadlines / criminal / asylum / removal / "are you a lawyer?" → say the human provider should take over. Set escalate=true.
5. Never ask the client to leave the platform, share personal contact info, or pay off-platform.
6. Prefer SITE KNOWLEDGE + this provider's live profile/gigs for product answers. Do not invent fee math, policies, or gig ids.

DISCOVERY:
- Ask order-critical questions (country, case type, deadlines, docs already held, budget/timeline expectations).
- Use document summaries when present; ask clarifying questions if incomplete.
- Ground recommendations in THIS provider's live gigs/profile when relevant, while staying in YouSafe Assistant voice.

OFFERS:
- Only propose an offer when discovery is enough AND you have a sensible title, price (USD dollars), and delivery_days.
- Offers must be realistic; never invent a gig_id — only use gig ids listed in site/provider context.
- If not ready, set offer=null and keep gathering requirements warmly.

SITE KNOWLEDGE:
- A SITE KNOWLEDGE appendix (platform identity, FAQ, escrow/offers, policies/YMYL) plus live provider/gig context is appended below.
- Prefer those sources. When unsure, disclose limits and set escalate=true.

RESPONSE FORMAT — return ONLY valid JSON (no markdown fences):
{
  "reply": "message text shown to the client (on-brand YouSafe Assistant voice; include AI disclosure on first reply or when unclear)",
  "escalate": false,
  "offer": null
}
OR when ready:
{
  "reply": "...",
  "escalate": false,
  "offer": {
    "title": "short title",
    "description": "scope summary ≥30 chars",
    "price_usd": 199,
    "delivery_days": 5,
    "revisions": 1,
    "expires_in_days": 7
  }
}
`

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
    if (!parsed.reply || typeof parsed.reply !== 'string') {
      throw new Error('missing reply')
    }
    return parsed
  } catch {
    // Soft fallback: treat whole model output as the reply text.
    return { reply: text.slice(0, 4000) || 'Thanks — a human on our team will follow up shortly.', escalate: true, offer: null }
  }
}

async function callGrokChat(args: {
  system: string
  user: string
}): Promise<string> {
  const auth = await resolveGrokAuth()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55_000)
  try {
    // Prefer chat/completions for short conversational turns; fall back to responses.
    const chatRes = await fetch(`${auth.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: auth.model,
        temperature: 0.5,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
      }),
      signal: controller.signal,
    })
    const chatText = await chatRes.text()
    if (chatRes.ok) {
      const json = JSON.parse(chatText) as any
      const content =
        json?.choices?.[0]?.message?.content ||
        json?.choices?.[0]?.text ||
        ''
      if (String(content).trim()) return String(content).trim()
    }

    // Fallback: Responses API (SuperGrok / grok-4.6 primary path)
    const respRes = await fetch(`${auth.baseURL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: auth.model,
        input: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
        max_output_tokens: 1200,
      }),
      signal: controller.signal,
    })
    const respText = await respRes.text()
    if (!respRes.ok) {
      throw new Error(`Grok failed (${chatRes.status}/${respRes.status}): ${respText.slice(0, 240)}`)
    }
    const json = JSON.parse(respText) as any
    const fromOutput =
      json?.output_text ||
      (Array.isArray(json?.output)
        ? json.output
            .flatMap((o: any) => o?.content || [])
            .map((c: any) => c?.text || '')
            .join('\n')
        : '') ||
      json?.choices?.[0]?.message?.content ||
      ''
    if (!String(fromOutput).trim()) throw new Error('Grok returned empty content')
    return String(fromOutput).trim()
  } finally {
    clearTimeout(timer)
  }
}

async function summarizeAttachments(db: any, messages: any[]): Promise<string> {
  const attachments = messages.filter(
    (m) => m.attachment_url || m.type === 'attachment' || m.attachment_name,
  )
  if (!attachments.length) return '(no attachments)'

  const lines: string[] = []
  for (const m of attachments.slice(-8)) {
    const name = m.attachment_name || 'file'
    const url = m.attachment_url || ''
    let excerpt = ''
    try {
      if (url && /\.(txt|csv|md)(\?|$)/i.test(name + url)) {
        const res = await fetch(url)
        if (res.ok) {
          const t = await res.text()
          excerpt = t.slice(0, 2500)
        }
      } else if (url && /\.pdf(\?|$)/i.test(name + url)) {
        // Best-effort: pull raw bytes and keep a short latin1 sniff of extractable text.
        const res = await fetch(url)
        if (res.ok) {
          const ab = await res.arrayBuffer()
          const raw = new TextDecoder('latin1').decode(ab)
          const texts = [...raw.matchAll(/\((?:\\\)|[^)]){4,200}\)/g)]
            .map((x) => x[0].slice(1, -1))
            .filter((s) => /[A-Za-z]{3}/.test(s))
          excerpt = texts.join(' ').slice(0, 2500) || '(PDF attached; binary text extraction limited — ask client to confirm key fields)'
        }
      } else if (url && /^image\//i.test(String(m.metadata?.mime_type || '')) || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(name + url)) {
        excerpt = '(image attached — describe what you need from it; do not invent contents)'
      }
    } catch {
      excerpt = '(could not fetch attachment)'
    }
    lines.push(`- ${name}${url ? ` · ${url.slice(0, 120)}` : ''}${excerpt ? `\n  excerpt: ${excerpt}` : ''}`)
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
  return { provider, client, profiles: list }
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

async function createOfferFromDecision(
  db: any,
  args: {
    conversationId: string
    conv: any
    provider: any
    client: any
    offer: NonNullable<GrokDecision['offer']>
  },
): Promise<string | null> {
  const settings = await getPaymentSettingsForApi()
  const title = String(args.offer.title || '').trim().slice(0, 120)
  const descriptionRaw = String(args.offer.description || '').trim().slice(0, 1200)
  const description =
    descriptionRaw.length >= 30
      ? descriptionRaw
      : `${descriptionRaw || title} — AI-assisted offer draft from messenger. Scope to be confirmed by the provider before work begins.`.slice(0, 1200)
  const priceUsd = args.offer.price_usd ?? args.offer.price
  const price = toCents(priceUsd)
  const deliveryDays = Number(args.offer.delivery_days)
  const revisions = normalizeRevision(args.offer.revisions ?? 1)
  const expiresInDays = Math.max(1, Math.min(60, Number(args.offer.expires_in_days || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)

  if (title.length < 5) return null
  if (!Number.isInteger(price) || price < settings.minimum_offer_amount_cents) return null
  if (price > settings.maximum_offer_amount_cents) return null
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1) return null

  const providerType = args.provider.role === 'consultant' ? 'consultant' : 'attorney'
  const inquiryId =
    providerType === 'attorney'
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
  if (rawGigId) {
    const { data: gig } = await db
      .from('gigs')
      .select('id, provider_id, status')
      .eq('id', rawGigId)
      .maybeSingle()
    if (gig && gig.provider_id === args.provider.id && gig.status !== 'archived') {
      attachedGigId = gig.id
    }
  }

  const chatId = providerType === 'attorney' ? inquiryId! : args.conversationId
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

  const messageBody = `Custom offer · ${title} · ${settings.primary_currency.toUpperCase()} ${(price / 100).toFixed(0)} · ${deliveryDays}-day delivery`
  if (providerType === 'attorney' && inquiryId) {
    await db
      .from('inquiry_messages')
      .insert({
        inquiry_id: inquiryId,
        sender_role: 'system',
        sender_profile_id: args.provider.id,
        body: messageBody,
      })
      .then(() => null, () => null)
  }

  await db
    .from('conversation_messages')
    .insert({
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
      },
    })
    .then(() => null, () => null)

  // Touch fee helpers so unused-import lint stays quiet if tree-shaken oddly.
  void computePlatformFeeCents(price, providerType, settings)
  void computeNetPayoutCents(price, providerType, settings)

  return offer.id as string
}

/**
 * Core auto-reply. Safe to call after an inbound client message.
 * Debounced; no double-reply for the same trigger.
 */
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
    if (!opts.force && now - last < DEBOUNCE_MS) {
      return { replied: false, skipped: 'debounced' }
    }
    lastTriggerAt.set(key, now)

    const db = createSupabaseAdminClient()
    const conv = await getConversationAiState(db, opts.conversationId)
    if (!conv) return { replied: false, skipped: 'not_found' }
    const aiMode = conv.ai_mode as AiMode
    if (aiMode !== 'auto' && !opts.force) {
      return { replied: false, skipped: `ai_mode_${aiMode}`, aiMode }
    }

    const { provider, client } = await resolveProviderAndClient(db, conv)
    if (!provider || !client) {
      await recordAiDiagnostic(db, opts.conversationId, {
        ai_last_skip: 'not_provider_client_thread',
        ai_last_skip_at: new Date().toISOString(),
        ai_last_error: 'Thread is not provider↔client/student — AI closer skipped',
        ai_last_error_at: new Date().toISOString(),
      })
      return { replied: false, skipped: 'not_provider_client_thread', aiMode }
    }

    const { data: messages } = await db
      .from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, metadata, created_at')
      .eq('conversation_id', opts.conversationId)
      .order('created_at', { ascending: true })
      .limit(80)

    const msgs = messages || []
    const lastMsg = msgs[msgs.length - 1]
    if (!lastMsg) return { replied: false, skipped: 'empty_thread', aiMode }

    // Persist default ai_mode=auto so Take over / Resume UI has an explicit value.
    if (aiMode === 'auto' && (conv.metadata as any)?.ai_mode == null) {
      await recordAiDiagnostic(db, opts.conversationId, {
        ai_mode: 'auto',
        ai_mode_defaulted_at: new Date().toISOString(),
      })
      conv.metadata = { ...(conv.metadata || {}), ai_mode: 'auto' }
    }

    // Only reply when the latest message is from the client (unless forced).
    if (!opts.force && lastMsg.sender_id !== client.id) {
      return { replied: false, skipped: 'last_not_client', aiMode }
    }

    // Don't double-reply to the same trigger message.
    const meta = conv.metadata || {}
    if (
      opts.triggerMessageId &&
      meta.ai_last_trigger_message_id === opts.triggerMessageId
    ) {
      return { replied: false, skipped: 'already_replied_trigger', aiMode }
    }
    if (
      meta.ai_last_reply_at &&
      Date.now() - new Date(String(meta.ai_last_reply_at)).getTime() < REPLY_COOLDOWN_MS
    ) {
      return { replied: false, skipped: 'cooldown', aiMode }
    }

    // If the last AI message already exists after the client message, skip.
    const lastAi = [...msgs].reverse().find((m) => m?.metadata?.ai_generated)
    if (lastAi && lastMsg.created_at && lastAi.created_at >= lastMsg.created_at) {
      return { replied: false, skipped: 'ai_already_after_client', aiMode }
    }

    const history = msgs
      .slice(-30)
      .map((m) => {
        const who =
          m.sender_id === provider.id
            ? m?.metadata?.ai_generated
              ? 'AI_ASSISTANT'
              : 'PROVIDER'
            : m.sender_id === client.id
              ? 'CLIENT'
              : 'OTHER'
        const body = m.body || (m.attachment_name ? `[attachment: ${m.attachment_name}]` : `[${m.type}]`)
        return `${who}: ${body}`
      })
      .join('\n')

    const docSummary = await summarizeAttachments(db, msgs)
    const disclosed = Boolean(meta.ai_disclosed)
    const latestClientText = [...msgs]
      .reverse()
      .find((m) => m.sender_id === client.id)?.body || lastMsg.body || ''
    let siteAppendix = ''
    try {
      const pack = await buildMessengerSiteKnowledge({
        db,
        provider,
        latestUserMessage: String(latestClientText || ''),
      })
      siteAppendix = pack.systemAppendix
    } catch (err) {
      console.warn(
        '[messengerAi] site knowledge pack failed',
        err instanceof Error ? err.message : err,
      )
    }
    const providerLabel = provider.full_name || provider.email || 'this YouSafe specialist'
    const systemBase = SYSTEM_PROMPT.replace(/\{provider\}/g, providerLabel)
    const systemWithSite = siteAppendix
      ? `${systemBase}\n\n${siteAppendix}`
      : systemBase
    const userPrompt = [
      `Provider: ${provider.full_name || provider.email} (role=${provider.role})`,
      `Client: ${client.full_name || client.email}`,
      `Context: ${conv.context_kind || 'general'}${conv.context_id ? ` #${conv.context_id}` : ''}`,
      `AI disclosure already sent in this thread: ${disclosed ? 'yes' : 'no — include a clear disclosure in reply'}`,
      '',
      'Recent thread:',
      history || '(no messages)',
      '',
      'Document / attachment summaries:',
      docSummary,
    ].join('\n')

    let decision: GrokDecision
    try {
      const raw = await callGrokChat({ system: systemWithSite, user: userPrompt })
      decision = parseDecision(raw)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[messengerAi] grok call failed', msg)
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
    if (!replyText) return { replied: false, skipped: 'empty_reply', aiMode }
    if (
      !disclosed &&
      !/yousafe assistant|i'?m an ai|artificial intelligence|ai concierge|automated assistant/i.test(replyText)
    ) {
      replyText =
        `Hey — I'm **YouSafe Assistant**, the AI concierge on YouSafe helping you connect with ${providerLabel}. I'm not a licensed attorney myself.\n\n` +
        replyText
    }

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
          ai_escalate: Boolean(decision.escalate),
          disclosure: true,
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
    if (decision.offer && !decision.escalate) {
      try {
        offerId = await createOfferFromDecision(db, {
          conversationId: opts.conversationId,
          conv,
          provider,
          client,
          offer: decision.offer,
        })
      } catch (err) {
        console.warn('[messengerAi] offer create skipped', err instanceof Error ? err.message : err)
      }
    }

    const nextMode: AiMode = decision.escalate ? 'paused' : aiMode
    const nextMeta = {
      ...(conv.metadata || {}),
      ai_mode: nextMode,
      ai_disclosed: true,
      ai_last_reply_at: new Date().toISOString(),
      ai_last_trigger_message_id: opts.triggerMessageId || lastMsg.id,
      ai_last_message_id: inserted.id,
      ai_last_error: null,
      ai_last_skip: null,
      ...(decision.escalate ? { ai_escalated_at: new Date().toISOString() } : {}),
    }
    await db
      .from('conversations')
      .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
      .eq('id', opts.conversationId)
      .then(() => null, () => null)

    return {
      replied: true,
      messageId: inserted.id,
      offerId,
      aiMode: nextMode,
    }
  })().finally(() => {
    pendingLocks.delete(key)
  })

  pendingLocks.set(key, run)
  return run
}

/**
 * Schedule AI auto-reply without blocking the HTTP response.
 *
 * Critical on Cloudflare Workers / OpenNext: bare `void promise` is cancelled
 * as soon as the response is sent. Use getCloudflareContext().ctx.waitUntil()
 * (same pattern as /api/indexnow). next/server after() does NOT keep work alive
 * under this OpenNext setup.
 */
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
            ai_last_error: `AI closer skipped: ${skip}`,
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
    // Local / non-Workers runtime — Node keeps the process alive for the promise.
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
