import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { data: chats, error: qErr } = await ctx.db
    .from('inquiries')
    .select('id, client_profile_id, email, full_name, status, source, created_at, updated_at')
    .eq('source', 'portal_attorney_chat')
    .eq('target_attorney_profile_id', ctx.profileId)
    .order('updated_at', { ascending: false })

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  const ids = (chats ?? []).map((c) => c.id)
  let lastByChat = new Map<string, any>()
  let offersByChat = new Map<string, any[]>()
  if (ids.length > 0) {
    const [{ data: messages }, { data: offers }] = await Promise.all([
      ctx.db.from('inquiry_messages').select('inquiry_id, sender_role, body, created_at').in('inquiry_id', ids).order('created_at', { ascending: false }),
      ctx.db.from('attorney_offers').select('inquiry_id, id, status').in('inquiry_id', ids),
    ])
    for (const m of messages ?? []) if (!lastByChat.has(m.inquiry_id)) lastByChat.set(m.inquiry_id, m)
    for (const o of offers ?? []) {
      const list = offersByChat.get(o.inquiry_id) ?? []
      list.push(o)
      offersByChat.set(o.inquiry_id, list)
    }
  }

  return Response.json({
    chats: (chats ?? []).map((c) => {
      const last = lastByChat.get(c.id)
      return {
        id: c.id,
        client_name: c.full_name || 'Client',
        client_email: c.email,
        status: c.status,
        last_message: last?.body || '',
        last_message_at: last?.created_at || c.updated_at || c.created_at,
        pending_offers: (offersByChat.get(c.id) ?? []).filter((o) => o.status === 'sent').length,
      }
    }),
  })
}
