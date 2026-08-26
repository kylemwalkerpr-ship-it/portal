import { providerDisplayName } from './providerDisplayName'

// Builds the schema.org JSON-LD graph rendered on every public gig page.
//
// Why an @graph instead of multiple <script> blocks: Google links the entities
// by `@id` (Service ← Offer ← Provider ← AggregateRating ← FAQPage ←
// BreadcrumbList). Putting them in one @graph keeps the `@id` references stable
// and lets Search Console parse them as one connected SKU + provider.
//
// All entities are emitted only when the underlying data is present — no fake
// AggregateRating on a gig with zero reviews, no FAQPage when there are no Q/As.

export interface GigJsonLdInput {
  gig: {
    id: string
    slug: string
    title: string
    description?: string | null
    seo_title?: string | null
    seo_description?: string | null
    category?: string | null
    subcategory?: string | null
    jurisdiction?: string | null
    avg_rating?: number | null
    review_count?: number | null
    order_count?: number | null
    starting_price?: number | null
    gallery_images?: Array<{ url?: string } | string> | null
    faq?: Array<{ question: string; answer: string }> | null
    provider_type?: 'attorney' | 'consultant' | string | null
  }
  tiers: Array<{
    tier?: string | null
    title?: string | null
    description?: string | null
    price?: number | null
    delivery_days?: number | null
    revisions?: number | null
    is_active?: boolean | null
  }>
  provider: {
    id: string
    full_name?: string | null
    username?: string | null
  } | null
  canonicalUrl: string
  marketplaceBaseUrl: string
  categoryLabel?: string | null
  subcategoryLabel?: string | null
}

const SITE_BRAND = 'YouSafe Consultancy'
const SITE_ROOT = 'https://yousafeconsultancy.com'
const JURISDICTION_LABEL: Record<string, string> = {
  us: 'United States',
  uk: 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
}

function firstImageUrl(gallery?: GigJsonLdInput['gig']['gallery_images']): string | null {
  if (!Array.isArray(gallery) || gallery.length === 0) return null
  const first = gallery[0]
  if (!first) return null
  if (typeof first === 'string') return first
  return first.url ?? null
}

function priceFromCentsOrUnits(raw: number | null | undefined): string | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null
  // Tier prices in gig_tiers are stored as integer cents; starting_price uses
  // the same convention. We render USD as a fixed-2 decimal string per
  // schema.org/Offer.price guidance ("number as string, no currency symbol").
  return (raw / 100).toFixed(2)
}

