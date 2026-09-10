import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * `/sellers/[id]` is a legacy public entry point that predates the canonical
 * Marketplace provider route. Keep it as a permanent compatibility alias so
 * old cards, bookmarks and external links land on the same provider layout
 * used everywhere else instead of maintaining two visual/profile systems.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  try {
    const db = createSupabaseAdminClient()
    const { data: seller } = await db
      .from('profiles')
      .select('full_name, role, country, avatar_url, username')
      .eq('id', id)
      .maybeSingle()

    if (!seller) return { title: 'Provider | YouSafe', robots: { index: false, follow: true } }

    const title = `${seller.full_name || 'Provider'} | YouSafe Marketplace`
    const role = seller.role ? String(seller.role).charAt(0).toUpperCase() + String(seller.role).slice(1) : 'Provider'
    const description = `${role} on YouSafe Marketplace${seller.country ? ` — ${seller.country}` : ''}. View services, reviews, and contact options.`.slice(0, 155)
    const canonicalToken = seller.username || id
    const canonical = `https://market.yousafeconsultancy.com/marketplace/providers/${encodeURIComponent(canonicalToken)}`

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        type: 'profile',
        url: canonical,
        images: seller.avatar_url ? [seller.avatar_url] : undefined,
      },
      // The canonical provider page owns indexing; this alias only preserves
      // existing inbound links until clients/crawlers follow the redirect.
      robots: { index: false, follow: true },
    }
  } catch {
    return { title: 'Provider | YouSafe', robots: { index: false, follow: true } }
  }
}

export default async function LegacySellerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  permanentRedirect(`/marketplace/providers/${encodeURIComponent(id)}`)
}
