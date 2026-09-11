import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const TERMINAL_STATUSES = ['paid', 'accepted', 'expired'] as const
const ADMIN_ROLES = new Set(['admin', 'superadmin'])

async function loadOffer(db: any, id: string) {
  return db
    .from('offers')
    .select('*, files:offer_files(*)')
    .eq('id', id)
    .single()
}

function canSeeOffer(offer: any, profileId: string, role?: string | null) {
  return offer.sender_id === profileId
    || offer.recipient_id === profileId
    || ADMIN_ROLES.has(String(role || ''))
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (!canSeeOffer(offer, auth.profileId, auth.role)) return fail('Forbidden.', 403)

  const profileIds = Array.from(new Set([offer.sender_id, offer.recipient_id].filter(Boolean)))
  const [profilesRes, orderRes] = await Promise.all([
    profileIds.length
      ? auth.db.from('profiles').select('id, full_name, avatar_url, role').in('id', profileIds)
      : Promise.resolve({ data: [] as any[] }),
    auth.db
      .from('orders')
      .select('id, order_number, status, total_amount, escrow_status, offer_id, created_at')
      .eq('offer_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  let linkedGig: any = null
  if (offer.gig_id) {
    const { data } = await auth.db
      .from('gigs')
      .select('id, title, slug')
      .eq('id', offer.gig_id)
      .maybeSingle()
    linkedGig = data || null
  }

  const profileMap = new Map((profilesRes.data || []).map((profile: any) => [profile.id, profile]))
  const attachments = await Promise.all((offer.files || []).map(async (file: any) => {
    let url = String(file.file_url || '')
    if (url && !/^https?:\/\//i.test(url)) {
      try {
        const { data } = await auth.db.storage
          .from('offer-attachments')
          .createSignedUrl(url, 60 * 60)
        if (data?.signedUrl) url = data.signedUrl
      } catch {
        // Preserve the stored path as metadata if a legacy attachment cannot
        // be signed. The detail panel still shows its name/type/size.
      }
    }
    return {
      id: file.id,
      name: file.file_name || 'Attachment',
      url,
      size: Number(file.file_size || 0),
      mime_type: file.mime_type || null,
    }
  }))

  return ok({
    offer: {
      ...offer,
      price_cents: Number(offer.price || 0),
      discount_cents: offer.discounted_price == null ? null : Number(offer.discounted_price),
      files: undefined,
    },
    sender: profileMap.get(offer.sender_id) || null,
    recipient: profileMap.get(offer.recipient_id) || null,
    linked_gig: linkedGig,
    attachments,
    order: orderRes.data || null,
    viewer_relation: ADMIN_ROLES.has(String(auth.role || ''))
      ? 'admin'
      : offer.sender_id === auth.profileId
        ? 'sender'
        : 'recipient',
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const newStatus = body.status as string

  if (!['declined', 'cancelled'].includes(newStatus)) {
    return fail("status must be 'declined' or 'cancelled'.", 422)
  }

  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)

  if (TERMINAL_STATUSES.includes(offer.status as typeof TERMINAL_STATUSES[number])) {
    return fail(`Cannot change status of a ${offer.status} offer.`, 409)
  }

  if (newStatus === 'declined') {
    // Only the buyer (recipient) can decline
    if (auth.role !== 'client') return fail('Only clients can decline offers.', 403)
    if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  }

  if (newStatus === 'cancelled') {
    // Only the seller (sender) can cancel/withdraw
    const isProvider = ['attorney', 'consultant'].includes(auth.role)
    if (!isProvider && !ADMIN_ROLES.has(String(auth.role || ''))) return fail('Only providers can withdraw offers.', 403)
    if (offer.sender_id !== auth.profileId && !ADMIN_ROLES.has(String(auth.role || ''))) return fail('Forbidden.', 403)
  }

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not update offer.', 500)
  return ok({ offer: updated })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: offer, error } = await loadOffer(auth.db, id)
  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.sender_id !== auth.profileId && !ADMIN_ROLES.has(String(auth.role || ''))) return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be cancelled.', 409)

  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) return fail(updErr?.message || 'Could not cancel offer.', 500)
  return ok({ offer: updated })
}
