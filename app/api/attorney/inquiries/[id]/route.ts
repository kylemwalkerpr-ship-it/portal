import { requireAttorney } from '@/lib/attorneyAuth'

// Returns a single attorney's view of an inquiry: only this attorney's
// messages, the client's messages, system events, and this attorney's offers.
// Other attorneys' threads are not visible (they're competing).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, status, created_at')
    .eq('id', id)
    .single()

  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })
  if (inquiry.status === 'converted' || inquiry.status === 'closed' || inquiry.status === 'cancelled') {
    // Still allow read access so attorney can see the final state, but mark closed.
  }

  // All messages on this inquiry, then filter in code: keep client + system +
  // only THIS attorney's own messages. (Supabase REST .or() with multiple
  // conditions is awkward; client-side filter is simpler and the volume is
  // tiny.)
  const [{ data: allMessages }, { data: offers }, { data: unifiedOffers }] = await Promise.all([
    ctx.db
      .from('inquiry_messages')
      .select('id, sender_role, sender_profile_id, body, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('attorney_offers')
      .select('id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, decided_at, order_id, created_at')
      .eq('inquiry_id', id)
      .eq('attorney_id', ctx.attorneyId)
      .order('created_at', { ascending: false }),
    ctx.db
      .from('offers')
      .select('*')
      .eq('chat_id', id)
      .eq('sender_id', ctx.profileId)
      .eq('sender_type', 'attorney')
      .order('created_at', { ascending: false }),
  ])

  const messages = (allMessages ?? []).filter((m) => {
    if (m.sender_role === 'client' || m.sender_role === 'system') return true
    if (m.sender_role === 'attorney' && m.sender_profile_id === ctx.profileId) return true
    return false
  })

  return Response.json({
    inquiry,
    messages,
    offers: [
      ...((unifiedOffers ?? []).map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        original_price: Number(o.price || 0) / 100,
        price: Number(o.discounted_price || o.price || 0) / 100,
        platform_fee: 0,
        platform_fee_percent_snapshot: 0,
        currency: o.currency,
        delivery_days: o.delivery_days,
        revision_count: o.revisions,
        status: o.status === 'pending' ? 'sent' : o.status,
        expires_at: o.expires_at,
        created_at: o.created_at,
      }))),
      ...(offers ?? []),
    ],
  })
}
