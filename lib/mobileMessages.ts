import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'
import { safetyGuard, type SafetyViolation } from './safety'

/**
 * Shared logic for /api/mobile/messages* — Bearer-verified conversations.
 *
 * Same tables and shapes as /api/messages/conversations and
 * /api/messages/conversations/[id] (cookie auth), but identity comes from the
 * Bearer Clerk JWT so the native app can use it. Cookie auth is untouched.
 */

export type MobileProfileResult =
  | {
      status: 'authenticated'
      db: ReturnType<typeof createSupabaseAdminClient>
      profile: { id: string; role: string; status: string; email: string | null }
    }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }
  | { status: 'forbidden'; message: string; httpStatus: 403 | 404 }

/** Resolve any signed-in profile (like cookie requirePortalUser) from a Bearer JWT. */
export async function resolveMobileProfile(
  authorizationHeader: string | null | undefined,
): Promise<MobileProfileResult> {
  const auth = await verifyMobileBearer(authorizationHeader)
  if (auth.status !== 'authenticated') {
    return { status: 'unauthenticated', reason: auth.reason }
  }

  const db = createSupabaseAdminClient()
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('clerk_user_id', auth.userId)
    .single()
  if (error || !profile) return { status: 'forbidden', message: 'Profile not found.', httpStatus: 404 }
  if (profile.status === 'suspended') return { status: 'forbidden', message: 'Account suspended', httpStatus: 403 }

  return { status: 'authenticated', db, profile }
}

export function unauthorizedResponse(reason: 'missing' | 'invalid') {
  const message =
    reason === 'missing'
      ? 'Missing session token. User must sign in.'
      : 'Invalid session token. User must sign in.'
  return Response.json({ error: { message }, signInRequired: true }, { status: 401 })
}

/**
 * GET /api/mobile/messages/conversations — inbox list for the signed-in
 * profile. Mirrors GET /api/messages/conversations (same filters, same
 * per-conversation shape, same counts envelope).
 */
