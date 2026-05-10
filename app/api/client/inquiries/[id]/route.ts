import { requireClient } from '@/lib/clientAuth'

export const runtime = 'edge'

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

  // Allow access if it belongs to the client's profile, or matches their email.
  const ownsByProfile = inquiry.client_profile_id === ctx.profileId
  const ownsByEmail = inquiry.email === ctx.email
  if (!ownsByProfile && !ownsByEmail) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Lazy-link if accessing by email match.
  if (!ownsByProfile && ownsByEmail) {
    await ctx.db.from('inquiries').update({ client_profile_id: ctx.profileId }).eq('id', id)
  }

  // Resolve attorney name (if claimed) for display.
  let claimedAttorney: { id: string; full_name: string | null } | null = null
  if (inquiry.claimed_by_attorney_id) {
    const { data: attorney } = await ctx.db
      .from('attorneys')
      .select('id, profile_id')
      .eq('id', inquiry.claimed_by_attorney_id)
      .single()
    if (attorney?.profile_id) {
      const { data: attorneyProfile } = await ctx.db
        .from('profiles')
        .select('full_name')
        .eq('id', attorney.profile_id)
        .single()
      claimedAttorney = { id: attorney.id, full_name: attorneyProfile?.full_name ?? null }
    }
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
    claimed_attorney: claimedAttorney,
    messages: messages ?? [],
    offers: offers ?? [],
  })
}
