import { ok, fail, fieldFail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { computeAttorneyStrength, PROFILE_PUBLISH_THRESHOLD } from '@/lib/attorneyProfileStrength'
import { computeConsultantStrength, CONSULTANT_PUBLISH_THRESHOLD } from '@/lib/consultantProfileStrength'
import { isCategoryAllowedForRole, isSubcategoryAllowedForRole } from '@/lib/categories'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await handlePublish(req, context)
  } catch (e: any) {
    // Any unhandled error here becomes a proper JSON 500. Without this
    // the runtime renders an HTML 503 from the edge, which the gig
    // builder client tries to JSON.parse and crashes on with "string
    // did not match the expected pattern".
    return fail(`Publish handler crashed: ${e?.message || String(e)}`, 500)
  }
}

async function handlePublish(_req: Request, context: { params: Promise<{ id: string }> }) {
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

  // Category gate: legal categories require Bar vetting on attorneys /
  // attorney_applications, which consultants do not have.
  if (auth.role === 'consultant') {
    if (gig.category && !isCategoryAllowedForRole(gig.category, 'consultant') && !isSubcategoryAllowedForRole(gig.category, 'consultant')) {
      return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
    }
    if (gig.subcategory && !isSubcategoryAllowedForRole(gig.subcategory, 'consultant')) {
      return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
    }
  }

  // Allow publish/re-publish from any non-active, non-deleted state.
  // suspended → owner re-publishing after admin clears the suspension
  // paused / archived → owner reactivating a previously-live gig
  if (!['draft', 'paused', 'suspended', 'archived'].includes(String(gig.status))) {
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

  // jurisdiction: required (must be one of us/uk/ca)
  if (!['us', 'uk', 'ca', 'au'].includes(String(gig.jurisdiction || '').toLowerCase())) {
    errors.jurisdiction = 'Pick the jurisdiction this brief is licensed to serve (US, UK, CA, or AU).'
  }

  // tags: 3–5 items
  const tags = Array.isArray(gig.tags) ? gig.tags : []
  if (tags.length < 3 || tags.length > 5) {
    errors.tags = 'Tags must have between 3 and 5 items.'
  }

  // at least one tier with price > 0 and delivery_days >= 1
  const activeTiers = (gig.tiers || []).filter(
    (t: any) => t.is_active && Number(t.price) > 0 && Number(t.delivery_days) >= 1
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

  // Profile completeness gate. A gig cannot move to `active` until the
  // attorney's/consultant's profile is at least 75% complete AND has an
  // SEO-friendly username set (used as the public-profile URL slug).
  // Strength check — wrap so an upstream Supabase glitch surfaces as a
  // soft validation error instead of throwing the whole route. Without
  // this guard, a transient DB hiccup turned into the HTML 503 the user
  // saw with "string did not match the expected pattern" on the client.
  try {
    if (auth.role === 'attorney') {
      const strength = await computeAttorneyStrength(auth.db, auth.profileId)
      if (!strength.username) {
        errors.profile_username =
          'Set your SEO-friendly profile handle before publishing. It becomes your public profile URL.'
      }
      if (strength.score < PROFILE_PUBLISH_THRESHOLD) {
        errors.profile_strength =
          `Your profile is ${strength.score}% complete. Reach ${PROFILE_PUBLISH_THRESHOLD}% before publishing — finish the intake checklist on your dashboard.`
      }
    } else if (auth.role === 'consultant') {
      const strength = await computeConsultantStrength(auth.db, auth.profileId)
      if (!strength.username) {
        errors.profile_username =
          'Set your SEO-friendly profile handle before publishing. It becomes your public profile URL.'
      }
      if (strength.score < CONSULTANT_PUBLISH_THRESHOLD) {
        errors.profile_strength =
          `Your profile is ${strength.score}% complete. Reach ${CONSULTANT_PUBLISH_THRESHOLD}% before publishing — finish the intake checklist on your dashboard.`
      }
    }
  } catch (e: any) {
    errors.profile_strength = `Could not verify profile strength (${e?.message || 'unknown error'}). Try again.`
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
      archived_at: null,
      suspended_at: null,
      gig_status_reason: null,
    })
    .eq('id', id)
    .select('*, tiers:gig_tiers(*)')
    .single()

  if (error || !updated) return fail(error?.message || 'Could not publish gig.', 500)
  // Invalidate public gig listings so the new gig appears immediately.
  const { bumpCacheVersion } = await import('@/lib/cache'); await bumpCacheVersion('gigs')
  return ok({ gig: updated })
}
