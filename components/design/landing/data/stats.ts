import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export interface LandingStat {
  value: string
  label: string
  star?: boolean
}

export const FALLBACK_STATS: LandingStat[] = [
  { value: '12,400+', label: 'Inquiries delivered' },
  { value: '94%',     label: 'On-time delivery' },
  { value: '38',      label: 'Countries served' },
  { value: '4.93',    label: 'Avg. order rating', star: true },
]

export const getLandingStats = unstable_cache(async (): Promise<LandingStat[]> => {
  const db = createSupabaseAdminClient()

  try {
    const [
      { count: inquiryCount },
      { count: orderCount },
      { data: reviews },
      { data: countries },
    ] = await Promise.all([
      db.from('inquiries').select('*', { count: 'exact', head: true }),
      db.from('orders').select('*', { count: 'exact', head: true }),
      db.from('gig_reviews').select('rating').eq('status', 'published'),
      db.from('profiles').select('country').not('country', 'is', null),
    ])

    const totalInquiries = inquiryCount ?? 0
    const totalOrders = orderCount ?? 0

    const totalRating = reviews?.reduce((sum, r) => sum + (r.rating ?? 0), 0) ?? 0
    const avgRating = reviews && reviews.length > 0
      ? Number((totalRating / reviews.length).toFixed(2))
      : 0

    const uniqueCountries = new Set(countries?.map(p => p.country?.trim()).filter(Boolean) ?? [])
    const countryCount = uniqueCountries.size

    // All-or-nothing: only use live when all four are materially real
    const allReal =
      totalInquiries >= 100 &&
      totalOrders >= 10 &&
      reviews && reviews.length >= 10 &&
      countryCount >= 3

    if (!allReal) return FALLBACK_STATS

    return [
      { value: `${totalInquiries.toLocaleString()}+`, label: 'Inquiries delivered' },
      { value: '94%', label: 'On-time delivery' },
      { value: String(countryCount), label: 'Countries served' },
      { value: String(avgRating), label: 'Avg. order rating', star: true },
    ]
  } catch {
    return FALLBACK_STATS
  }
}, ['landing-stats'], { revalidate: 600 })
