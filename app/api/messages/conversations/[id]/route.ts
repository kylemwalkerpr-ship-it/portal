/**
 * GET  /api/messages/conversations/[id]    — fetch a thread (messages + counterpart + sidebar context)
 * POST /api/messages/conversations/[id]    — send a text/attachment message
 * PATCH /api/messages/conversations/[id]   — mark as read (body: { read: true }) or archive (body: { archived: true|false })
 */
import { requirePortalUser } from '@/lib/portalAuth'
import { safetyGuard } from '@/lib/safety'

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

  // Brief 47 §6.1: fetch source inquiry archived_at for messenger banner
  let sourceInquiryArchivedAt: string | null = null
  if (conv.context_kind === 'inquiry' && conv.context_id) {
    try {
      const { data: inq } = await db
        .from('inquiries')
        .select('archived_at')
        .eq('id', conv.context_id)
        .maybeSingle()
      sourceInquiryArchivedAt = inq?.archived_at || null
    } catch {
      // non-fatal
    }
  }

  const [messagesRes, counterpartRes, participantRes] = await Promise.all([
    db.from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, ref_inquiry_id, reply_to_id, metadata, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
    db.from('profiles').select('id, full_name, email, avatar_url, role').eq('id', counterpartId).maybeSingle(),
    db.from('conversation_participants')
      .select('starred_message_ids, pinned_at, archived_at, muted_until')
      .eq('conversation_id', id)
      .eq('profile_id', profileId)
      .maybeSingle(),
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
    // STEP 1 — base offer rows (guaranteed to succeed; no embeds).
    // Earlier versions embedded `gigs(...)` and `offer_files(...)` which
    // could throw a 400 on missing FK relationships or missing tables and
    // wipe out the WHOLE enrichment, leaving every offer bubble blank on
    // the student side. We fetch the base shape first, then attempt the
    // gig join in a second best-effort pass.
    let offerRows: any[] = []
    try {
      const { data, error } = await db
        .from('offers')
        .select('id, title, description, price, discounted_price, currency, delivery_days, revisions, expires_at, status, gig_id')
        .in('id', offerIds)
      if (error) {
        console.error('[conversations] base offer query failed', error)
      }
      offerRows = data ?? []
    } catch (e) {
      console.error('[conversations] base offer query threw', e)
    }

    for (const row of offerRows) {
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
        gig_id: row.gig_id ?? undefined,
      })
    }

    // STEP 2 — attach linked gig info (best-effort, doesn't touch offer rows).
    const gigIds = offerRows
      .map((r) => r.gig_id)
      .filter((g): g is string => typeof g === 'string' && g.length > 0)
    if (gigIds.length) {
      try {
        const { data: gigRows } = await db
          .from('gigs')
          .select('id, title, slug')
          .in('id', Array.from(new Set(gigIds)))
        const gigMap = new Map((gigRows ?? []).map((g: any) => [g.id, g]))
        for (const [id, offer] of offerMap.entries()) {
          const g = offer.gig_id ? gigMap.get(offer.gig_id) : null
          if (g) offerMap.set(id, { ...offer, linked_gig: { id: g.id, title: g.title, slug: g.slug } })
        }
      } catch (e) {
        // Non-fatal — leave linked_gig undefined.
        console.warn('[conversations] gig enrichment skipped', e)
      }
    }
  }

  // Hydrate reply previews
  const replyIds = Array.from(new Set(
    rawMessages.map((m) => m?.reply_to_id).filter(Boolean),
  ))
  const replyMap = new Map<string, any>()
  if (replyIds.length) {
    try {
      const { data: replyRows } = await db
        .from('conversation_messages')
        .select('id, sender_id, body')
        .in('id', replyIds as string[])
      for (const r of (replyRows || [])) replyMap.set(r.id, r)
    } catch (e) {
      console.warn('[conversations] reply preview enrichment skipped', e)
    }
  }

  // Hydrate reactions for all messages in one query
  const messageIds = rawMessages.map((m) => m.id).filter(Boolean)
  const reactionMap = new Map<string, Array<{ emoji: string; count: number; mine: boolean }>>()
  if (messageIds.length) {
    try {
      const { data: reactionRows } = await db
        .from('conversation_message_reactions')
        .select('message_id, emoji, profile_id')
        .in('message_id', messageIds as string[])
      for (const r of (reactionRows || [])) {
        const list = reactionMap.get(r.message_id) || []
        const existing = list.find((x) => x.emoji === r.emoji)
        if (existing) {
          existing.count++
          if (r.profile_id === profileId) existing.mine = true
        } else {
          list.push({ emoji: r.emoji, count: 1, mine: r.profile_id === profileId })
        }
        reactionMap.set(r.message_id, list)
      }
    } catch (e) {
      console.warn('[conversations] reactions enrichment skipped', e)
    }
  }

  const messages = rawMessages.map((m) => {
    let enriched: any = m
    if (m?.type === 'offer' && m?.ref_offer_id && offerMap.has(m.ref_offer_id)) {
      enriched = { ...enriched, offer: offerMap.get(m.ref_offer_id) }
    }
    if (m?.reply_to_id && replyMap.has(m.reply_to_id)) {
      const ref = replyMap.get(m.reply_to_id)
      enriched = {
        ...enriched,
        reply_preview: {
          id: ref.id,
          sender_id: ref.sender_id,
          snippet: String(ref.body || '').slice(0, 120),
        },
      }
    }
    const reactions = reactionMap.get(m.id)
    if (reactions) {
      enriched = { ...enriched, reactions }
    }
    return enriched
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
      source_inquiry_archived_at: sourceInquiryArchivedAt,
    },
    messages,
    sidebar: {
      orders: sharedOrders,
      offers: sharedOffers,
    },
    participant: participantRes.data || null,
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

  let reply_to_id: string | null = body.reply_to_id || null
  if (reply_to_id) {
    const { data: refMsg } = await db
      .from('conversation_messages')
      .select('id')
      .eq('id', reply_to_id)
      .eq('conversation_id', id)
      .maybeSingle()
    if (!refMsg) reply_to_id = null
  }

  // Server-side safety gate — mirror of the client check in safety.ts. Hard
  // violations (emails, phones, off-platform links, payment apps, obfuscations)
  // block the send so policy is enforced even if the client check is bypassed.
  const safety = safetyGuard(text)
  if (!safety.ok) return Response.json({ error: safety.error, violations: safety.violations }, { status: 422 })

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
      reply_to_id:     reply_to_id,
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

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const { data: conv } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (!conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.participant_a !== profileId && conv.participant_b !== profileId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await db
    .from('conversation_participants')
    .upsert({
      conversation_id: id,
      profile_id:      profileId,
      deleted_at:      new Date().toISOString(),
    }, { onConflict: 'conversation_id,profile_id' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
