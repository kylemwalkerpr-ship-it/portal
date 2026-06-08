/**
 * GET /api/messages/starred
 *
 * Returns all messages the current user has starred across conversations.
 * Starred message IDs are stored per-participant in the
 * conversation_participants.starred_message_ids JSON column.
 *
 * Response shape:
 *   { messages: Array<{ id, conversation_id, body, type, attachment_url,
 *                       attachment_name, created_at, senderName, convName }> }
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  // 1. Fetch all participant rows for this user that have starred messages
  const { data: participants, error: partErr } = await db
    .from('conversation_participants')
    .select('conversation_id, starred_message_ids')
    .eq('profile_id', profileId)
    .not('starred_message_ids', 'is', null)

  if (partErr) {
    // The table or column may not exist yet — treat as empty
    if (/relation .* does not exist/i.test(partErr.message)) {
      return Response.json({ messages: [] })
    }
    return Response.json({ error: partErr.message }, { status: 500 })
  }

  // 2. Filter to participants with actual starred messages
  const starredIdsByConv = new Map<string, string[]>()
  for (const p of participants ?? []) {
    const ids = (p.starred_message_ids as string[]) || []
    if (ids.length > 0) {
      starredIdsByConv.set(p.conversation_id, ids)
    }
  }

  if (starredIdsByConv.size === 0) {
    return Response.json({ messages: [] })
  }

  // 3. Collect all unique message IDs
  const allMsgIds = Array.from(starredIdsByConv.values()).flat()

  // 4. Fetch the actual messages
  const { data: messages, error: msgErr } = await db
    .from('conversation_messages')
    .select('id, conversation_id, sender_id, body, type, attachment_url, attachment_name, created_at, metadata')
    .in('id', allMsgIds)
    .order('created_at', { ascending: false })
    .limit(200)

  if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 })
  if (!messages || messages.length === 0) {
    return Response.json({ messages: [] })
  }

  // 5. Fetch counterpart profiles for each conversation to display names
  const convIds = Array.from(new Set(messages.map((m: any) => m.conversation_id)))
  const [convRes, profilesRes] = await Promise.all([
    db.from('conversations')
      .select('id, participant_a, participant_b')
      .in('id', convIds),
    db.from('profiles')
      .select('id, full_name'),
  ])

  const convMap = new Map<string, any>()
  for (const c of (convRes.data ?? [])) {
    convMap.set(c.id, c)
  }

  const profileMap = new Map<string, string>()
  for (const p of (profilesRes.data ?? [])) {
    profileMap.set(p.id, p.full_name || 'User')
  }

  // 6. Build response — each message gets senderName and convName
  const enriched = (messages ?? []).map((m: any) => {
    const conv = convMap.get(m.conversation_id)
    const counterpartId = conv
      ? (conv.participant_a === profileId ? conv.participant_b : conv.participant_a)
      : null
    const senderName = m.sender_id === profileId
      ? 'You'
      : (counterpartId ? (profileMap.get(m.sender_id) || profileMap.get(counterpartId) || 'User') : 'User')
    const convName = counterpartId ? (profileMap.get(counterpartId) || 'User') : 'Conversation'

    return {
      id: m.id,
      conversation_id: m.conversation_id,
      body: m.body,
      type: m.type,
      attachment_url: m.attachment_url,
      attachment_name: m.attachment_name,
      created_at: m.created_at,
      senderName,
      convName,
    }
  })

  return Response.json({ messages: enriched })
}
