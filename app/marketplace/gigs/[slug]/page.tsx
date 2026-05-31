import type { Metadata } from 'next'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { GigDetailPage } from '@/components/marketplace/GigDetailPage'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceBaseUrl, getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { buildGigJsonLd } from '@/lib/gigJsonLd'
import { getCategoryById, getSubcategoryById, type CategoryId, type SubcategoryId } from '@/lib/categories'

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

// Slug → readable title. Capped to fit the " | YouSafe Marketplace" suffix
// (23 chars) within Google's ~60-char title-budget — so the words portion
// is capped at 37 chars, and we trim on a word boundary when we hit it.
function titleFromSlug(slug: string): string {
  const MAX_WORDS_LEN = 37
  const words = slug
    .split('-')
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
  let out = ''
  for (const w of words) {
    const next = out ? `${out} ${w}` : w
    if (next.length > MAX_WORDS_LEN) break
    out = next
  }
  return out || words[0] || 'Service'
}

// React cache() dedupes the same call inside one request, so generateMetadata
// and Page share a single Supabase round-trip per visit instead of doubling up.
// We cast through `any` because PostgREST's inferred type for a SELECT this
// wide (with two joined relations) is a union that omits fields it can't
// statically prove are present — the established pattern in this repo.
const loadGigForSeo = cache(async (slug: string): Promise<any | null> => {
  try {
    const db = createSupabaseAdminClient()
    const { data: gig } = await db
      .from('gigs')
      .select(
        // Everything the JSON-LD builder needs: identifiers, copy, pricing
        // signals, gallery, FAQ, jurisdiction, plus the tier + provider joins.
        'id, slug, title, description, seo_title, seo_description, category, subcategory, jurisdiction, avg_rating, review_count, order_count, starting_price, gallery_images, faq, provider_id, provider_type, ' +
          'tiers:gig_tiers(tier, title, description, price, delivery_days, revisions, is_active), ' +
          'provider:profiles!gigs_provider_id_fkey(id, full_name, username)',
      )
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()
    return gig as any
  } catch {
    return null
  }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    // Check for slug redirect before attempting to load the gig
    const redirected = await checkSlugRedirect(slug)
    if (redirected) {
      // Return metadata for the canonical location — the actual 301
      // redirect happens in the Page component below, but crawlers that
      // only follow og:url will end up at the right place.
      const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/gigs/${redirected}/`)
      return {
        title: 'Gig | YouSafe',
        robots: { index: true, follow: true },
        alternates: { canonical: canonicalUrl },
      }
    }

    const gig = await loadGigForSeo(slug)

    if (!gig) {
      // Always emit a self-canonical even on the noindex fallback. Without
      // alternates.canonical, Next.js falls back to root layout's metadata
      // (which canonicalises to portal home) — Ahrefs flagged that as
      // "non-canonical" on every draft / missing gig URL.
      const fallbackCanonical = getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)
      return {
        title: `${titleFromSlug(slug)} | YouSafe Marketplace`,
        description: 'Browse this YouSafe Marketplace service, compare provider scope, delivery details, and request help through secure checkout.',
        alternates: { canonical: fallbackCanonical },
        robots: { index: false, follow: true },
      }
    }

    const title = `${gig.seo_title || gig.title} | YouSafe`
    const description = (gig.seo_description || gig.description || '').toString().slice(0, 155)
    const cover = Array.isArray(gig.gallery_images) && gig.gallery_images.length
      ? ((gig.gallery_images[0] as { url?: string })?.url || (gig.gallery_images[0] as unknown as string))
      : undefined
    const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)

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
    const fallbackCanonical = getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)
    return {
      title: `${titleFromSlug(slug)} | YouSafe Marketplace`,
      description: 'Browse this YouSafe Marketplace service, compare provider scope, delivery details, and request help through secure checkout.',
      alternates: { canonical: fallbackCanonical },
      robots: { index: false, follow: true },
    }
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

  // Build the JSON-LD graph for this gig. Failure here must never break the
  // page render — emit nothing rather than a broken script.
  let jsonLd: object | null = null
  try {
    const gig = await loadGigForSeo(slug)
    if (gig) {
      const canonicalUrl = getMarketplaceCanonicalUrl(`/marketplace/gigs/${slug}/`)
      const marketplaceBaseUrl = getMarketplaceBaseUrl()
      const category = gig.category ? getCategoryById(gig.category as CategoryId) : undefined
      const subcategory = gig.subcategory && gig.category
        ? getSubcategoryById(gig.category as CategoryId, gig.subcategory as SubcategoryId)
        : undefined
      jsonLd = buildGigJsonLd({
        gig: {
          id: gig.id,
          slug: gig.slug,
          title: gig.title,
          description: gig.description,
          seo_title: gig.seo_title,
          seo_description: gig.seo_description,
          category: gig.category,
          subcategory: gig.subcategory,
          jurisdiction: gig.jurisdiction,
          avg_rating: gig.avg_rating,
          review_count: gig.review_count,
          order_count: gig.order_count,
          starting_price: gig.starting_price,
          gallery_images: gig.gallery_images as Array<{ url?: string } | string> | null,
          faq: gig.faq as Array<{ question: string; answer: string }> | null,
          provider_type: gig.provider_type,
        },
        tiers: Array.isArray(gig.tiers) ? (gig.tiers as Array<{
          tier?: string | null; title?: string | null; description?: string | null;
          price?: number | null; delivery_days?: number | null; revisions?: number | null; is_active?: boolean | null
        }>) : [],
        provider: Array.isArray(gig.provider) ? (gig.provider[0] ?? null) : (gig.provider as { id: string; full_name?: string | null; username?: string | null } | null),
        canonicalUrl,
        marketplaceBaseUrl,
        categoryLabel: category?.name ?? null,
        subcategoryLabel: subcategory?.name ?? null,
      })
    }
  } catch { /* JSON-LD is opportunistic — never block the page. */ }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <GigDetailPage slug={slug} />
    </>
  )
}
