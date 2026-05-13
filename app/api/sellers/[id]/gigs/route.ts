import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = createSupabaseAdminClient()

  // Find the seller's profile_id
  const [{ data: attorney }, { data: consultant }] = await Promise.all([
    db.from('attorneys').select('profile_id').eq('id', id).single(),
    db.from('consultants').select('profile_id').eq('id', id).single(),
  ])

  const provider = attorney || consultant
  if (!provider) {
    return fail('Seller not found', 404)
  }

  const profileId = provider.profile_id

  // Get seller's gigs
  const { data: gigs, error } = await db
    .from('gigs')
    .select('*, tiers:gig_tiers(*)')
    .eq('provider_id', profileId)
    .eq('status', 'active')
    .order('order_count', { ascending: false })

  if (error) {
    return fail(error.message, 500)
  }

  const shaped = (gigs || []).map((gig: any) => {
    const activeTiers = (gig.tiers || []).filter((t: any) => t.is_active)
    const cheapest = activeTiers.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0]

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
      image_url: gig.cover_image_url,
      gallery_images: gig.gallery_images,
    }
  })

  return ok({ gigs: shaped })
}
