import type { Metadata } from 'next'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { GigDetailPage } from '@/components/marketplace/GigDetailPage'
import { SsrHydrateGate } from '@/components/marketplace/SsrHydrateGate'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getMarketplaceBaseUrl, getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'
import { buildGigJsonLd } from '@/lib/gigJsonLd'
import { getCategoryById, getSubcategoryById, type CategoryId, type SubcategoryId } from '@/lib/categories'

// ISR: revalidate at most once per hour
export const revalidate = 3600

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
    // Primary path: only columns that exist on public.gigs. A single bad
    // column name (e.g. starting_price — price lives on gig_tiers) makes
    // PostgREST reject the whole select → null → noindex fallback and
    // keeps real active gigs out of Google.
    // Nested joins have also failed in OpenNext/Workers metadata generation.
    const { data: gig, error } = await db
      .from('gigs')
      .select(
        'id, slug, title, description, seo_title, seo_description, category, subcategory, jurisdiction, avg_rating, review_count, order_count, gallery_images, faq, provider_id, provider_type, status, pitch, tags',
      )
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()
    if (error) {
      console.warn('[gigs/seo] loadGigForSeo', slug, error.message)
      return null
    }
    if (!gig) return null

    // Best-effort enrich for JSON-LD — never let join failure drop indexability.
    try {
      const [{ data: tiers }, { data: provider }] = await Promise.all([
        db
          .from('gig_tiers')
          .select('tier, title, description, price, delivery_days, revisions, is_active')
          .eq('gig_id', gig.id)
          .eq('is_active', true),
        gig.provider_id
          ? db.from('profiles').select('id, full_name, username').eq('id', gig.provider_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const lowestTier = (tiers || [])
        .map((t: any) => (typeof t?.price === 'number' ? t.price : null))
        .filter((n: number | null): n is number => n != null && n > 0)
        .sort((a: number, b: number) => a - b)[0]
      return {
        ...gig,
        starting_price: lowestTier ?? null,
        tiers: tiers || [],
        provider: provider || null,
      } as any
    } catch {
      return { ...gig, starting_price: null, tiers: [], provider: null } as any
    }
  } catch (e) {
    console.warn('[gigs/seo] loadGigForSeo fatal', slug, e)
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

  // Single load for JSON-LD + SSR body (React cache() also dedupes with metadata).
  const gig = await loadGigForSeo(slug)

  // Build the JSON-LD graph for this gig. Failure here must never break the
  // page render — emit nothing rather than a broken script.
  let jsonLd: object | null = null
  try {
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

  // SSR crawlable body — GigDetailPage is a client island that hydrates
  // interactive UI. Without this block, crawlers only saw a loading shell
  // (~15 words) and treated active gigs as thin content.
  const ssrTitle = (gig?.seo_title || gig?.title || titleFromSlug(slug)) as string
  const ssrPitch = (gig?.pitch || '').toString().trim()
  const ssrDescription = (gig?.description || gig?.seo_description || '').toString().trim()
  const ssrFaq = Array.isArray(gig?.faq)
    ? (gig.faq as Array<{ question?: string; answer?: string }>).filter((f) => f?.question && f?.answer)
    : []
  const ssrTiers = Array.isArray(gig?.tiers) ? (gig.tiers as Array<{ title?: string; tier?: string; price?: number; delivery_days?: number; description?: string }>) : []
  const ssrTags = Array.isArray(gig?.tags) ? (gig.tags as string[]).filter(Boolean).slice(0, 12) : []
  const categoryLabel = gig?.category ? getCategoryById(gig.category as CategoryId)?.name : null
  const providerName =
    gig?.provider && !Array.isArray(gig.provider)
      ? (gig.provider as { full_name?: string | null })?.full_name
      : Array.isArray(gig?.provider)
        ? (gig.provider[0] as { full_name?: string | null } | undefined)?.full_name
        : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {gig && (
        <SsrHydrateGate readyEvent="yousafe:gig-ssr-ready">
        <article
          aria-label="Service overview"
          style={{
            maxWidth: 880,
            margin: '0 auto',
            padding: '28px 20px 8px',
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
            color: '#0F172A',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 8px' }}>
            {[categoryLabel, gig.jurisdiction ? String(gig.jurisdiction).toUpperCase() : null, gig.provider_type]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, margin: '0 0 12px' }}>{ssrTitle}</h1>
          {providerName && (
            <p style={{ fontSize: 14, color: '#475569', margin: '0 0 12px' }}>
              Offered by {providerName}
              {typeof gig.avg_rating === 'number' && gig.review_count
                ? ` · ${Number(gig.avg_rating).toFixed(1)}★ (${gig.review_count} review${gig.review_count === 1 ? '' : 's'})`
                : ''}
              {typeof gig.order_count === 'number' && gig.order_count > 0 ? ` · ${gig.order_count} orders` : ''}
            </p>
          )}
          {ssrPitch && (
            <p style={{ fontSize: 17, lineHeight: 1.55, margin: '0 0 16px', fontWeight: 500 }}>{ssrPitch}</p>
          )}
          {ssrDescription && (
            <div style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{ssrDescription}</div>
          )}
          {ssrTags.length > 0 && (
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px' }}>
              Topics: {ssrTags.join(', ')}
            </p>
          )}
          {ssrTiers.length > 0 && (
            <section style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>Packages</h2>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: 1.6 }}>
                {ssrTiers.map((t, i) => {
                  const price =
                    typeof t.price === 'number' && t.price > 0
                      ? t.price >= 1000
                        ? `$${(t.price / 100).toFixed(0)}`
                        : `$${t.price}`
                      : null
                  return (
                    <li key={i} style={{ marginBottom: 8 }}>
                      <strong>{t.title || t.tier || `Package ${i + 1}`}</strong>
                      {price ? ` — ${price}` : ''}
                      {typeof t.delivery_days === 'number' ? ` · ${t.delivery_days} day delivery` : ''}
                      {t.description ? ` — ${String(t.description).slice(0, 220)}` : ''}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {ssrFaq.length > 0 && (
            <section style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>FAQ</h2>
              {ssrFaq.slice(0, 8).map((f, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>{f.question}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: '#334155' }}>{f.answer}</p>
                </div>
              ))}
            </section>
          )}
          <p style={{ fontSize: 13, color: '#64748B', margin: '8px 0 0' }}>
            Fixed-price marketplace service on YouSafe. Compare scope and delivery below, then request securely through checkout. Document preparation is not legal advice unless provided by a licensed attorney on the engagement.
          </p>
        </article>
        </SsrHydrateGate>
      )}
      <GigDetailPage slug={slug} />
    </>
  )
}
