import { requireClient } from '@/lib/clientAuth'

export async function GET() {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { data: rows, error: qErr } = await ctx.db
    .from('inquiries')
    .select('id, target_attorney_profile_id, status, created_at, updated_at')
    .eq('client_profile_id', ctx.profileId)
    .eq('source', 'portal_attorney_chat')
    .order('updated_at', { ascending: false })

  if (qErr) return Response.json({ error: qErr.message }, { status: 500 })

  const chats = rows ?? []
  const profileIds = Array.from(new Set(chats.map((c) => c.target_attorney_profile_id).filter(Boolean)))
  let profileById = new Map<string, { full_name: string | null; email: string | null }>()
  let attorneyByProfileId = new Map<string, { headshot_url: string | null; available: boolean | null }>()

  if (profileIds.length > 0) {
    const [{ data: profiles }, { data: attorneys }] = await Promise.all([
      ctx.db.from('profiles').select('id, full_name, email').in('id', profileIds),
      ctx.db.from('attorneys').select('profile_id, headshot_url, available').in('profile_id', profileIds),
    ])
    profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
    attorneyByProfileId = new Map((attorneys ?? []).map((a) => [a.profile_id, a]))
  }

  const ids = chats.map((c) => c.id)
  let lastByChat = new Map<string, any>()
  let offersByChat = new Map<string, any[]>()
  if (ids.length > 0) {
    const [{ data: messages }, { data: offers }] = await Promise.all([
      ctx.db.from('inquiry_messages').select('inquiry_id, sender_role, body, created_at').in('inquiry_id', ids).order('created_at', { ascending: false }),
      ctx.db.from('attorney_offers').select('inquiry_id, id, title, price, platform_fee, status, created_at').in('inquiry_id', ids).order('created_at', { ascending: false }),
    ])
    for (const m of messages ?? []) if (!lastByChat.has(m.inquiry_id)) lastByChat.set(m.inquiry_id, m)
    for (const o of offers ?? []) {
      const list = offersByChat.get(o.inquiry_id) ?? []
      list.push(o)
      offersByChat.set(o.inquiry_id, list)
    }
  }

  return Response.json({
    chats: chats.map((c) => {
      const profile = profileById.get(c.target_attorney_profile_id)
      const attorney = attorneyByProfileId.get(c.target_attorney_profile_id)
      const last = lastByChat.get(c.id)
      return {
        id: c.id,
        attorney_profile_id: c.target_attorney_profile_id,
        attorney_name: profile?.full_name || 'Attorney',
        attorney_email: profile?.email || '',
        headshot_url: attorney?.headshot_url || null,
        presence: attorney?.available === false ? 'offline' : 'online',
        last_seen: attorney?.available === false ? c.updated_at || c.created_at : null,
        last_message: last?.body || '',
        last_message_at: last?.created_at || c.updated_at || c.created_at,
        pending_offers: (offersByChat.get(c.id) ?? []).filter((o) => o.status === 'sent').length,
      }
    }),
  })
}
