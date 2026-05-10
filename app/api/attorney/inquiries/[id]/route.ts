import { requireAttorney } from '@/lib/attorneyAuth'


// Returns the full thread for an inquiry (claim status, messages, offers).
// Attorney must either own the claim or the inquiry must be unclaimed (so they
// can preview before claiming).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params
  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, phone, country, case_type, case_type_label, urgency, recommended_tier, answers, claimed_by_attorney_id, claimed_at, status, created_at')
    .eq('id', id)
    .single()

  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })

  const claimedByMe = inquiry.claimed_by_attorney_id === ctx.attorneyId
  if (inquiry.claimed_by_attorney_id && !claimedByMe) {
    return Response.json({ error: 'This inquiry is claimed by another attorney.' }, { status: 403 })
  }

  const [{ data: messages }, { data: offers }] = await Promise.all([
    ctx.db
      .from('inquiry_messages')
      .select('id, sender_role, sender_profile_id, body, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: true }),
    ctx.db
      .from('attorney_offers')
      .select('id, title, description, price, currency, delivery_days, status, expires_at, decided_at, order_id, created_at')
      .eq('inquiry_id', id)
      .order('created_at', { ascending: false }),
  ])

  return Response.json({
    inquiry,
    claimed_by_me: claimedByMe,
    messages: messages ?? [],
    offers: offers ?? [],
  })
}
