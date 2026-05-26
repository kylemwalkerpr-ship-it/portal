import { ok, fail } from '@/lib/apiEnvelope'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()
  const { slug } = await context.params

  // Load the gig without filtering by status — we need to know the
  // requested gig before we can decide whether the viewer is allowed
  // to see it. Public visitors only see active gigs; signed-in
  // providers see their own gigs at any status (so they can preview /
  // edit drafts from the marketplace surface).
  const { data: gig, error } = await db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), reviews:gig_reviews(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email, username, created_at)')
    .eq('slug', slug)
    .single()

  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)

  const isOwner = !!auth && gig.provider_id === auth.profileId && gig.provider_type === auth.role
  const isAdmin = !!auth && auth.role === 'admin'
  if (gig.status !== 'active' && !isOwner && !isAdmin) {
    return fail('Gig not found.', 404)
  }

  // Get provider stats
  const [{ data: providerGigs }, { data: providerReviews }] = await Promise.all([
    db.from('gigs').select('id, avg_rating, review_count, order_count').eq('provider_id', gig.provider_id).eq('status', 'active'),
    db.from('gig_reviews').select('rating').eq('provider_id', gig.provider_id),
  ])

  // Calculate provider stats
  const providerStats = {
    avg_rating: 0,
    review_count: 0,
    order_count: 0,
    response_time: '1 hour',
    is_online: true,
  }

  if (providerGigs && providerGigs.length > 0) {
    const totalReviews = providerGigs.reduce((sum: number, g: any) => sum + (g.review_count || 0), 0)
    const totalOrders = providerGigs.reduce((sum: number, g: any) => sum + (g.order_count || 0), 0)
    const weightedRating = providerGigs.reduce((sum: number, g: any) => sum + (g.avg_rating || 0) * (g.review_count || 0), 0)

    providerStats.avg_rating = totalReviews > 0 ? weightedRating / totalReviews : 0
    providerStats.review_count = totalReviews
    providerStats.order_count = totalOrders
  }

  // Get similar gigs (same category, different provider)
  const { data: similarGigs } = await db
    .from('gigs')
    .select('id, slug, title, starting_price, avg_rating, gallery_images')
    .eq('category', gig.category)
    .eq('status', 'active')
    .neq('id', gig.id)
    .limit(6)

  // resolveCoverUrl handles both shapes — `{url}` objects (current) and
  // bare strings (older builder versions). Without this, gigs created
  // before the wizard fix never rendered a cover anywhere.
  const cover = resolveCoverUrl(gig)
  const normalizedGallery = normalizeGallery(gig.gallery_images)
  const normalizedSimilar = (similarGigs || []).map((sg: any) => ({
    ...sg,
    gallery_images: normalizeGallery(sg.gallery_images),
    cover_image_url: resolveCoverUrl(sg),
  }))

  return ok({
    gig: {
      ...gig,
      gallery_images: normalizedGallery,
      cover_image_url: cover,
      provider_avg_rating: providerStats.avg_rating,
      provider_review_count: providerStats.review_count,
      provider_order_count: providerStats.order_count,
      provider_response_time: providerStats.response_time,
      provider_is_online: providerStats.is_online,
      similar_gigs: normalizedSimilar,
      // Owner flag so the client can render edit affordances on the
      // public marketplace page without leaking the check to anonymous
      // viewers (they always get false).
      viewer_is_owner: isOwner || isAdmin,
    },
    seo: {
      title: `${gig.seo_title || gig.title} | YouSafe`,
      description: gig.seo_description || gig.pitch || '',
      og_image: cover,
      canonical_path: `/marketplace/gigs/${gig.slug}`,
      json_ld: {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: gig.title,
        description: gig.seo_description || gig.pitch || gig.description,
        provider: { '@type': 'Person', name: gig.provider?.full_name || gig.provider?.email || 'YouSafe provider' },
        offers: (gig.tiers || []).filter((t: any) => t.is_active).map((t: any) => ({ '@type': 'Offer', price: Number(t.price) / 100, priceCurrency: 'USD' })),
        aggregateRating: gig.review_count > 0 ? { '@type': 'AggregateRating', ratingValue: gig.avg_rating, reviewCount: gig.review_count } : undefined,
      },
    },
  })
}
