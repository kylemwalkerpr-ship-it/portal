import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { slug } = await context.params

  const { data: gig, error } = await auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), reviews:gig_reviews(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email, created_at)')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()

  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)
  const cover = Array.isArray(gig.gallery_images) && gig.gallery_images[0]?.url ? gig.gallery_images[0].url : null
  return ok({
    gig,
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
