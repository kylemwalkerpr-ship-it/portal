/**
 * GET /api/admin/messages/conversations
 *
 * Admin oversight inbox — list ALL provider↔client conversation threads.
 * Admin-only via requireAdminUser (profile.role === 'admin').
 *
 * Query params:
 *   q      — search participant names / emails / last message
 *   role   — filter threads that include a participant with this role
 *            (attorney | consultant | client | student)
 *   unread — "1" | "true" → only threads with unread for at least one party
 *   page, page_size — default 50, max 200
 */
import { requireAdminUser } from '@/lib/portalAuth'

const PROVIDER_ROLES = new Set(['attorney', 'consultant'])
const CLIENT_ROLES = new Set(['client', 'student'])

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim().toLowerCase() || ''
  const roleFilter = (searchParams.get('role') || '').trim().toLowerCase()
  const unreadOnly = ['1', 'true', 'yes'].includes((searchParams.get('unread') || '').toLowerCase())
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  let { data: convs, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, last_message_id, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(2000)

  if (error && /relation .* does not exist/i.test(error.message || '')) {
    return Response.json({
      conversations: [],
      total: 0,
      page,
      page_size: pageSize,
      total_pages: 1,
      has_more: false,
      counts: { all: 0, unread: 0 },
      schema_pending: true,
    })
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const list: any[] = convs ?? []
  if (list.length === 0) {
    return Response.json({
      conversations: [],
      total: 0,
      page,
      page_size: pageSize,
      total_pages: 1,
      has_more: false,
      counts: { all: 0, unread: 0 },
    })
  }

  const convIds = list.map((c) => c.id)
  const profileIds = Array.from(new Set(list.flatMap((c) => [c.participant_a, c.participant_b]).filter(Boolean)))
  const lastMessageIds = list.map((c) => c.last_message_id).filter(Boolean)

  const [profilesRes, lastMessagesRes, readsRes] = await Promise.all([
    profileIds.length
      ? db.from('profiles').select('id, full_name, email, avatar_url, role').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
    lastMessageIds.length
      ? db.from('conversation_messages').select('id, body, sender_id, type, attachment_name, created_at').in('id', lastMessageIds)
      : Promise.resolve({ data: [] as any[] }),
    convIds.length
      ? db.from('conversation_reads').select('conversation_id, profile_id, last_read_at').in('conversation_id', convIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const lastById = new Map((lastMessagesRes.data ?? []).map((m: any) => [m.id, m]))
  const readsByConv = new Map<string, Map<string, number>>()
  for (const r of readsRes.data ?? []) {
    if (!readsByConv.has(r.conversation_id)) readsByConv.set(r.conversation_id, new Map())
    readsByConv.get(r.conversation_id)!.set(r.profile_id, new Date(r.last_read_at).getTime())
  }

  const shapeParticipant = (id: string | null) => {
    if (!id) return null
    const p: any = profileById.get(id)
    if (!p) return { id, name: 'Unknown', email: null, avatar_url: null, role: null }
    return {
      id: p.id,
      name: p.full_name || p.email || 'User',
      email: p.email,
      avatar_url: p.avatar_url,
      role: p.role === 'student' ? 'client' : p.role,
    }
  }

  let conversations = list.map((c: any) => {
    const a = shapeParticipant(c.participant_a)
    const b = shapeParticipant(c.participant_b)
    const lastMsg: any = c.last_message_id ? lastById.get(c.last_message_id) : null
    const preview = lastMsg ? (lastMsg.body || lastMsg.attachment_name || '(message)') : null
    const lastAtMs = c.last_message_at ? new Date(c.last_message_at).getTime() : 0
    const readMap = readsByConv.get(c.id) || new Map<string, number>()
    const aUnread = !!c.participant_a && lastAtMs > (readMap.get(c.participant_a) || 0)
    const bUnread = !!c.participant_b && lastAtMs > (readMap.get(c.participant_b) || 0)
    const hasUnread = aUnread || bUnread

    const roles = [a?.role, b?.role].filter(Boolean) as string[]
    const provider = [a, b].find((p) => p && PROVIDER_ROLES.has(String(p.role))) || null
    const client = [a, b].find((p) => p && CLIENT_ROLES.has(String(p.role))) || null

    return {
      id: c.id,
      participant_a: a,
      participant_b: b,
      provider,
      client,
      participants: [a, b].filter(Boolean),
      context_kind: c.context_kind,
      context_id: c.context_id,
      status: c.status,
      type: c.type,
      last_message_at: c.last_message_at,
      last_message: preview ? String(preview).slice(0, 160) : null,
      last_sender_id: lastMsg?.sender_id ?? null,
      has_unread: hasUnread,
      unread_parties: [aUnread ? c.participant_a : null, bUnread ? c.participant_b : null].filter(Boolean),
      roles,
      created_at: c.created_at,
    }
  })

  if (roleFilter) {
    conversations = conversations.filter((c) =>
      (c.roles || []).some((r: string) => String(r).toLowerCase() === roleFilter),
    )
  }

  if (unreadOnly) {
    conversations = conversations.filter((c) => c.has_unread)
  }

  if (q) {
    conversations = conversations.filter((c) => {
      const hay = [
        c.participant_a?.name,
        c.participant_a?.email,
        c.participant_b?.name,
        c.participant_b?.email,
        c.last_message,
        c.provider?.name,
        c.client?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }

  // Prefer active threads in the default view
  conversations = conversations.filter((c) => c.status !== 'archived')

  const counts = {
    all: conversations.length,
    unread: conversations.filter((c) => c.has_unread).length,
  }

  const total = conversations.length
  const paged = conversations.slice((page - 1) * pageSize, page * pageSize)

  return Response.json({
    conversations: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    counts,
  })
}
