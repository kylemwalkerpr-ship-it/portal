import { ok, fail } from '@/lib/apiEnvelope'
import { isValidGigAiOverview, sanitizeGigAiOverview } from '@/lib/gigAiOverview'
import { buildSlug } from '@/lib/fiverr'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { requirePortalUser, getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { isCategoryAllowedForRole, isSubcategoryAllowedForRole } from '@/lib/categories'
import { canEditProviderGig, normalizeGigPricingScope, normalizeTierScope, stripInternalGigPricing } from '@/lib/yqaaGigScope'

// Coerce gallery_images into a canonical [{url, ...}] shape and mirror
// the first entry into cover_image_url so any consumer reading either
// field sees the cover. Older rows that stored bare URL strings heal
// at the read boundary too — see app/api/marketplace/gigs/route.ts.
function shapeGig(gig: any, includeInternalPricing = false) {
  if (!gig) return gig
  const gallery = normalizeGallery(gig.gallery_images)
  const publicGig = stripInternalGigPricing(gig)
  return {
    ...publicGig,
    ...(includeInternalPricing && gig.hourly_rate_cents != null ? { hourly_rate_cents: gig.hourly_rate_cents } : {}),
    gallery_images: gallery,
    cover_image_url: typeof gig.cover_image_url === 'string' && gig.cover_image_url.trim()
      ? gig.cover_image_url
      : (gallery[0]?.url ?? null),
  }
}

async function loadGig(db: any, id: string) {
  return db.from('gigs').select('*, tiers:gig_tiers(*)').eq('id', id).single()
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()
  const { id } = await context.params
  const { data: gig, error } = await loadGig(db, id)
  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)
  if (auth && !canEditProviderGig(auth, gig) && gig.status !== 'active') return fail('Forbidden.', 403)
  if (!auth && gig.status !== 'active') return fail('Gig not found.', 404)
  return ok({ gig: shapeGig(gig, Boolean(auth && canEditProviderGig(auth, gig))) })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth.db, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!canEditProviderGig(auth, existing)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const pricingScope = normalizeGigPricingScope(body)
  if (pricingScope.ok === false) return fail(pricingScope.message, 422, { fields: { [pricingScope.field]: pricingScope.message } })
  if (Array.isArray(body.tiers)) {
    for (const [index, tier] of body.tiers.entries()) {
      if (!tier || typeof tier !== 'object' || Array.isArray(tier)) {
        return fail('Tier must be an object.', 422, { fields: { [`tiers.${index}`]: 'Tier must be an object.' } })
      }
      const scope = normalizeTierScope({
        ...('scope_depth' in tier ? { scope_depth: tier.scope_depth } : {}),
        ...('scope_units' in tier ? { scope_units: tier.scope_units } : {}),
      })
      if (scope.ok === false) return fail(scope.message, 422, { fields: { [`tiers.${index}.${scope.field}`]: scope.message } })
    }
  }

  // Category gate: legal categories require Bar vetting on attorneys /
  // attorney_applications, which consultants do not have.
  if (auth.role === 'consultant') {
    if ('category' in body) {
      const cat = typeof body.category === 'string' ? body.category.trim() : ''
      if (cat && !isCategoryAllowedForRole(cat, 'consultant') && !isSubcategoryAllowedForRole(cat, 'consultant')) {
        return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
      }
    }
    if ('subcategory' in body) {
      const sub = typeof body.subcategory === 'string' ? body.subcategory.trim() : ''
      if (sub && !isSubcategoryAllowedForRole(sub, 'consultant')) {
        return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
      }
    }
  }

  // Deleted gigs are read-only — the only mutation allowed is a
  // restore (status flips back to draft). Without this guard the bin
  // would behave like just-another-tab, defeating the soft-delete.
  if (existing.status === 'deleted') {
    const isRestoreOnly =
      body.status === 'draft' &&
      Object.keys(body).every((k) => k === 'status')
    if (!isRestoreOnly) {
      return fail('This gig is in the bin. Restore it before making changes.', 409)
    }
  }
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  Object.assign(payload, pricingScope.values)
  for (const key of ['title', 'category', 'subcategory', 'pitch', 'tagline', 'description', 'requirements', 'seo_title', 'seo_description', 'ai_overview', 'video_url']) {
    if (key in body) payload[key] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  }
  if ('ai_overview' in payload) {
    const cleaned = sanitizeGigAiOverview(String(payload.ai_overview || ''))
    if (!cleaned) payload.ai_overview = null
    else if (!isValidGigAiOverview(cleaned)) return fail('Overview must be 120–900 characters of plain curated prose (no Summary: label).', 400)
    else payload.ai_overview = cleaned
  }

  if ('jurisdiction' in body) {
    const j = typeof body.jurisdiction === 'string' ? body.jurisdiction.trim().toLowerCase() : ''
    payload.jurisdiction = ['us', 'uk', 'ca', 'au'].includes(j) ? j : null
  }
  if (body.status && ['draft', 'active', 'paused'].includes(body.status)) {
    payload.status = body.status
    if (body.status === 'active' && !existing.published_at) payload.published_at = new Date().toISOString()
    // Restoring from the bin clears the soft-delete markers so the gig
    // re-appears in "All" and the deleted_at column doesn't poison
    // future sort / TTL queries.
    if (existing.status === 'deleted' && body.status === 'draft') {
      payload.deleted_at = null
      payload.deleted_by = null
    }
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

  // Treat a public slug like a permanent resource identifier. Drafts may be
  // cleaned before publication; once a gig has ever been published, title and
  // SEO edits must not create a new URL, redirect chain, or accidental 404.
  if ('slug' in body) {
    const currentSlug = typeof existing.slug === 'string' ? existing.slug.trim() : ''
    const requestedSlug = typeof body.slug === 'string' ? body.slug.trim() : ''
    let nextSlug = currentSlug

    if (!nextSlug) {
      nextSlug = buildSlug(requestedSlug || String(existing.title || 'service'))
    } else if (requestedSlug && requestedSlug !== currentSlug) {
      const normalized = buildSlug(requestedSlug)
      const hasBeenPublished = Boolean(existing.published_at) || existing.status === 'active'
      if (hasBeenPublished && normalized !== currentSlug) {
        return fail('Published service URLs are permanent. Keep the current slug and update the title or SEO fields instead.', 409)
      }
      nextSlug = normalized
    }

    if (nextSlug && nextSlug !== currentSlug) {
      const { data: collision, error: collisionError } = await auth.db
        .from('gigs')
        .select('id')
        .eq('slug', nextSlug)
        .neq('id', id)
        .maybeSingle()
      if (!collisionError && collision) {
        return fail('That service URL is already in use. Choose a different slug.', 409)
      }
    }
    if (nextSlug) payload.slug = nextSlug
  }

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
    const existingTiers = new Map((existing.tiers || []).map((tier: any) => [tier.tier, tier]))
    const tierRows: Record<string, unknown>[] = []
    for (const [index, tier] of body.tiers.slice(0, 3).entries()) {
      const scopePatch = normalizeTierScope({
        ...('scope_depth' in tier ? { scope_depth: tier.scope_depth } : {}),
        ...('scope_units' in tier ? { scope_units: tier.scope_units } : {}),
      })
      if (scopePatch.ok === false) return fail(scopePatch.message, 422, { fields: { [`tiers.${index}.${scopePatch.field}`]: scopePatch.message } })
      const tierName = ['basic', 'standard', 'premium'].includes(tier.tier) ? tier.tier : ['basic', 'standard', 'premium'][index]
      const priorTier = existingTiers.get(tierName) as any
      tierRows.push({
        gig_id: id,
        tier: tierName,
        title: String(tier.title || tier.tier || 'Package').slice(0, 80),
        description: String(tier.description || ''),
        price: Math.max(100, Number(tier.price || 100)),
        delivery_days: Math.max(1, Number(tier.delivery_days || 1)),
        revisions: Math.max(0, Number(tier.revisions || 0)),
        features: Array.isArray(tier.features) ? tier.features.map(String).slice(0, 12) : [],
        is_active: tier.is_active !== false,
        scope_depth: 'scope_depth' in scopePatch.values ? scopePatch.values.scope_depth : priorTier?.scope_depth ?? null,
        scope_units: 'scope_units' in scopePatch.values ? scopePatch.values.scope_units : priorTier?.scope_units ?? null,
      })
    }
    const { error: tierError } = await auth.db.from('gig_tiers').upsert(tierRows, { onConflict: 'gig_id,tier' })
    if (tierError) return fail(tierError.message, 500)
  }

  // Invalidate public gig listings (cached in KV) after this mutation.
  const { bumpCacheVersion } = await import('@/lib/cache'); await bumpCacheVersion('gigs')
  return ok({ gig: shapeGig(gig, true) })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth.db, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!canEditProviderGig(auth, existing)) return fail('Forbidden.', 403)
  const now = new Date().toISOString()
  const { data: gig, error } = await auth.db
    .from('gigs')
    .update({ status: 'deleted', deleted_at: now, deleted_by: auth.profileId, updated_at: now })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !gig) return fail(error?.message || 'Could not delete gig.', 500)
  // Invalidate public gig listings (cached in KV) after this mutation.
  const { bumpCacheVersion } = await import('@/lib/cache'); await bumpCacheVersion('gigs')
  return ok({ gig })
}
