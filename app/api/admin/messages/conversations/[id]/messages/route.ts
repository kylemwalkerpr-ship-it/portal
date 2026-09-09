/**
 * GET  /api/admin/messages/conversations/[id]/messages
 *   Bounded latest-first message history for any conversation — admin
 *   oversight read path. Returns the newest page by default (ascending for
 *   display) with a composite cursor (`older_cursor`) for older-history
 *   pagination so long threads never hide their newest messages behind the
 *   old 1000-row cap, and equal boundary timestamps are never skipped.
 *
 * POST /api/admin/messages/conversations/[id]/messages
 *   Admin send into an existing provider↔client thread. Body.to selects who
 *   is addressed; reply_to_id optionally quotes a message from the same thread.
 *
 * Auth: requireAdminUser only (non-admin → 401/403).
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { safetyGuard } from '@/lib/safety'
import {
  readAiMode,
  setConversationAiMode,
} from '@/lib/messengerAi'
import { buildThreadPage, cursorFilter, keyOf, parseCursor, parseThreadPageLimit } from '@/lib/adminMessages/threadPage'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const CLIENT_ROLES = new Set(['client', 'student'])

function shapeProfile(p: any, fallbackId?: string | null) {
  if (!p && !fallbackId) return null
  if (!p) return { id: fallbackId, name: 'Unknown', email: null, avatar_url: null, role: null }
  return {
    id: p.id,
    name: p.full_name || p.email || 'User',
    email: p.email,
    avatar_url: p.avatar_url,
    role: p.role === 'student' ? 'client' : p.role,
  }
}

function resolveDirectedTo(
  toRaw: string,
  conv: { participant_a: string; participant_b: string },
  profiles: Array<{ id: string; role?: string | null; full_name?: string | null; email?: string | null }>,
): { ok: true; targetId: string; targetKind: 'client' | 'provider' | 'participant'; target: ReturnType<typeof shapeProfile> }
  | { ok: false; error: string; status: number } {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const a = byId.get(conv.participant_a)
  const b = byId.get(conv.participant_b)
  const roleOf = (p?: { role?: string | null } | null) =>
    p?.role === 'student' ? 'client' : String(p?.role || '')

  const provider =
    (a && PROVIDER_ROLES.has(roleOf(a)) ? a : null) ||
    (b && PROVIDER_ROLES.has(roleOf(b)) ? b : null)
  const client =
    (a && CLIENT_ROLES.has(roleOf(a)) ? a : null) ||
    (b && CLIENT_ROLES.has(roleOf(b)) ? b : null)

  const to = toRaw.trim().toLowerCase()
  let targetId: string | null = null
  let targetKind: 'client' | 'provider' | 'participant' = 'participant'

  if (!to || to === 'client') {
    if (!client) return { ok: false, error: 'No client participant in this conversation', status: 400 }
    targetId = client.id
    targetKind = 'client'
  } else if (to === 'provider') {
    if (!provider) return { ok: false, error: 'No provider participant in this conversation', status: 400 }
    targetId = provider.id
    targetKind = 'provider'
  } else if (to === 'participant_a') {
    targetId = conv.participant_a
    targetKind = roleOf(a) && CLIENT_ROLES.has(roleOf(a))
      ? 'client'
      : roleOf(a) && PROVIDER_ROLES.has(roleOf(a))
        ? 'provider'
        : 'participant'
  } else if (to === 'participant_b') {
    targetId = conv.participant_b
    targetKind = roleOf(b) && CLIENT_ROLES.has(roleOf(b))
      ? 'client'
      : roleOf(b) && PROVIDER_ROLES.has(roleOf(b))
        ? 'provider'
        : 'participant'
  } else {
    if (to !== conv.participant_a && to !== conv.participant_b) {
      return { ok: false, error: 'to must be client, provider, participant_a, participant_b, or a participant profile id', status: 400 }
    }
    targetId = to === conv.participant_a ? conv.participant_a : conv.participant_b
    const tp = byId.get(targetId)
    targetKind = roleOf(tp) && CLIENT_ROLES.has(roleOf(tp))
      ? 'client'
      : roleOf(tp) && PROVIDER_ROLES.has(roleOf(tp))
        ? 'provider'
        : 'participant'
  }

  const targetProfile = byId.get(targetId!) || null
  return {
    ok: true,
    targetId: targetId!,
    targetKind,
    target: shapeProfile(targetProfile, targetId),
  }
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  let { data: conv, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, created_at, metadata')
    .eq('id', id)
    .single()

  if (error && /metadata|column/i.test(error.message || '')) {
    const fb = await db
      .from('conversations')
      .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, created_at')
      .eq('id', id)
      .single()
    if (fb.error || !fb.data) return Response.json({ error: 'Conversation not found' }, { status: 404 })
    conv = { ...fb.data, metadata: {} }
    error = null
  }

  if (error || !conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })

  const { searchParams } = new URL(_req.url)
  const limit = parseThreadPageLimit(searchParams.get('limit'))
  const before = searchParams.get('before')?.trim() || ''

  let messagesQuery = db
    .from('conversation_messages')
    .select(
      'id, sender_id, type, body, attachment_url, attachment_name, ref_offer_id, ref_order_id, ref_inquiry_id, reply_to_id, metadata, created_at',
    )
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (before) {
    const cursor = parseCursor(before)
    if (!cursor?.created_at || !cursor?.id) {
      return Response.json({ error: 'Invalid before cursor' }, { status: 400 })
    }
    messagesQuery = messagesQuery.or(cursorFilter(cursor.created_at, cursor.id))
  }

  const messagesRes = await messagesQuery
  if (messagesRes.error) return Response.json({ error: messagesRes.error.message }, { status: 500 })

  const rawMessages: any[] = messagesRes.data ?? []
  const messageIds = rawMessages.map((m) => m.id).filter(Boolean)
  const replyIds = Array.from(new Set(rawMessages.map((m) => m.reply_to_id).filter(Boolean))) as string[]

  const [replyRes, reactionRes] = await Promise.all([
    replyIds.length
      ? db.from('conversation_messages').select('id, sender_id, body').in('id', replyIds)
      : Promise.resolve({ data: [] as any[] }),
    messageIds.length
      ? db.from('conversation_message_reactions').select('message_id, emoji, profile_id').in('message_id', messageIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const replyRows = replyRes.data ?? []
  const profileIds = Array.from(new Set([
    conv.participant_a,
    conv.participant_b,
    profileId,
    ...rawMessages.map((m) => m.sender_id),
    ...replyRows.map((m: any) => m.sender_id),
  ].filter(Boolean)))

  const profilesRes = profileIds.length
    ? await db.from('profiles').select('id, full_name, email, avatar_url, role').in('id', profileIds)
    : { data: [] as any[] }

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const shape = (pid: string | null) => shapeProfile(pid ? profileById.get(pid) : null, pid)

  const participantA = shape(conv.participant_a)
  const participantB = shape(conv.participant_b)
  const provider = [participantA, participantB].find((p) => p && PROVIDER_ROLES.has(String(p.role))) || null
  const client = [participantA, participantB].find((p) => p && CLIENT_ROLES.has(String(p.role))) || null

  const replyMap = new Map(replyRows.map((row: any) => [row.id, row]))
  const reactionMap = new Map<string, Array<{ emoji: string; count: number; mine: boolean }>>()
  for (const reaction of reactionRes.data ?? []) {
    const list = reactionMap.get(reaction.message_id) || []
    const existing = list.find((item) => item.emoji === reaction.emoji)
    if (existing) {
      existing.count += 1
      if (reaction.profile_id === profileId) existing.mine = true
    } else {
      list.push({ emoji: reaction.emoji, count: 1, mine: reaction.profile_id === profileId })
    }
    reactionMap.set(reaction.message_id, list)
  }

  const messages = rawMessages.map((m: any) => {
    const sender = shape(m.sender_id)
    const meta = m.metadata && typeof m.metadata === 'object' ? m.metadata : {}
    const reply = m.reply_to_id ? replyMap.get(m.reply_to_id) : null
    const replySender = reply ? shape(reply.sender_id) : null
    return {
      id: m.id,
      sender_id: m.sender_id,
      sender,
      type: m.type || 'text',
      body: m.body,
      attachment_url: m.attachment_url,
      attachment_name: m.attachment_name,
      ref_offer_id: m.ref_offer_id,
      ref_order_id: m.ref_order_id,
      ref_inquiry_id: m.ref_inquiry_id,
      reply_to_id: m.reply_to_id,
      reply_preview: reply ? {
        id: reply.id,
        senderName: replySender?.name || 'Message',
        snippet: String(reply.body || '').slice(0, 120),
      } : null,
      reactions: reactionMap.get(m.id) || [],
      metadata: meta,
      is_admin_message: Boolean(meta.admin_message) || sender?.role === 'admin',
      created_at: m.created_at,
    }
  })

  const page = buildThreadPage(messages, limit, keyOf)

  return Response.json({
    conversation: {
      id: conv.id,
      participant_a: participantA,
      participant_b: participantB,
      provider,
      client,
      participants: [participantA, participantB].filter(Boolean),
      context_kind: conv.context_kind,
      context_id: conv.context_id,
      status: conv.status,
      type: conv.type,
      last_message_at: conv.last_message_at,
      created_at: conv.created_at,
      ai_mode: readAiMode((conv as any).metadata),
      ai_disclosed: Boolean((conv as any).metadata?.ai_disclosed),
    },
    messages: page.messages,
    total: page.messages.length,
    has_older: page.has_older,
    older_cursor: page.older_cursor,
  })
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth
  const { id } = await context.params

  const body = await req.json().catch(() => ({}))
  const text = String(body.body || '').trim().slice(0, 8000)
  if (!text) return Response.json({ error: 'body is required' }, { status: 400 })

  const safety = safetyGuard(text)
  if (!safety.ok) return Response.json({ error: safety.error, violations: safety.violations }, { status: 422 })

  let { data: conv, error: convErr } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, status, metadata')
    .eq('id', id)
    .single()

  if (convErr && /metadata|column/i.test(convErr.message || '')) {
    const fb = await db
      .from('conversations')
      .select('id, participant_a, participant_b, status')
      .eq('id', id)
      .single()
    if (fb.error || !fb.data) return Response.json({ error: 'Conversation not found' }, { status: 404 })
    conv = { ...fb.data, metadata: {} }
    convErr = null
  }

  if (convErr || !conv) return Response.json({ error: 'Conversation not found' }, { status: 404 })
  if (conv.status === 'archived') return Response.json({ error: 'Conversation is archived' }, { status: 400 })

  let replyToId = typeof body.reply_to_id === 'string' ? body.reply_to_id.trim() || null : null
  if (replyToId) {
    const { data: replyTarget } = await db
      .from('conversation_messages')
      .select('id')
      .eq('id', replyToId)
      .eq('conversation_id', id)
      .maybeSingle()
    if (!replyTarget) replyToId = null
  }

  const { data: profiles } = await db
    .from('profiles')
    .select('id, role, full_name, email, avatar_url')
    .in('id', [conv.participant_a, conv.participant_b].filter(Boolean))

  const directed = resolveDirectedTo(String(body.to ?? 'client'), conv, profiles || [])
  if (directed.ok === false) return Response.json({ error: directed.error }, { status: directed.status })

  const metadata: Record<string, unknown> = {
    admin_message: true,
    admin_directed_to: directed.targetKind,
    admin_directed_to_id: directed.targetId,
    admin_directed_to_name: directed.target?.name || null,
  }

  const attachment_url = typeof body.attachment_url === 'string' ? body.attachment_url.trim() || null : null
  const attachment_name = typeof body.attachment_name === 'string' ? body.attachment_name.trim() || null : null
  const msgType = attachment_url ? 'attachment' : 'text'

  const { data, error } = await db
    .from('conversation_messages')
    .insert({
      conversation_id: id,
      sender_id: profileId,
      type: msgType,
      body: text,
      attachment_url,
      attachment_name,
      reply_to_id: replyToId,
      metadata,
    })
    .select('id, sender_id, type, body, attachment_url, attachment_name, reply_to_id, metadata, created_at')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  try {
    await setConversationAiMode(db, id, 'paused', {
      ai_paused_reason: 'admin_message',
      ai_mode_set_by: profileId,
      ai_mode_set_role: 'admin',
    })
  } catch (e) {
    console.warn('[admin/messages] ai pause failed', e instanceof Error ? e.message : e)
  }

  try {
    await db.from('conversation_reads').upsert(
      {
        conversation_id: id,
        profile_id: profileId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id,profile_id' },
    )
  } catch {
    // Admin is an oversight sender, not necessarily a participant read row.
  }

  const adminProfile = shapeProfile({
    id: profileId,
    full_name: auth.profile?.full_name,
    email: auth.profile?.email,
    avatar_url: (auth.profile as any)?.avatar_url,
    role: 'admin',
  }, profileId)

  return Response.json({
    message: {
      id: data.id,
      sender_id: data.sender_id,
      sender: adminProfile,
      type: data.type || 'text',
      body: data.body,
      attachment_url: data.attachment_url,
      attachment_name: data.attachment_name,
      reply_to_id: data.reply_to_id,
      metadata: data.metadata,
      is_admin_message: true,
      created_at: data.created_at,
    },
    directed_to: {
      kind: directed.targetKind,
      id: directed.targetId,
      name: directed.target?.name || null,
      role: directed.target?.role || null,
    },
    ai_mode: 'paused',
  })
}
