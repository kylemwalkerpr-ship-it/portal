import { requireAttorney } from '@/lib/attorneyAuth'
import { getPlatformSettings } from '@/lib/platformConfig'
import { sendEmail, inquiryNewOfferEmail } from '@/lib/email'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id: inquiryId } = await context.params

  let body: { title?: string; description?: string; price?: number; delivery_days?: number; expires_in_days?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 4000) : ''
  const price = Number(body.price)
  const deliveryDays = Number(body.delivery_days)
  const expiresInDays = Number.isFinite(Number(body.expires_in_days)) ? Number(body.expires_in_days) : 7

  if (!title) return Response.json({ error: 'Title required.' }, { status: 400 })
  if (!description) return Response.json({ error: 'Description required.' }, { status: 400 })
  if (!Number.isFinite(price) || price <= 0) return Response.json({ error: 'Price must be a positive number.' }, { status: 400 })
  if (!Number.isInteger(deliveryDays) || deliveryDays <= 0) return Response.json({ error: 'Delivery days must be a positive integer.' }, { status: 400 })

  // Block sending an offer until Stripe Connect onboarding is complete OR
  // the admin has flipped the bypass for this attorney. The bypass lets ops
  // pre-onboard a panelist while their Connect account is still in review;
  // the actual transfer happens once the account is verified.
  const { data: attorney } = await ctx.db
    .from('attorneys')
    .select('stripe_account_id, stripe_onboarding_complete, stripe_bypass')
    .eq('id', ctx.attorneyId)
    .single()
  const onboarded = Boolean(attorney?.stripe_account_id && attorney?.stripe_onboarding_complete)
  const bypassed = Boolean(attorney?.stripe_bypass)
  if (!onboarded && !bypassed) {
    return Response.json(
      { error: 'Connect a payout account before sending an offer.', requires_connect: true },
      { status: 412 },
    )
  }

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, full_name, client_profile_id, status')
    .eq('id', inquiryId)
    .single()
  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })
  if (inquiry.status === 'converted' || inquiry.status === 'closed' || inquiry.status === 'cancelled') {
    return Response.json({ error: `Inquiry is ${inquiry.status}.` }, { status: 409 })
  }

  // Snapshot the platform fee percent in case the admin changes it later;
  // the disclosure on each offer must stay accurate.
  const settings = await getPlatformSettings()
  const feePercent = Number(
    (settings as Record<string, unknown>).attorney_platform_fee_percent ?? 25,
  )
  const platformFee = Math.round(price * (feePercent / 100) * 100) / 100

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: offer, error: insErr } = await ctx.db
    .from('attorney_offers')
    .insert({
      inquiry_id: inquiryId,
      attorney_id: ctx.attorneyId,
      attorney_profile_id: ctx.profileId,
      attorney_stripe_account_id: attorney.stripe_account_id,
      client_email: inquiry.email,
      client_profile_id: inquiry.client_profile_id,
      title,
      description,
      price,
      platform_fee: platformFee,
      platform_fee_percent_snapshot: feePercent,
      delivery_days: deliveryDays,
      expires_at: expiresAt,
    })
    .select('id, title, description, price, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, status, expires_at, created_at')
    .single()

  if (insErr || !offer) return Response.json({ error: insErr?.message || 'Could not create offer.' }, { status: 500 })

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: `New offer from ${ctx.fullName ?? 'an attorney'}: "${title}" — attorney fee $${price.toFixed(2)} + platform fee $${platformFee.toFixed(2)} (${feePercent}%) · ${deliveryDays} day delivery`,
  })

  if (inquiry.email) {
    try {
      const tpl = inquiryNewOfferEmail({
        clientName: inquiry.full_name,
        attorneyName: ctx.fullName ?? 'An attorney',
        offerTitle: title,
        attorneyFee: price,
        platformFee,
        inquiryId,
      })
      await sendEmail({ to: inquiry.email, subject: tpl.subject, html: tpl.html })
    } catch (e) {
      console.error('[attorney/offers] notify-client failed', e)
    }
  }

  return Response.json({ offer })
}
