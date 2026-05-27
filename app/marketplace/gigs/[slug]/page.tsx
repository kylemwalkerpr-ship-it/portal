import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { GigDetailPage } from '@/components/marketplace/GigDetailPage'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

/**
 * Defensive per-page SEO. Gig detail is auth-walled and noindex today, so
 * `robots: { index: false }` stays on — but the metadata is wired up so when
 * the gig surface is flipped to public we just remove that one line.
 */
/**
 * Check if a slug has been redirected (via gig_slug_redirects table)
 * and return the new slug, or null if no redirect exists.
 * This is separated so both generateMetadata and Page can use it.
 */
async function checkSlugRedirect(slug: string): Promise<string | null> {
  try {
    const db = createSupabaseAdminClient()
    const { data: row } = await db
      .from('gig_slug_redirects')
      .select('new_slug')
      .eq('old_slug', slug)
      .maybeSingle()
    return row?.new_slug ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    // Check for slug redirect before attempting to load the gig
    const redirected = await checkSlugRedirect(slug)
    if (redirected) {
      // Return metadata for the canonical location — the actual 301
      // redirect happens in the Page component below, but crawlers that
      // only follow og:url will end up at the right place.
      const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/gigs/${redirected}/`)
      return {
        title: 'Gig | YouSafe',
        robots: { index: true, follow: true },
        alternates: { canonical: canonicalUrl },
      }
    }

    const db = createSupabaseAdminClient()
    const { data: gig } = await db
      .from('gigs')
      .select('title, description, gallery_images, seo_title, seo_description')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (!gig) {
      return { title: 'Gig | YouSafe', robots: { index: false } }
    }

    const title = `${gig.seo_title || gig.title} | YouSafe`
    const description = (gig.seo_description || gig.description || '').toString().slice(0, 155)
    const cover = Array.isArray(gig.gallery_images) && gig.gallery_images.length
      ? (gig.gallery_images[0]?.url || gig.gallery_images[0])
      : undefined
    const canonicalUrl = await getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        url: canonicalUrl,
        title,
        description,
        type: 'website',
        images: cover ? [cover] : undefined,
      },
      twitter: { card: 'summary_large_image', title, description, images: cover ? [cover] : undefined },
      robots: { index: true, follow: true },
    }
  } catch {
    return { title: 'Gig | YouSafe', robots: { index: false } }
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Server-side 301 redirect for old slugs that were cleaned up.
  // This runs before the client component renders, so crawlers and
  // browser visitors both get a proper HTTP 301 to the new URL.
  const redirected = await checkSlugRedirect(slug)
  if (redirected) {
    redirect(`/marketplace/gigs/${redirected}`)
  }

  return <GigDetailPage slug={slug} />
}
