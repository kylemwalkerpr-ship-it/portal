import { ok, fail } from '@/lib/apiEnvelope'
import { buildSlug } from '@/lib/fiverr'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { requirePortalUser, getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

// Coerce gallery_images into a canonical [{url, ...}] shape and mirror
// the first entry into cover_image_url so any consumer reading either
// field sees the cover. Older rows that stored bare URL strings heal
// at the read boundary too — see app/api/marketplace/gigs/route.ts.
function shapeGig(gig: any) {
  if (!gig) return gig
  const gallery = normalizeGallery(gig.gallery_images)
  return {
    ...gig,
    gallery_images: gallery,
    cover_image_url: typeof gig.cover_image_url === 'string' && gig.cover_image_url.trim()
      ? gig.cover_image_url
      : (gallery[0]?.url ?? null),
  }
}

async function loadGig(db: any, id: string) {
  return db.from('gigs').select('*, tiers:gig_tiers(*)').eq('id', id).single()
}

function owns(auth: any, gig: any) {
  return auth.role === 'admin' || (gig.provider_id === auth.profileId && gig.provider_type === auth.role)
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()
  const { id } = await context.params
  const { data: gig, error } = await loadGig(db, id)
  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)
  if (auth && !owns(auth, gig) && gig.status !== 'active') return fail('Forbidden.', 403)
  if (!auth && gig.status !== 'active') return fail('Gig not found.', 404)
  return ok({ gig: shapeGig(gig) })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth.db, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!owns(auth, existing)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['title', 'category', 'subcategory', 'pitch', 'tagline', 'description', 'requirements', 'seo_title', 'seo_description', 'video_url']) {
    if (key in body) payload[key] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  }
  if ('jurisdiction' in body) {
    const j = typeof body.jurisdiction === 'string' ? body.jurisdiction.trim().toLowerCase() : ''
    payload.jurisdiction = ['us', 'uk', 'ca'].includes(j) ? j : null
  }
  if (body.status && ['draft', 'active', 'paused'].includes(body.status)) {
    payload.status = body.status
    if (body.status === 'active' && !existing.published_at) payload.published_at = new Date().toISOString()
  }
  if ('tags' in body) payload.tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 5) : []
  if ('faq' in body) payload.faq = Array.isArray(body.faq) ? body.faq.slice(0, 10) : []
  if ('gallery_images' in body) {
    const normalized = normalizeGallery(body.gallery_images).slice(0, 3)
    payload.gallery_images = normalized
    // Always keep cover_image_url in sync with whichever entry is at
    // index 0 — that's the contract the "Set as cover" button uses.
    // If the gallery is cleared, also clear the cover so card grids
    // don't render a stale image that no longer exists.
    payload.cover_image_url = resolveCoverUrl({ gallery_images: normalized })
  }
  if ('slug' in body) payload.slug = buildSlug(String(body.slug || existing.title))

  let updateResult = await auth.db.from('gigs').update(payload).eq('id', id).select('*, tiers:gig_tiers(*)').single()
  // Self-heal: if the cover_image_url column doesn't exist on this
  // schema, drop it and retry. The gallery_images write is enough
  // because the API readers fall back to gallery_images[0]?.url.
  // PostgREST surfaces this two different ways:
  //   "column \"cover_image_url\" of relation \"gigs\" does not exist"
  //   "Could not find the 'cover_image_url' column of 'gigs' in the schema cache"
  // Match either.
  if (updateResult.error && /cover_image_url/i.test(updateResult.error.message || '')) {
    const { cover_image_url: _drop, ...rest } = payload
    updateResult = await auth.db.from('gigs').update(rest).eq('id', id).select('*, tiers:gig_tiers(*)').single()
  }
  const gig = updateResult.data
  const error = updateResult.error
  if (error || !gig) return fail(error?.message || 'Could not update gig.', 500)

  if (Array.isArray(body.tiers)) {
    const tierRows = body.tiers.slice(0, 3).map((tier: any, index: number) => ({
      gig_id: id,
      tier: ['basic', 'standard', 'premium'].includes(tier.tier) ? tier.tier : ['basic', 'standard', 'premium'][index],
      title: String(tier.title || tier.tier || 'Package').slice(0, 80),
      description: String(tier.description || ''),
      price: Math.max(100, Number(tier.price || 100)),
      delivery_days: Math.max(1, Number(tier.delivery_days || 1)),
      revisions: Math.max(0, Number(tier.revisions || 0)),
      features: Array.isArray(tier.features) ? tier.features.map(String).slice(0, 12) : [],
      is_active: tier.is_active !== false,
    }))
    const { error: tierError } = await auth.db.from('gig_tiers').upsert(tierRows, { onConflict: 'gig_id,tier' })
    if (tierError) return fail(tierError.message, 500)
  }

  return ok({ gig: shapeGig(gig) })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth.db, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!owns(auth, existing)) return fail('Forbidden.', 403)
  const now = new Date().toISOString()
  const { data: gig, error } = await auth.db
    .from('gigs')
    .update({ status: 'deleted', deleted_at: now, deleted_by: auth.profileId, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !gig) return fail(error?.message || 'Could not delete gig.', 500)
  return ok({ gig })
}
