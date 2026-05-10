import { requireAttorney } from '@/lib/attorneyAuth'

export const runtime = 'edge'

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

  const { data: inquiry } = await ctx.db
    .from('inquiries')
    .select('id, email, client_profile_id, claimed_by_attorney_id')
    .eq('id', inquiryId)
    .single()
  if (!inquiry) return Response.json({ error: 'Inquiry not found.' }, { status: 404 })
  if (inquiry.claimed_by_attorney_id !== ctx.attorneyId) {
    return Response.json({ error: 'Claim the inquiry before sending an offer.' }, { status: 403 })
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: offer, error: insErr } = await ctx.db
    .from('attorney_offers')
    .insert({
      inquiry_id: inquiryId,
      attorney_id: ctx.attorneyId,
      attorney_profile_id: ctx.profileId,
      client_email: inquiry.email,
      client_profile_id: inquiry.client_profile_id,
      title,
      description,
      price,
      delivery_days: deliveryDays,
      expires_at: expiresAt,
    })
    .select('id, title, description, price, currency, delivery_days, status, expires_at, created_at')
    .single()

  if (insErr || !offer) return Response.json({ error: insErr?.message || 'Could not create offer.' }, { status: 500 })

  await ctx.db.from('inquiry_messages').insert({
    inquiry_id: inquiryId,
    sender_role: 'system',
    sender_profile_id: ctx.profileId,
    body: `New offer: "${title}" — $${price.toFixed(2)} · ${deliveryDays} day delivery`,
  })

  return Response.json({ offer })
}