export async function listMobileConversations(
  req: Request,
  auth: { db: any; profile: { id: string } },
): Promise<Record<string, unknown>> {
  const { db, profile } = auth
  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter') || 'all'
  const q = searchParams.get('q')?.trim().toLowerCase() || ''
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  const { data: convs, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, last_message_id, created_at')
    .or(`participant_a.eq.${profile.id},participant_b.eq.${profile.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  const empty = {
    conversations: [],
    total: 0,
    page,
    page_size: pageSize,
    total_pages: 1,
    has_more: false,
    counts: { all: 0, unread: 0, archived: 0, favourites: 0, groups: 0, totalUnread: 0 },
  }
  if (error) throw new Error(error.message)
  const list: any[] = convs ?? []
  if (list.length === 0) return empty

  const convIds = list.map((c) => c.id)

  // Participant state (best-effort; table may not exist yet)
  let participantMap = new Map<string, any>()
  try {
    const { data: parts } = await db
      .from('conversation_participants')
      .select('conversation_id, pinned_at, archived_at, muted_until, deleted_at')
      .eq('profile_id', profile.id)
      .in('conversation_id', convIds)
    for (const p of parts ?? []) participantMap.set(p.conversation_id, p)
  } catch {
    // Non-fatal — table may not exist yet
  }

  // Batch hydrate counterpart profiles, last messages, reads
  const counterpartIds = list.map((c) => (c.participant_a === profile.id ? c.participant_b : c.participant_a))
  const lastMessageIds = list.map((c) => c.last_message_id).filter(Boolean)

  const [profilesRes, lastMessagesRes, readsRes, recentMsgsRes] = await Promise.all([
    counterpartIds.length
      ? db.from('profiles').select('id, full_name, email, avatar_url, role').in('id', counterpartIds)
      : Promise.resolve({ data: [] }),
    lastMessageIds.length
      ? db.from('conversation_messages').select('id, body, sender_id, type, attachment_name, created_at').in('id', lastMessageIds)
      : Promise.resolve({ data: [] }),
    db.from('conversation_reads').select('conversation_id, last_read_at').eq('profile_id', profile.id).in('conversation_id', convIds),
    db.from('conversation_messages')
      .select('conversation_id, sender_id, created_at')
      .in('conversation_id', convIds)
      .neq('sender_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const lastById = new Map((lastMessagesRes.data ?? []).map((m: any) => [m.id, m]))
  const readMap = new Map<string, number>((readsRes.data ?? []).map((r: any) => [r.conversation_id, new Date(r.last_read_at).getTime()]))

  const unreadByConv = new Map<string, number>()
  for (const m of recentMsgsRes.data ?? []) {
    const since = readMap.get((m as any).conversation_id) || 0
    if (new Date((m as any).created_at).getTime() > since) {
      unreadByConv.set((m as any).conversation_id, (unreadByConv.get((m as any).conversation_id) || 0) + 1)
    }
  }

  let conversations = list.map((c: any) => {
    const counterpartId = c.participant_a === profile.id ? c.participant_b : c.participant_a
    const counterpart: any = profileById.get(counterpartId)
    const lastMsg: any = c.last_message_id ? lastById.get(c.last_message_id) : null
    const unread = unreadByConv.get(c.id) || 0
    const preview = lastMsg ? (lastMsg.body || lastMsg.attachment_name || '(message)') : null
    const part = participantMap.get(c.id)
    return {
      id: c.id,
      counterpart: counterpart
        ? {
            id: counterpart.id,
            name: counterpart.full_name || counterpart.email || 'User',
            email: counterpart.email,
            avatar_url: counterpart.avatar_url,
            role: counterpart.role,
          }
        : null,
      context_kind: c.context_kind,
      context_id: c.context_id,
      status: c.status,
      type: c.type,
      last_message_at: c.last_message_at,
      last_message: preview ? String(preview).slice(0, 160) : null,
      last_from_me: lastMsg ? lastMsg.sender_id === profile.id : null,
      unread,
      pinned_at: part?.pinned_at ?? null,
      archived_at: part?.archived_at ?? null,
      muted_until: part?.muted_until ?? null,
      deleted_at: part?.deleted_at ?? null,
      created_at: c.created_at,
    }
  })

  // Exclude soft-deleted for the viewer
  conversations = conversations.filter((c) => !c.deleted_at)

  if (filter === 'unread') conversations = conversations.filter((c) => c.unread > 0)
  else if (filter === 'archived') conversations = conversations.filter((c) => c.archived_at || c.status === 'archived')
  else if (filter === 'favourites') conversations = conversations.filter((c) => !!c.pinned_at)
  else if (filter === 'groups') conversations = conversations.filter((c) => c.type === 'group')
  else conversations = conversations.filter((c) => !c.archived_at && c.status !== 'archived')

  if (q) {
    conversations = conversations.filter(
      (c) =>
        (c.counterpart?.name || '').toLowerCase().includes(q) ||
        (c.last_message || '').toLowerCase().includes(q),
    )
  }

  const counts = {
    all: conversations.filter((c) => !c.archived_at && c.status !== 'archived').length,
    unread: conversations.filter((c) => c.unread > 0 && !c.archived_at && c.status !== 'archived').length,
    archived: list.filter((c: any) => {
      const part = participantMap.get(c.id)
      return part?.archived_at || c.status === 'archived'
    }).length,
    favourites: conversations.filter((c) => !!c.pinned_at).length,
    groups: conversations.filter((c) => c.type === 'group').length,
    totalUnread: conversations.reduce((s, c) => s + (c.unread || 0), 0),
  }

  const total = conversations.length
  const paged = conversations.slice((page - 1) * pageSize, page * pageSize)

  return {
    conversations: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    counts,
  }
}

/**
 * GET /api/mobile/messages/conversations/[id] — thread messages + counterpart
 * for the signed-in profile. Mirrors the cookie route's base shape
 * (conversation, messages with reply previews + reactions + derived
 * delivered/read timestamps, participant row). Offer-card enrichment is not
 * included (offers → payment is out of this phase).
 */
export async function getMobileThread(
  id: string,
  auth: { db: any; profile: { id: string } },
): Promise<{ kind: 'ok'; payload: Record<string, unknown> } | { kind: 'not_found' } | { kind: 'forbidden' }> {
  const { db, profile } = auth

  const { data: conv, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, last_message_at, created_at')
    .eq('id', id)
    .single()
  if (error || !conv) return { kind: 'not_found' }
  if (conv.participant_a !== profile.id && conv.participant_b !== profile.id) return { kind: 'forbidden' }

  const counterpartId = conv.participant_a === profile.id ? conv.participant_b : conv.participant_a

  const [messagesRes, counterpartRes, participantRes, readsRes] = await Promise.all([
    db.from('conversation_messages')
      .select('id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, ref_inquiry_id, reply_to_id, metadata, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(500),
    db.from('profiles').select('id, full_name, email, avatar_url, role').eq('id', counterpartId).maybeSingle(),
    db.from('conversation_participants')
      .select('starred_message_ids, pinned_at, archived_at, muted_until')
      .eq('conversation_id', id)
      .eq('profile_id', profile.id)
      .maybeSingle(),
    db.from('conversation_reads')
      .select('last_read_at')
      .eq('conversation_id', id)
      .eq('profile_id', counterpartId)
      .maybeSingle(),
  ])

  const counterpartReadAt: string | null = (readsRes as any)?.data?.last_read_at || null
  const counterpartReadMs = counterpartReadAt ? new Date(counterpartReadAt).getTime() : 0

  // Same counterpart shape as the list route (name + avatar + role), so the
  // app renders both from one model.
  const counterpartRow: any = (counterpartRes as any)?.data || null
  const counterpart = counterpartRow
    ? {
        id: counterpartRow.id,
        name: counterpartRow.full_name || counterpartRow.email || 'User',
        email: counterpartRow.email,
        avatar_url: counterpartRow.avatar_url,
        role: counterpartRow.role,
      }
    : null

  const rawMessages: any[] = messagesRes.data || []

  // Reply previews
  const replyIds = Array.from(new Set(rawMessages.map((m) => m?.reply_to_id).filter(Boolean)))
  const replyMap = new Map<string, any>()
  if (replyIds.length) {
    try {
      const { data: replyRows } = await db
        .from('conversation_messages')
        .select('id, sender_id, body')
        .in('id', replyIds as string[])
      for (const r of replyRows || []) replyMap.set(r.id, r)
    } catch {
      // Non-fatal — reply preview enrichment skipped
    }
  }

  // Reactions
  const messageIds = rawMessages.map((m) => m.id).filter(Boolean)
  const reactionMap = new Map<string, Array<{ emoji: string; count: number; mine: boolean }>>()
  if (messageIds.length) {
    try {
      const { data: reactionRows } = await db
        .from('conversation_message_reactions')
        .select('message_id, emoji, profile_id')
        .in('message_id', messageIds as string[])
      for (const r of reactionRows || []) {
        const list = reactionMap.get(r.message_id) || []
        const existing = list.find((x) => x.emoji === r.emoji)
        if (existing) {
          existing.count++
          if (r.profile_id === profile.id) existing.mine = true
        } else {
          list.push({ emoji: r.emoji, count: 1, mine: r.profile_id === profile.id })
        }
        reactionMap.set(r.message_id, list)
      }
    } catch {
      // Non-fatal — reactions enrichment skipped
    }
  }

  const messages = rawMessages.map((m: any) => {
    let enriched: any = m
    if (m?.reply_to_id && replyMap.has(m.reply_to_id)) {
      const ref = replyMap.get(m.reply_to_id)
      enriched = {
        ...enriched,
        reply_preview: { id: ref.id, sender_id: ref.sender_id, snippet: String(ref.body || '').slice(0, 120) },
      }
    }
    const reactions = reactionMap.get(m.id)
    if (reactions) enriched = { ...enriched, reactions }
    if (m?.sender_id === profile.id) {
      const createdMs = m?.created_at ? new Date(m.created_at).getTime() : 0
      enriched = {
        ...enriched,
        delivered_at: m?.created_at || null,
        read_at: counterpartReadMs > 0 && createdMs <= counterpartReadMs ? counterpartReadAt : null,
      }
    }
    return enriched
  })

  return {
    kind: 'ok',
    payload: {
      conversation: {
        id: conv.id,
        counterpart,
        context_kind: conv.context_kind,
        context_id: conv.context_id,
        status: conv.status,
        created_at: conv.created_at,
        last_message_at: conv.last_message_at,
      },
      messages,
      participant: participantRes.data || null,
    },
  }
}

/**
 * POST /api/mobile/messages/conversations/[id] — send a text message.
 * Mirrors the cookie route: ownership check, safetyGuard, insert.
 */
export async function sendMobileMessage(
  id: string,
  body: unknown,
  auth: { db: any; profile: { id: string } },
): Promise<
  | { kind: 'ok'; message: Record<string, unknown> }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'bad_request'; message: string }
  | { kind: 'safety'; message: string; violations?: SafetyViolation[] }
  | { kind: 'error'; message: string }
> {
  const { db, profile } = auth

  const text = String((body as any)?.body || '').trim().slice(0, 8000)
  if (!text) return { kind: 'bad_request', message: 'body is required' }

  const safety = safetyGuard(text)
  if (!safety.ok) return { kind: 'safety', message: safety.error, violations: safety.violations }

  const { data: conv, error: convError } = await db
    .from('conversations')
    .select('participant_a, participant_b')
    .eq('id', id)
    .single()
  if (convError || !conv) return { kind: 'not_found' }
  if (conv.participant_a !== profile.id && conv.participant_b !== profile.id) return { kind: 'forbidden' }

  const { data, error } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: id,
      sender_id: profile.id,
      type: 'text',
      body: text,
    })
    .select('id, sender_id, type, body, created_at')
    .single()
  if (error) return { kind: 'error', message: error.message }

  return { kind: 'ok', message: data }
}
