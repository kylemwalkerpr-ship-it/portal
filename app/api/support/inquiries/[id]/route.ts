import { requirePortalUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'support') {
    return fail('Forbidden.', 403)
  }

  const { id } = await context.params

  const { data: inquiry, error: inquiryErr } = await auth.db
    .from('inquiries')
    .select('id, email, full_name, country, case_type, case_type_label, urgency, recommended_tier, answers, status, claimed_by_attorney_id, claimed_at, client_profile_id, archived_at, archived_by_role, archived_reason, source, target_attorney_profile_id, created_at, updated_at')
    .eq('id', id)
    .single()

  if (inquiryErr || !inquiry) return fail('Inquiry not found.', 404)

  const { data: order } = await auth.db
    .from('orders')
    .select('id')
    .eq('source_inquiry_id', id)
    .maybeSingle()

  const [{ data: messages }, { data: offers }] = await Promise.all([
    auth.db
      .from('inquiry_messages')
      .select('id, sender_role, sender_profile_id, body, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: true }),
    auth.db
      .from('attorney_offers')
      .select('id, attorney_id, attorney_profile_id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, decided_at, order_id, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: false }),
  ])

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
    const { data: profiles } = await auth.db
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

  return ok({
    inquiry: {
      ...inquiry,
      order_id: order?.id || null,
    },
    threads,
    client_messages: clientMessages,
    system_messages: systemMessages,
  })
}
