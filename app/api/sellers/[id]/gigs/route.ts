import { ok, fail } from '@/lib/apiEnvelope'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = createSupabaseAdminClient()

  // Resolve seller profile by ANY of: attorneys.id, consultants.id, or
  // profiles.id (call sites that have a gig.provider_id often pass that).
  const [byAttId, byConId, byAttPid, byConPid] = await Promise.all([
    db.from('attorneys').select('profile_id').eq('id', id).maybeSingle(),
    db.from('consultants').select('profile_id').eq('id', id).maybeSingle(),
    db.from('attorneys').select('profile_id').eq('profile_id', id).maybeSingle(),
    db.from('consultants').select('profile_id').eq('profile_id', id).maybeSingle(),
  ])
  const provider = byAttId.data || byConId.data || byAttPid.data || byConPid.data
  if (!provider) return fail('Seller not found', 404)
  const profileId = provider.profile_id

  // Get seller's gigs. order_count / avg_rating / cover_image_url are
  // optional — self-heal if any column is missing.
  let gigs: any[] | null = null
  let error: any = null
  const primary = await db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('provider_id', profileId)
    .eq('status', 'active')
    .order('order_count', { ascending: false })
  if (primary.error && /column .* does not exist/i.test(primary.error.message || '')) {
    const fb = await db
      .from('gigs')
      .select('id, slug, title, pitch, category, gallery_images, tiers:gig_tiers(id, price, is_active)')
      .eq('provider_id', profileId)
      .eq('status', 'active')
    gigs = fb.data
    error = fb.error
  } else {
    gigs = primary.data
    error = primary.error
  }

  if (error) {
    return fail(error.message, 500)
  }

  const shaped = (gigs || []).map((gig: any) => {
    const activeTiers = (gig.tiers || []).filter((t: any) => t.is_active)
    const cheapest = activeTiers.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0]

    // Use the helper so a string-only legacy gallery still produces a
    // usable cover, and so cover_image_url falls back to gallery_images[0]
    // when it's not explicitly set on the row.
    return {
      id: gig.id,
      slug: gig.slug,
      title: gig.title,
      summary: gig.pitch || gig.summary,
      category: gig.category,
      starting_price: cheapest?.price ?? null,
      avg_rating: gig.avg_rating,
      review_count: gig.review_count,
      order_count: gig.order_count,
      image_url: resolveCoverUrl(gig),
      gallery_images: normalizeGallery(gig.gallery_images),
    }
  })

  return ok({ gigs: shaped })
}
