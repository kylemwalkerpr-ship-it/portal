/**
 * POST /api/messages/conversations/[id]/quick-offer
 *
 * Single-line offer from inside any conversation. Built for attorneys
 * (and consultants) who want to fire a custom order proposal from the
 * chat without opening the full offer modal.
 *
 * Body:
 *   { title: string;            // e.g. "Reinstate F-1 status — fast-track"
 *     price: number;            // cents
 *     delivery_days: number;    // ≥ 1
 *     description?: string;     // optional; auto-derived from title if absent
 *     revisions?: number;       // defaults to 1
 *     expires_in_days?: number; // defaults to 7
 *   }
 *
 * Resolves the counterpart from the conversation row, finds or creates an
 * inquiry between the attorney and the client (this is required because
 * the offers table is keyed by chat_id = inquiry_id for attorneys), then
 * inserts the offer and posts a system message into BOTH the inquiry
 * thread and the unified conversation thread.
 */
import { ok, fail, fieldFail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi, normalizeRevision, toCents } from '@/lib/fiverr'

async function resolveProviderRow(auth: any) {
  if (auth.role === 'attorney') {
    const { data } = await auth.db.from('attorneys').select('*').eq('profile_id', auth.profileId).maybeSingle()
    return data ? { type: 'attorney' as const, record: data } : null
  }
  if (auth.role === 'consultant') {
    const { data } = await auth.db.from('consultants').select('*').eq('profile_id', auth.profileId).maybeSingle()
    return data ? { type: 'consultant' as const, record: data } : null
  }
  return null
}

