/**
 * GET /api/messages/conversations
 *
 * Universe-wide inbox for the signed-in profile.
 *
 * Query params:
 *   filter   — all | unread | archived | favourites | groups
 *   q        — search counterpart name + last message
 *   page, page_size  — default 50, max 200
 *
 * Returns rows shaped for the dashboard Messages page and the inbox badge:
 *   conversations[]   — counterpart, last message, unread count, type ctx, participant state
 *   counts            — { all, unread, archived, favourites, groups, totalUnread }
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  const { searchParams } = new URL(req.url)
  const filter   = searchParams.get('filter') || 'all'
  const q        = searchParams.get('q')?.trim().toLowerCase() || ''
  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  // 1. Fetch the conversation rows where I am a participant
  let { data: convs, error } = await db
    .from('conversations')
    .select('id, participant_a, participant_b, context_kind, context_id, status, type, last_message_at, last_message_id, created_at')
    .or(`participant_a.eq.${profileId},participant_b.eq.${profileId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error && /relation .* does not exist/i.test(error.message || '')) {
    return Response.json({ conversations: [], counts: { all: 0, unread: 0, archived: 0, favourites: 0, groups: 0, totalUnread: 0 }, schema_pending: true })
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const list: any[] = convs ?? []
  if (list.length === 0) {
    return Response.json({ conversations: [], counts: { all: 0, unread: 0, archived: 0, favourites: 0, groups: 0, totalUnread: 0 } })
  }

  const convIds = list.map(c => c.id)

  // 2. Fetch participant state (best-effort; table may not exist yet)
  let participantMap = new Map<string, any>()
  try {
    const { data: parts } = await db
      .from('conversation_participants')
      .select('conversation_id, pinned_at, archived_at, muted_until, deleted_at')
      .eq('profile_id', profileId)
      .in('conversation_id', convIds)
    for (const p of (parts ?? [])) {
      participantMap.set(p.conversation_id, p)
    }
  } catch {
    // Non-fatal — table may not exist yet
  }

  // 3. Batch hydrate counterpart profiles, last messages, reads
  const counterpartIds = list.map(c => c.participant_a === profileId ? c.participant_b : c.participant_a)
  const lastMessageIds = list.map(c => c.last_message_id).filter(Boolean)

  const [profilesRes, lastMessagesRes, readsRes, recentMsgsRes] = await Promise.all([
    counterpartIds.length ? db.from('profiles').select('id, full_name, email, avatar_url, role').in('id', counterpartIds) : Promise.resolve({ data: [] }),
    lastMessageIds.length ? db.from('conversation_messages').select('id, body, sender_id, type, attachment_name, created_at').in('id', lastMessageIds) : Promise.resolve({ data: [] }),
    db.from('conversation_reads').select('conversation_id, last_read_at').eq('profile_id', profileId).in('conversation_id', convIds),
    db.from('conversation_messages')
      .select('conversation_id, sender_id, created_at')
      .in('conversation_id', convIds)
      .neq('sender_id', profileId)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const profileById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]))
  const lastById    = new Map((lastMessagesRes.data ?? []).map((m: any) => [m.id, m]))
  const readMap     = new Map((readsRes.data ?? []).map((r: any) => [r.conversation_id, new Date(r.last_read_at).getTime()]))

  const unreadByConv = new Map<string, number>()
  for (const m of recentMsgsRes.data ?? []) {
    const since = readMap.get((m as any).conversation_id) || 0
    if (new Date((m as any).created_at).getTime() > since) {
      unreadByConv.set((m as any).conversation_id, (unreadByConv.get((m as any).conversation_id) || 0) + 1)
    }
  }

  let conversations = list.map((c: any) => {
    const counterpartId = c.participant_a === profileId ? c.participant_b : c.participant_a
    const counterpart: any = profileById.get(counterpartId)
    const lastMsg: any = c.last_message_id ? lastById.get(c.last_message_id) : null
    const unread = unreadByConv.get(c.id) || 0
    const preview = lastMsg ? (lastMsg.body || lastMsg.attachment_name || '(message)') : null
    const part = participantMap.get(c.id)
    return {
      id:              c.id,
      counterpart: counterpart ? {
        id: counterpart.id,
        name: counterpart.full_name || counterpart.email || 'User',
        email: counterpart.email,
        avatar_url: counterpart.avatar_url,
        role: counterpart.role,
      } : null,
      context_kind:    c.context_kind,
      context_id:      c.context_id,
      status:          c.status,
      type:            c.type,
      last_message_at: c.last_message_at,
      last_message:    preview ? String(preview).slice(0, 160) : null,
      last_from_me:    lastMsg ? lastMsg.sender_id === profileId : null,
      unread,
      pinned_at:       part?.pinned_at ?? null,
      archived_at:     part?.archived_at ?? null,
      muted_until:     part?.muted_until ?? null,
      deleted_at:      part?.deleted_at ?? null,
      created_at:      c.created_at,
    }
  })

  // 4. Filters + search
  // Exclude soft-deleted for the viewer
  conversations = conversations.filter(c => !c.deleted_at)

  if (filter === 'unread')        conversations = conversations.filter(c => c.unread > 0)
  else if (filter === 'archived') conversations = conversations.filter(c => c.archived_at || c.status === 'archived')
  else if (filter === 'favourites') conversations = conversations.filter(c => !!c.pinned_at)
  else if (filter === 'groups')   conversations = conversations.filter(c => c.type === 'group')
  else /* all */                  conversations = conversations.filter(c => !c.archived_at && c.status !== 'archived')

  if (q) {
    conversations = conversations.filter(c =>
      (c.counterpart?.name || '').toLowerCase().includes(q) ||
      (c.last_message || '').toLowerCase().includes(q)
    )
  }

  const counts = {
    all:         conversations.filter(c => !c.archived_at && c.status !== 'archived').length,
    unread:      conversations.filter(c => c.unread > 0 && !c.archived_at && c.status !== 'archived').length,
    archived:    list.filter((c: any) => {
      const part = participantMap.get(c.id)
      return part?.archived_at || c.status === 'archived'
    }).length,
    favourites:  conversations.filter(c => !!c.pinned_at).length,
    groups:      conversations.filter(c => c.type === 'group').length,
    totalUnread: conversations.reduce((s, c) => s + (c.unread || 0), 0),
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
