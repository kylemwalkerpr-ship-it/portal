/**
 * GET /api/attorney/inquiries/stats
 * Counters for the queue tabs + summary tiles.
 */
import { requireAttorney } from '@/lib/attorneyAuth'
import { applyOpenQueueFilter, getAcceptedInquiryIds } from '@/lib/attorneyInquiries'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  // Engaged-by-me set
  const [{ data: myMsgs }, { data: myOffers }] = await Promise.all([
    ctx.db.from('inquiry_messages').select('inquiry_id').eq('sender_profile_id', ctx.profileId).eq('sender_role', 'attorney'),
    ctx.db.from('attorney_offers').select('inquiry_id, status').eq('attorney_id', ctx.attorneyId),
  ])
  const myEngaged = new Set([
    ...(myMsgs ?? []).map((r: any) => r.inquiry_id),
    ...(myOffers ?? []).map((r: any) => r.inquiry_id),
  ])
  const myPendingOffers = (myOffers ?? []).filter((o: any) => !o.status || o.status === 'pending' || o.status === 'active').length

  // Pull open queue + targeted in one shot. Canonical open-queue filter
  // (see lib/attorneyInquiries) keeps these stats aligned with the queue view.
  const acceptedInquiryIds = await getAcceptedInquiryIds(ctx.db)
  const { data: openRows, error: openErr } = await applyOpenQueueFilter(
    ctx.db
      .from('inquiries')
      .select('id, status, urgency, target_attorney_profile_id, created_at'),
    acceptedInquiryIds,
  )
  if (openErr && /relation .* does not exist/i.test(openErr.message || '')) {
    return Response.json({ stats: {}, schema_pending: true })
  }
  if (openErr) return Response.json({ error: openErr.message }, { status: 500 })

  const list = openRows ?? []
  const targetedToMe = list.filter((r: any) => r.target_attorney_profile_id === ctx.profileId)
  const now = Date.now()
  const fresh = (r: any) => new Date(r.created_at).getTime() >= now - 24 * 3_600_000
  const urgent = (r: any) => r.urgency === 'urgent' || r.urgency === 'high'

  return Response.json({
    stats: {
      open:              list.length,
      targeted_to_me:    targetedToMe.length,
      urgent:            list.filter(urgent).length,
      fresh_24h:         list.filter(fresh).length,
      my_engaged:        myEngaged.size,
      my_pending_offers: myPendingOffers,
    },
  })
}