/** Find (or create) an inquiry the offer can hang off. */
async function ensureInquiryThread(db: any, attorneyProfileId: string, clientProfileId: string, conversationContextId: string | null): Promise<string | null> {
  // Best case: conversation already references an inquiry directly.
  if (conversationContextId) {
    const { data } = await db
      .from('inquiries')
      .select('id')
      .eq('id', conversationContextId)
      .maybeSingle()
    if (data?.id) return data.id
  }
  // Fall back to the most recent existing inquiry for this pair.
  const { data: existing } = await db
    .from('inquiries')
    .select('id')
    .eq('client_profile_id', clientProfileId)
    .eq('target_attorney_profile_id', attorneyProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id

  // Last resort: create a pre-intake inquiry so the offer has somewhere to live.
  const { data: created } = await db
    .from('inquiries')
    .insert({
      client_profile_id: clientProfileId,
      target_attorney_profile_id: attorneyProfileId,
      case_type: 'attorney_chat',
      case_type_label: 'Attorney conversation',
      urgency: 'normal',
      answers: {},
      meta: { started_from: 'conversation_quick_offer', pre_intake: true },
      source: 'portal_attorney_chat',
      status: 'engaged',
    })
    .select('id')
    .maybeSingle()
  return (created as any)?.id || null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'attorney' && auth.role !== 'consultant') {
    return fail('Only attorneys and consultants can send offers.', 403)
  }

  const provider = await resolveProviderRow(auth)
  if (!provider) return fail('Provider record not found.', 404)

  const connectReady = Boolean(provider.record.stripe_account_id && provider.record.stripe_onboarding_complete)
  const bypassed    = Boolean(provider.record.stripe_bypass)
  if (!connectReady && !bypassed) {
    return fail('Connect a payout account before sending an offer.', 412, { requires_connect: true })
  }

  const { id: conversationId } = await ctx.params
  const body = await req.json().catch(() => ({}))

  // ── Load conversation + ownership check ─────────────────────────────
  const { data: conv } = await auth.db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return fail('Conversation not found.', 404)
  const isParticipant = conv.participant_a === auth.profileId || conv.participant_b === auth.profileId
  if (!isParticipant) return fail('Forbidden.', 403)
  const counterpartId = conv.participant_a === auth.profileId ? conv.participant_b : conv.participant_a

  // ── Resolve the inquiry the offer hangs off ─────────────────────────
  const inquiryContextId = conv.context_kind === 'inquiry' ? conv.context_id : null
  const inquiryId = provider.type === 'attorney'
    ? await ensureInquiryThread(auth.db, auth.profileId, counterpartId, inquiryContextId)
    : null
  if (provider.type === 'attorney' && !inquiryId) {
    return fail('Could not resolve a thread to attach the offer to.', 500)
  }

  // ── Validate body ───────────────────────────────────────────────────
  const settings = await getPaymentSettingsForApi()
  const fields: Record<string, string> = {}

  const title = String(body.title || '').trim().slice(0, 120)
  // Title is the most useful one-line — auto-expand to fill description minimum
  // so attorneys don't have to type the same thing twice for a quick offer.
  const descriptionRaw = String(body.description || '').trim().slice(0, 1200)
  const description = descriptionRaw.length >= 30
    ? descriptionRaw
    : (descriptionRaw
        ? `${descriptionRaw} — sent as a quick offer from messages.`
        : `${title} — quick offer sent from messages. Full scope to be confirmed before work begins.`).slice(0, 1200)
  const price = toCents(body.price)
  const deliveryDays = Number(body.delivery_days)
  const revisions = normalizeRevision(body.revisions ?? 1)
  const expiresInDays = Math.max(1, Math.min(60, Number(body.expires_in_days || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000)

  if (title.length < 5) fields.title = 'Add at least a few words for the title.'
  if (!Number.isInteger(price) || price < settings.minimum_offer_amount_cents) {
    fields.price = `Price must be at least $${(settings.minimum_offer_amount_cents / 100).toFixed(0)}.`
  }
  if (Number.isInteger(price) && price > settings.maximum_offer_amount_cents) {
    fields.price = `Price cannot exceed $${(settings.maximum_offer_amount_cents / 100).toLocaleString()}.`
  }
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1) fields.delivery_days = 'Delivery must be 1 day or more.'
  if (Object.keys(fields).length) return fieldFail(fields)

  const platformFee = computePlatformFeeCents(price, provider.type, settings)
  const netPayout   = computeNetPayoutCents(price, provider.type, settings)

  const chatId = provider.type === 'attorney' ? inquiryId! : conversationId
  const { data: offer, error } = await auth.db
    .from('offers')
    .insert({
      chat_id:        chatId,
      sender_id:      auth.profileId,
      sender_type:    provider.type,
      recipient_id:   counterpartId,
      title,
      description,
      price,
      currency:       settings.primary_currency,
      delivery_days:  deliveryDays,
      revisions,
      expires_at:     expiresAt.toISOString(),
    })
    .select('*')
    .maybeSingle()
  if (error || !offer) return fail(error?.message || 'Could not create offer.', 500)

  // Drop a system message into the legacy thread (inquiry_messages for
  // attorneys; order_messages would be for consultants but only when the
  // chat is an order — we skip for now).
  const messageBody = `Custom offer · ${title} · ${settings.primary_currency.toUpperCase()} ${(price / 100).toFixed(0)} · ${deliveryDays}-day delivery`
  if (provider.type === 'attorney') {
    await auth.db.from('inquiry_messages').insert({
      inquiry_id: chatId, sender_role: 'system', sender_profile_id: auth.profileId, body: messageBody,
    }).then(() => null, () => null)
  }

  // Also mirror into conversation_messages so the unified inbox shows it
  // as an inline offer event without an extra round trip.
  await auth.db.from('conversation_messages').insert({
    conversation_id: conversationId,
    sender_id:       auth.profileId,
    type:            'offer',
    body:            messageBody,
    ref_offer_id:    (offer as any).id,
    ref_inquiry_id:  inquiryId,
    metadata: {
      title,
      price,
      currency:      settings.primary_currency,
      delivery_days: deliveryDays,
      expires_at:    expiresAt.toISOString(),
    },
  }).then(() => null, () => null)

  return ok({
    offer_id: (offer as any).id,
    status: (offer as any).status,
    inquiry_id: inquiryId,
    platform_fee_cents: platformFee,
    net_payout_cents:  netPayout,
  }, { status: 201 })
}