export function buildGigJsonLd(input: GigJsonLdInput): object {
  const { gig, tiers, provider, canonicalUrl, marketplaceBaseUrl, categoryLabel, subcategoryLabel } = input

  const serviceId = `${canonicalUrl}#service`
  const providerId = `${canonicalUrl}#provider`
  const orgId = `${SITE_ROOT}#org`

  const image = firstImageUrl(gig.gallery_images)
  const jurisdictionLabel = gig.jurisdiction ? (JURISDICTION_LABEL[gig.jurisdiction.toLowerCase()] || gig.jurisdiction) : null

  // ── Service ──────────────────────────────────────────────────────────
  const serviceNode: Record<string, unknown> = {
    '@type': 'Service',
    '@id': serviceId,
    name: gig.seo_title || gig.title,
    description: (gig.seo_description || gig.description || '').toString().slice(0, 5000) || undefined,
    serviceType: subcategoryLabel || categoryLabel || gig.category || undefined,
    category: categoryLabel || gig.category || undefined,
    url: canonicalUrl,
    image: image || undefined,
    provider: { '@id': providerId },
    brand: { '@id': orgId },
    areaServed: jurisdictionLabel ? { '@type': 'Country', name: jurisdictionLabel } : undefined,
  }

  // ── Offer / AggregateOffer (one per active tier) ─────────────────────
  const activeTiers = (tiers || []).filter(t => t?.is_active !== false && typeof t?.price === 'number' && t.price > 0)
  const offers = activeTiers
    .map((t, i) => {
      const price = priceFromCentsOrUnits(t.price ?? null)
      if (!price) return null
      return {
        '@type': 'Offer',
        '@id': `${canonicalUrl}#offer-${t.tier || i}`,
        name: t.title || (t.tier ? t.tier[0].toUpperCase() + t.tier.slice(1) : `Tier ${i + 1}`),
        description: t.description || undefined,
        price,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: canonicalUrl,
        seller: { '@id': providerId },
        deliveryLeadTime: typeof t.delivery_days === 'number' && t.delivery_days > 0
          ? { '@type': 'QuantitativeValue', value: t.delivery_days, unitCode: 'DAY' }
          : undefined,
      }
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)

  // Prefer an AggregateOffer envelope when multiple tiers exist (Google parses
  // it for "from $X" rich snippets); fall back to the single offer or a
  // starting-price-only Offer if no tiers are configured.
  const fallbackStarting = priceFromCentsOrUnits(gig.starting_price ?? null)
  if (offers.length > 1) {
    const prices = offers.map(o => Number(o.price)).filter(p => !Number.isNaN(p))
    serviceNode.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      offerCount: offers.length,
      offers,
    }
  } else if (offers.length === 1) {
    serviceNode.offers = offers[0]
  } else if (fallbackStarting) {
    serviceNode.offers = {
      '@type': 'Offer',
      '@id': `${canonicalUrl}#offer`,
      price: fallbackStarting,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
      seller: { '@id': providerId },
    }
  }

  // ── AggregateRating (only when there are real reviews) ───────────────
  const reviewCount = typeof gig.review_count === 'number' ? gig.review_count : 0
  const avgRating = typeof gig.avg_rating === 'number' ? gig.avg_rating : 0
  if (reviewCount > 0 && avgRating > 0) {
    serviceNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: avgRating.toFixed(2),
      reviewCount,
      bestRating: '5',
      worstRating: '1',
    }
  }

  // ── Provider (Person for attorney/consultant) ────────────────────────
  // `Service.provider` is the seller, so the Person we emit IS the attorney /
  // consultant. The organisation gets its own node referenced by `brand` and
  // `worksFor` so reviewers see both linked.
  const providerName = providerDisplayName(provider, 'Service provider')
  const providerNode: Record<string, unknown> = {
    '@type': 'Person',
    '@id': providerId,
    name: providerName,
    jobTitle: gig.provider_type === 'attorney' ? 'Attorney' : gig.provider_type === 'consultant' ? 'Consultant' : undefined,
    worksFor: { '@id': orgId },
    url: provider?.username ? `${marketplaceBaseUrl}/providers/${provider.username}` : undefined,
  }

  const orgNode = {
    '@type': 'Organization',
    '@id': orgId,
    name: SITE_BRAND,
    url: SITE_ROOT,
  }

  // ── BreadcrumbList ───────────────────────────────────────────────────
  const breadcrumbItems: Array<{ '@type': 'ListItem'; position: number; name: string; item: string }> = [
    { '@type': 'ListItem', position: 1, name: 'Marketplace', item: `${marketplaceBaseUrl}/` },
  ]
  if (gig.category && categoryLabel) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: breadcrumbItems.length + 1,
      name: categoryLabel,
      item: `${marketplaceBaseUrl}/categories/${gig.category}`,
    })
  }
  breadcrumbItems.push({
    '@type': 'ListItem',
    position: breadcrumbItems.length + 1,
    name: gig.title,
    item: canonicalUrl,
  })

  const breadcrumbNode = {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl}#breadcrumbs`,
    itemListElement: breadcrumbItems,
  }

  // ── FAQPage (only when the gig has Q/As) ─────────────────────────────
  const faqEntries = Array.isArray(gig.faq)
    ? gig.faq.filter(q => q && typeof q.question === 'string' && q.question.trim() && typeof q.answer === 'string' && q.answer.trim())
    : []
  const faqNode = faqEntries.length > 0
    ? {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        mainEntity: faqEntries.map(q => ({
          '@type': 'Question',
          name: q.question,
          acceptedAnswer: { '@type': 'Answer', text: q.answer },
        })),
      }
    : null

  const graph: object[] = [serviceNode, providerNode, orgNode, breadcrumbNode]
  if (faqNode) graph.push(faqNode)

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
