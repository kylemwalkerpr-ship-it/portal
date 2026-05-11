import { requireClient } from '@/lib/clientAuth'
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { sendEmail, inquiryOfferDeclinedEmail } from '@/lib/email'

export async function PATCH(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can decline offers.', 403)

  const { id } = await context.params
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be declined.', 409)

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (updErr || !updated) return fail(updErr?.message || 'Could not decline offer.', 500)
  return ok({ offer: updated })
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireClient()
  if (!ctx) return Response.json({ error }, { status })

  const { id } = await context.params

  const { data: offer } = await ctx.db
    .from('attorney_offers')
    .select('id, client_email, client_profile_id, status, inquiry_id, title, attorney_profile_id')
    .eq('id', id)
    .single()
  if (!offer) return Response.json({ error: 'Offer not found.' }, { status: 404 })
  if (offer.client_profile_id !== ctx.profileId && offer.client_email !== ctx.email) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 })
  }
  if (offer.status !== 'sent') {
    return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })
  }

  await ctx.db
    .from('attorney_offers')
    .update({ status: 'declined', decided_at: new Date().toISOString(), client_profile_id: ctx.profileId })
    .eq('id', id)

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: offer.inquiry_id,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: 'Client declined the offer.',
  })

  // Email the attorney.
  try {
    const { data: attorneyProfile } = await ctx.db
      .from('profiles')
      .select('email, full_name')
      .eq('id', offer.attorney_profile_id)
      .single()
    if (attorneyProfile?.email) {
      const tpl = inquiryOfferDeclinedEmail({
        attorneyName: attorneyProfile.full_name,
        clientName: ctx.fullName,
        offerTitle: offer.title,
        inquiryId: offer.inquiry_id,
      })
      await sendEmail({ to: attorneyProfile.email, subject: tpl.subject, html: tpl.html })
    }
  } catch (e) {
    console.error('[offers/decline] notify-attorney failed', e)
  }

  return Response.json({ ok: true })
}
