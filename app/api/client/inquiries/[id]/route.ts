import { requireClient } from '@/lib/clientAuth'

// Returns the inquiry + a per-attorney thread structure:
//   threads: [{ attorney_id, attorney_profile_id, attorney_name, messages, offers }]
// plus client-side messages (interleaved into threads on the frontend).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, country, case_type, case_type_label, urgency, recommended_tier, answers, status, claimed_by_attorney_id, claimed_at, client_profile_id, created_at')
    .eq('id', id)
    .single()

  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })

  const ownsByProfile = inquiry.client_profile_id === ctx.profileId
  const ownsByEmail = inquiry.email === ctx.email
  if (!ownsByProfile && !ownsByEmail) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }
  if (!ownsByProfile && ownsByEmail) {
    await ctx.db.from('inquiries').update({ client_profile_id: ctx.profileId }).eq('id', id)
  }

  const [{ data: messages }, { data: offers }] = await Promise.all([
    ctx.db
      .from('inquiry_messages')
      .select('id, sender_role, sender_profile_id, body, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('attorney_offers')
      .select('id, attorney_id, attorney_profile_id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, decided_at, order_id, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: false }),
  ])

  // Group attorney messages + offers by attorney_profile_id. Client messages
  // are kept on the inquiry root; each thread shows them interleaved.
  const attorneyProfileIds = new Set<string>()
  for (const m of messages ?? []) {
    if (m.sender_role === 'attorney' && m.sender_profile_id) attorneyProfileIds.add(m.sender_profile_id)
  }
  for (const o of offers ?? []) {
    if (o.attorney_profile_id) attorneyProfileIds.add(o.attorney_profile_id)
  }

  const ids = Array.from(attorneyProfileIds)
  let attorneyProfilesById = new Map<string, { full_name: string | null; email: string | null }>()
  if (ids.length > 0) {
    const { data: profiles } = await ctx.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
    for (const p of profiles ?? []) {
      attorneyProfilesById.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  const threadsMap = new Map<string, { attorney_profile_id: string; attorney_name: string; messages: typeof messages; offers: any[] }>()
  for (const apid of ids) {
    const prof = attorneyProfilesById.get(apid)
    threadsMap.set(apid, {
      attorney_profile_id: apid,
      attorney_name: prof?.full_name || prof?.email?.split('@')[0] || 'Attorney',
      messages: [],
      offers: [],
    })
  }

  const clientMessages: typeof messages = []
  const systemMessages: typeof messages = []
  for (const m of messages ?? []) {
    if (m.sender_role === 'client') clientMessages.push(m)
    else if (m.sender_role === 'system') systemMessages.push(m)
    else if (m.sender_role === 'attorney' && m.sender_profile_id) {
      threadsMap.get(m.sender_profile_id)?.messages.push(m)
    }
  }
  for (const o of offers ?? []) {
    if (o.attorney_profile_id) threadsMap.get(o.attorney_profile_id)?.offers.push({ ...o, source_type: 'attorney_offer' })
  }

  const threads = Array.from(threadsMap.values()).sort((a, b) => a.attorney_name.localeCompare(b.attorney_name))

  return Response.json({
    inquiry,
    threads,
    client_messages: clientMessages,
    system_messages: systemMessages,
  })
}
