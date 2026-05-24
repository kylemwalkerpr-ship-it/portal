import { unstable_cache } from 'next/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'

export const CATEGORY_TILES = [
  { id: 'immigration',  title: 'Immigration services',   icon: 'Globe',     tag: 'POPULAR' },
  { id: 'education',    title: 'Education & admissions', icon: 'Cap',       tag: 'TRENDING' },
  { id: 'legal',        title: 'Legal services',         icon: 'Scale',     tag: null },
  { id: 'settlement',   title: 'Settlement & integration', icon: 'House',   tag: null },
  { id: 'career',       title: 'Career development',     icon: 'Briefcase', tag: null },
  { id: 'business',     title: 'Business services',      icon: 'Coin',      tag: null },
  { id: 'credentials',  title: 'Credentials & assessment', icon: 'Doc',     tag: 'NEW' },
  { id: 'mentorship',   title: 'Mentorship & coaching',  icon: 'Spark',     tag: null },
] as const

export type CategoryTileId = typeof CATEGORY_TILES[number]['id']

export const FALLBACK_COUNTS: Record<string, number> = {
  immigration: 218,
  education: 186,
  legal: 154,
  settlement: 142,
  career: 128,
  business: 96,
  credentials: 84,
  mentorship: 72,
}

export const getCategoryCounts = unstable_cache(async (): Promise<Record<string, number>> => {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return FALLBACK_COUNTS
    const db = createSupabaseAdminClient()
    const { data: gigs } = await db
      .from('gigs')
      .select('category')
      .eq('status', 'active')

    if (!gigs || gigs.length === 0) return FALLBACK_COUNTS

    const counts: Record<string, number> = {}
    for (const gig of gigs) {
      const cat = gig.category?.toLowerCase().trim()
      if (cat) {
        counts[cat] = (counts[cat] || 0) + 1
      }
    }

    // Merge: live counts where available, fallback otherwise
    const result: Record<string, number> = { ...FALLBACK_COUNTS }
    for (const [cat, count] of Object.entries(counts)) {
      if (count > 0) result[cat] = count
    }
    return result
  } catch {
    return FALLBACK_COUNTS
  }
}, ['landing-category-counts'], { revalidate: 600 })
