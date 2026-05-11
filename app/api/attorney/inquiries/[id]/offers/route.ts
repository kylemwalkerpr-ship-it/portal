import { requireAttorney } from '@/lib/attorneyAuth'
import { sendEmail, inquiryNewOfferEmail } from '@/lib/email'
import { calculateOfferPricing, validateOfferInput } from '@/lib/offerPricing'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { id: inquiryId } = await context.params

  let body: { title?: string; description?: string; price?: number; delivery_days?: number; expires_in_days?: number; discount_percent?: number; revision_count?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const parsed = validateOfferInput(body)
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })
  const expiresInDays = Number.isFinite(Number(body.expires_in_days)) ? Number(body.expires_in_days) : 7

  // Block sending an offer until Stripe Connect onboarding is complete OR
  // the admin has flipped the bypass for this attorney. The bypass lets ops
  // pre-onboard a panelist while their Connect account is still in review;
  // the actual transfer happens once the account is verified.
  let { data: attorney, error: attorneyErr } = await ctx.db
    .from('attorneys')
    .select('stripe_account_id, stripe_onboarding_complete, stripe_bypass')
    .eq('id', ctx.attorneyId)
    .single()
  if (attorneyErr && /stripe_bypass|schema cache|column/i.test(attorneyErr.message)) {
    const fallback = await ctx.db
      .from('attorneys')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', ctx.attorneyId)
      .single()
    attorney = fallback.data ? { ...fallback.data, stripe_bypass: false } : null
  }
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
  const pricing = await calculateOfferPricing('attorney', parsed.price, body.discount_percent)

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
      title: parsed.title,
      description: parsed.description,
      original_price: pricing.originalPrice,
      price: pricing.price,
      discount_percent: pricing.discountPercent,
      platform_fee: pricing.platformFee,
      platform_fee_percent_snapshot: pricing.platformFeePercent,
      provider_payout: pricing.providerPayout,
      provider_payout_percent_snapshot: pricing.providerPayoutPercent,
      currency: pricing.currency,
      delivery_days: parsed.deliveryDays,
      revision_count: parsed.revisionCount,
      expires_at: expiresAt,
    })
    .select('id, title, description, original_price, price, discount_percent, platform_fee, platform_fee_percent_snapshot, currency, delivery_days, revision_count, status, expires_at, created_at')
    .single()

  if (insErr || !offer) return Response.json({ error: insErr?.message || 'Could not create offer.' }, { status: 500 })

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: `New offer from ${ctx.fullName ?? 'an attorney'}: "${parsed.title}" — attorney fee $${pricing.price.toFixed(2)} + platform fee $${pricing.platformFee.toFixed(2)} (${pricing.platformFeePercent}%) · ${parsed.deliveryDays} day delivery`,
  })

  if (inquiry.email) {
    try {
      const tpl = inquiryNewOfferEmail({
        clientName: inquiry.full_name,
        attorneyName: ctx.fullName ?? 'An attorney',
        offerTitle: parsed.title,
        attorneyFee: pricing.price,
        platformFee: pricing.platformFee,
        inquiryId,
      })
      await sendEmail({ to: inquiry.email, subject: tpl.subject, html: tpl.html })
    } catch (e) {
      console.error('[attorney/offers] notify-client failed', e)
    }
  }

  return Response.json({ offer })
}
