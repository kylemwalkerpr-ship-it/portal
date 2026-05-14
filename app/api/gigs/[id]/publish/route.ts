import { ok, fail, fieldFail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: gig, error: loadErr } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('id', id)
    .single()

  if (loadErr || !gig) return fail('Gig not found.', 404)

  const isAdmin = auth.role === 'admin'
  const isOwner = gig.provider_id === auth.profileId && gig.provider_type === auth.role
  if (!isAdmin && !isOwner) return fail('Forbidden.', 403)

  // Must be draft or suspended to publish
  if (!['draft', 'suspended'].includes(String(gig.status))) {
    return fail(`Cannot publish a gig with status '${gig.status}'.`, 422)
  }

  const errors: Record<string, string> = {}

  // title: 20–80 chars
  const title = String(gig.title || '').trim()
  if (title.length < 20 || title.length > 80) {
    errors.title = 'Title must be between 20 and 80 characters.'
  }

  // pitch (or tagline): 40–160 chars
  const pitch = String(gig.pitch || gig.tagline || '').trim()
  if (pitch.length < 40 || pitch.length > 160) {
    errors.pitch = 'Pitch (or tagline) must be between 40 and 160 characters.'
  }

  // description: 300–2500 chars
  const description = String(gig.description || '').trim()
  if (description.length < 300 || description.length > 2500) {
    errors.description = 'Description must be between 300 and 2500 characters.'
  }

  // category: required
  if (!gig.category) errors.category = 'Category is required.'

  // subcategory: required
  if (!gig.subcategory) errors.subcategory = 'Subcategory is required.'

  // tags: 3–5 items
  const tags = Array.isArray(gig.tags) ? gig.tags : []
  if (tags.length < 3 || tags.length > 5) {
    errors.tags = 'Tags must have between 3 and 5 items.'
  }

  // at least one tier with price_cents > 0 and delivery_days >= 1
  const activeTiers = (gig.tiers || []).filter(
    (t: any) => t.is_active && Number(t.price_cents) > 0 && Number(t.delivery_days) >= 1
  )
  if (activeTiers.length === 0) {
    errors.tiers = 'At least one active tier with a price and delivery days is required.'
  }

  // requirements: non-empty string
  const requirements = String(gig.requirements || '').trim()
  if (!requirements) errors.requirements = 'Requirements are required.'

  // gallery_images: at least 1 item
  const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  if (gallery.length < 1) {
    errors.gallery_images = 'At least one gallery image is required.'
  }

  if (Object.keys(errors).length > 0) return fieldFail(errors, 422)

  const now = new Date().toISOString()
  const { data: updated, error } = await auth.db
    .from('gigs')
    .update({
      status: 'active',
      last_status_changed_at: now,
      published_at: gig.published_at || now,
      updated_at: now,
    })
    .eq('id', id)
    .select('*, tiers:gig_tiers(*)')
    .single()

  if (error || !updated) return fail(error?.message || 'Could not publish gig.', 500)
  return ok({ gig: updated })
}
