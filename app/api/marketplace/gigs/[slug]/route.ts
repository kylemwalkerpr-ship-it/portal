import { ok, fail } from '@/lib/apiEnvelope'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const ACTIVE_QUEUE_STATUSES = new Set([
  'created',
  'new',
  'queued',
  'pending',
  'active',
  'in_progress',
  'working',
  'review',
  'under_review',
  'delivered',
  'awaiting_approval',
  'revision',
  'revision_requested',
])

const EXCLUDED_REPUTATION_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'rejected',
  'failed',
  'void',
  'deleted',
])

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

  // Every enrichment here is read-only and best-effort. A missing optional
  // reputation table must never make a live marketplace service unavailable.
  const [providerGigsRes, providerHeadshotRes, similarGigsRes, sellerLevelRes] = await Promise.all([
    db
      .from('gigs')
      .select('id, avg_rating, review_count, order_count')
      .eq('provider_id', gig.provider_id)
      .eq('status', 'active'),
    db
      .from(providerSellerTable)
      .select('headshot_url')
      .eq('profile_id', gig.provider_id)
      .maybeSingle(),
    db
      .from('gigs')
      .select('id, slug, title, starting_price, avg_rating, gallery_images')
      .eq('category', gig.category)
      .eq('status', 'active')
      .neq('id', gig.id)
      .limit(6),
    db
      .from('seller_level_snapshots')
      .select('level, rating, completed_orders, on_time_delivery_rate, response_rate, cancellation_rate, computed_at')
      .eq('provider_profile_id', gig.provider_id)
      .eq('provider_type', gig.provider_type)
      .maybeSingle(),
  ])

  const providerGigs = providerGigsRes.data || []
  const providerGigIds = providerGigs.map((row: any) => row.id).filter(Boolean)
  const provider_headshot_url = (providerHeadshotRes?.data as { headshot_url?: string | null } | null)?.headshot_url || null
  const similarGigs = similarGigsRes.data || []
  const sellerLevel = sellerLevelRes?.data || null

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

  // Orders already carry gig_id + client_id. Use those existing facts to show
  // workload and repeat-client proof without adding schema or writing counters.
  let activeQueueCount = 0
  let repeatClientCount = 0
  let repeatOrderCount = 0

  if (providerGigIds.length > 0) {
    const { data: providerOrders } = await db
      .from('orders')
      .select('client_id, status, gig_id')
      .in('gig_id', providerGigIds)

    if (Array.isArray(providerOrders)) {
      const clientOrderCounts = new Map<string, number>()

      for (const row of providerOrders as Array<{ client_id?: string | null; status?: string | null; gig_id?: string | null }>) {
        const status = String(row.status || '').toLowerCase()
        if (EXCLUDED_REPUTATION_STATUSES.has(status)) continue

        if (row.gig_id === gig.id && ACTIVE_QUEUE_STATUSES.has(status)) {
          activeQueueCount += 1
        }

        if (row.client_id) {
          clientOrderCounts.set(row.client_id, (clientOrderCounts.get(row.client_id) || 0) + 1)
        }
      }

      for (const count of clientOrderCounts.values()) {
        if (count >= 2) {
          repeatClientCount += 1
          repeatOrderCount += count - 1
        }
      }
    }
  }

  const cover = resolveCoverUrl(gig)
  const normalizedGallery = normalizeGallery(gig.gallery_images)
  const normalizedSimilar = similarGigs.map((sg: any) => ({
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
      provider_headshot_url,
      seller_level: sellerLevel?.level || null,
      seller_level_rating: sellerLevel?.rating ?? null,
      seller_completed_orders: sellerLevel?.completed_orders ?? null,
      seller_on_time_delivery_rate: sellerLevel?.on_time_delivery_rate ?? null,
      seller_response_rate: sellerLevel?.response_rate ?? null,
      seller_cancellation_rate: sellerLevel?.cancellation_rate ?? null,
      seller_level_computed_at: sellerLevel?.computed_at || null,
      active_queue_count: activeQueueCount,
      repeat_client_count: repeatClientCount,
      repeat_order_count: repeatOrderCount,
      similar_gigs: normalizedSimilar,
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