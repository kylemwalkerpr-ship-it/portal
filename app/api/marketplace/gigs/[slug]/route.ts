import { ok, fail } from '@/lib/apiEnvelope'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const RECOMMENDATION_SELECT = 'id, provider_id, slug, title, pitch, avg_rating, review_count, order_count, gallery_images, category, subcategory, jurisdiction, tiers:gig_tiers(price, delivery_days, is_active), provider:profiles!gigs_provider_id_fkey(full_name, username, email)'

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()
  const { slug } = await context.params

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

  const providerSellerTable = gig.provider_type === 'consultant' ? 'consultants' : 'attorneys'

  // Every enrichment below depends only on the already-loaded gig. Keep the
  // fan-out parallel, but make discovery resilient: provider services are the
  // strongest cross-sell, then same-category services, then same-jurisdiction
  // services if a narrow category has no inventory. This prevents mature gig
  // pages from ending abruptly after reviews simply because one taxonomy shelf
  // is sparse.
  const jurisdictionRecommendations = gig.jurisdiction
    ? db
        .from('gigs')
        .select(RECOMMENDATION_SELECT)
        .eq('jurisdiction', gig.jurisdiction)
        .eq('status', 'active')
        .neq('id', gig.id)
        .order('rank_score', { ascending: false })
        .limit(12)
    : Promise.resolve({ data: [], error: null })

  const [providerGigsRes, providerHeadshotRes, sameCategoryRes, sameJurisdictionRes] = await Promise.all([
    db
      .from('gigs')
      .select(RECOMMENDATION_SELECT)
      .eq('provider_id', gig.provider_id)
      .eq('status', 'active')
      .order('rank_score', { ascending: false }),
    db
      .from(providerSellerTable)
      .select('headshot_url')
      .eq('profile_id', gig.provider_id)
      .maybeSingle(),
    db
      .from('gigs')
      .select(RECOMMENDATION_SELECT)
      .eq('category', gig.category)
      .eq('status', 'active')
      .neq('id', gig.id)
      .order('rank_score', { ascending: false })
      .limit(12),
    jurisdictionRecommendations,
  ])

  const providerGigs = providerGigsRes.data || []
  const provider_headshot_url = (providerHeadshotRes?.data as { headshot_url?: string | null } | null)?.headshot_url || null

  const providerStats = {
    avg_rating: 0,
    review_count: 0,
    order_count: 0,
    response_time: '1 hour',
    is_online: true,
  }

  if (providerGigs.length > 0) {
    const totalReviews = providerGigs.reduce((sum: number, g: any) => sum + (g.review_count || 0), 0)
    const totalOrders = providerGigs.reduce((sum: number, g: any) => sum + (g.order_count || 0), 0)
    const weightedRating = providerGigs.reduce((sum: number, g: any) => sum + (g.avg_rating || 0) * (g.review_count || 0), 0)

    providerStats.avg_rating = totalReviews > 0 ? weightedRating / totalReviews : 0
    providerStats.review_count = totalReviews
    providerStats.order_count = totalOrders
  }

  const cover = resolveCoverUrl(gig)
  const normalizedGallery = normalizeGallery(gig.gallery_images)

  // Preserve the commercial hierarchy while deduplicating records returned by
  // multiple shelves. A provider's other services come first, then category
  // relevance, then jurisdiction relevance. The existing SimilarGigs UI can
  // consume this richer list without new page-level business logic.
  const recommendationCandidates = [
    ...providerGigs.filter((candidate: any) => candidate.id !== gig.id),
    ...(sameCategoryRes.data || []),
    ...(sameJurisdictionRes.data || []),
  ]
  const seenRecommendationIds = new Set<string>()
  const normalizedSimilar = recommendationCandidates
    .filter((candidate: any) => {
      if (!candidate?.id || candidate.id === gig.id || seenRecommendationIds.has(candidate.id)) return false
      seenRecommendationIds.add(candidate.id)
      return true
    })
    .slice(0, 6)
    .map((sg: any) => {
      // starting_price is a shaped API field, not a public.gigs column. Derive
      // it from the cheapest active tier so recommendation queries stay valid.
      const activeTiers = (sg.tiers || [])
        .filter((tier: any) => tier.is_active)
        .sort((a: any, b: any) => Number(a.price) - Number(b.price))

      return {
        ...sg,
        starting_price: activeTiers[0]?.price ?? null,
        provider: sg.provider || (sg.provider_id === gig.provider_id ? gig.provider : null),
        gallery_images: normalizeGallery(sg.gallery_images),
        cover_image_url: resolveCoverUrl(sg),
      }
    })

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
      provider_headshot_url,
      similar_gigs: normalizedSimilar,
      viewer_is_owner: isOwner || isAdmin,
    },
    seo: {
      title: `${gig.seo_title || gig.title} | YouSafe`,
      description: gig.seo_description || gig.pitch || '',
      og_image: cover,
      canonical_path: `/gigs/${gig.slug}`,
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