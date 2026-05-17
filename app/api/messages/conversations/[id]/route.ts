/**
 * GET  /api/messages/conversations/[id]    — fetch a thread (messages + counterpart + sidebar context)
 * POST /api/messages/conversations/[id]    — send a text/attachment message
 * PATCH /api/messages/conversations/[id]   — mark as read (body: { read: true }) or archive (body: { archived: true|false })
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const { data: conv, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, last_message_at, created_at')
    .eq('id', id)
    .single()
  if (error || !conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const counterpartId = conv.participant_a === profileId ? conv.participant_b : conv.participant_a

  const [messagesRes, counterpartRes] = await Promise.all([
    db.from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, ref_inquiry_id, metadata, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
    db.from('profiles').select('id, full_name, email, avatar_url, role').eq('id', counterpartId).maybeSingle(),
  ])

  // Sidebar context: orders, offers, inquiries this pair has in common
  let sharedOrders: any[] = []
  let sharedOffers: any[] = []
  try {
    const { data: orders } = await db
      .from('orders')
      .select('id, order_number, status, total_amount, escrow_status, created_at')
      .or(`and(client_id.eq.${profileId},consultant_id.eq.${counterpartId}),and(client_id.eq.${counterpartId},consultant_id.eq.${profileId})`)
      .order('created_at', { ascending: false })
      .limit(20)
    sharedOrders = orders ?? []
  } catch {}

  // Hydrate offer-type messages with their offers (+ linked gig) in one query.
  const rawMessages: any[] = messagesRes.data || []
  const offerIds = Array.from(new Set(
    rawMessages
      .filter((m) => m?.type === 'offer' && m?.ref_offer_id)
      .map((m) => m.ref_offer_id as string),
  ))

  const offerMap = new Map<string, any>()
  if (offerIds.length) {
    try {
      const { data: offerRows } = await db
        .from('offers')
        .select('id, title, description, price, discounted_price, currency, delivery_days, revisions, expires_at, status, gig_id, gigs(id, title, slug), offer_files(file_url, file_name, file_size, mime_type)')
        .in('id', offerIds)
      for (const row of (offerRows ?? []) as any[]) {
        const gig = Array.isArray(row.gigs) ? row.gigs[0] : row.gigs
        const attachments = Array.isArray(row.offer_files)
          ? row.offer_files.map((f: any) => ({
              url: f.file_url,
              name: f.file_name,
              size: f.file_size,
              mime_type: f.mime_type,
            }))
          : undefined
        offerMap.set(row.id, {
          id: row.id,
          title: row.title,
          description: row.description,
          price_cents: row.price,
          discount_cents: row.discounted_price ?? undefined,
          currency: row.currency,
          delivery_days: row.delivery_days,
          revisions: row.revisions,
          expires_at: row.expires_at,
          status: row.status,
          linked_gig: gig ? { id: gig.id, title: gig.title, slug: gig.slug } : undefined,
          attachments: attachments && attachments.length ? attachments : undefined,
        })
      }
    } catch {
      // Best-effort enrichment: if it fails, messages still go back without offer payloads.
    }
  }

  const messages = rawMessages.map((m) => {
    if (m?.type === 'offer' && m?.ref_offer_id && offerMap.has(m.ref_offer_id)) {
      return { ...m, offer: offerMap.get(m.ref_offer_id) }
    }
    return m
  })

  return Response.json({
    conversation: {
      id: conv.id,
      counterpart: (counterpartRes as any).data || null,
      context_kind: conv.context_kind,
      context_id:   conv.context_id,
      status:       conv.status,
      created_at:   conv.created_at,
      last_message_at: conv.last_message_at,
    },
    messages,
    sidebar: {
      orders: sharedOrders,
      offers: sharedOffers,
    },
  })
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const body = await req.json().catch(() => ({}))
  const text = String(body.body || '').trim().slice(0, 8000)
  if (!text) return Response.json({ error: 'body is required' }, { status: 400 })

  // Ownership check
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: id,
      sender_id:       profileId,
      type:            'text',
      body:            text,
    })
    .select('id, sender_id, type, body, created_at')
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ message: data })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const body = await req.json().catch(() => ({}))

  // Ownership check
  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b, status')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (body.read === true) {
    await db.from('conversation_reads').upsert({
      conversation_id: id,
      profile_id:      profileId,
      last_read_at:    new Date().toISOString(),
    }, { onConflict: 'conversation_id,profile_id' })
  }

  if (typeof body.archived === 'boolean') {
    await db.from('conversations').update({
      status: body.archived ? 'archived' : 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', id)
  }

  return Response.json({ ok: true })
}
