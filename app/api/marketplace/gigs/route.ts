import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const category = url.searchParams.get('category')
  const providerType = url.searchParams.get('provider_type')
  const sort = url.searchParams.get('sort') || 'relevance'

  let query = auth.db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email)')
    .eq('status', 'active')

  if (q.length >= 2) query = query.or(`title.ilike.%${q}%,pitch.ilike.%${q}%,description.ilike.%${q}%`)
  if (category) query = query.eq('category', category)
  if (providerType && ['attorney', 'consultant'].includes(providerType)) query = query.eq('provider_type', providerType)

  if (sort === 'best_rated') query = query.gte('review_count', 3).order('avg_rating', { ascending: false })
  else if (sort === 'most_orders') query = query.order('order_count', { ascending: false })
  else if (sort === 'newest') query = query.order('published_at', { ascending: false })
  else query = query.order('rank_score', { ascending: false }).order('published_at', { ascending: false })

  const { data: gigs, error } = await query.limit(60)
  if (error) return fail(error.message, 500)

  const shaped = (gigs ?? []).map((gig: any) => {
    const activeTiers = (gig.tiers || []).filter((t: any) => t.is_active)
    const cheapest = activeTiers.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0]
    return {
      ...gig,
      starting_price: cheapest?.price ?? null,
      delivery_days: cheapest?.delivery_days ?? null,
      new_badge: Number(gig.order_count || 0) < 5 && Number(gig.review_count || 0) < 3,
    }
  })

  if (sort === 'price_asc') shaped.sort((a: any, b: any) => Number(a.starting_price || 0) - Number(b.starting_price || 0))
  if (sort === 'price_desc') shaped.sort((a: any, b: any) => Number(b.starting_price || 0) - Number(a.starting_price || 0))

  return ok({ gigs: shaped })
}
