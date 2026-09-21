import { Suspense } from 'react'
import {
  CATEGORIES,
  type Category,
  type CategoryId,
  LEGACY_CATEGORY_MAP,
  normalizeCategory,
} from '@/lib/categories'
// MARKET-ROOT-TRANSFER-LATENCY: the landing stylesheet is a route stylesheet,
// not an inline <style> element. An inline style element is serialized into
// BOTH the HTML document and the RSC flight payload, so the same ~50 KB of CSS
// was shipped twice in every market-root document.
import './marketplace-landing.css'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { createSupabaseAdminClient } from '@/lib/supabase'
import {
  COUNTRY_META,
  FEATURED_PAGE_SIZE,
  deepLinkVisibleCount,
  resolveJurisdiction,
  toLandingCards,
  withCountry,
  type Country,
  type JxCode,
  type LandingCardGig,
  type LandingGig,
} from '@/lib/marketplaceDisplay'
import { rankedGigComparator } from '@/lib/marketplaceGigSort'
import { FeaturedBriefsGrid } from '@/components/marketplace/FeaturedBriefsGrid'
import {
  computeFacetCounts,
  getCachedFacetCounts,
  isResolved,
  setCachedFacetCounts,
  type FacetCounts,
} from '@/lib/marketplaceFacets'
import { resolveCoverUrl } from '@/lib/galleryImages'
import { providerDisplayName } from '@/lib/providerDisplayName'
import { MarketplaceFooter } from '@/components/marketplace/MarketplaceFooter'
import { MarketplaceHomeSeo } from '@/components/marketplace/MarketIndexSeo'
import { CountryPicker } from '@/components/marketplace/CountryTabs'
import { FaqAccordion } from '@/components/marketplace/FaqAccordion'
import { AllGigsDrawer } from '@/components/marketplace/AllGigsDrawer'
import HeroCaseFileSlideshow, { HeroSlide } from '@/components/marketplace/HeroCaseFileSlideshow'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'
import { FilesRailScroller } from '@/components/marketplace/FilesRailScroller'
import { ImmigrationPackRail } from '@/components/marketplace/ImmigrationPackRail'
import { HeroBackgroundMedia } from '@/components/marketplace/HeroBackgroundMedia'
import {
  assertMarketplaceBuildEstateNonEmpty,
  assertMarketplaceBuildServiceRoleAuthority,
  isMarketplaceProductionBuild,
  marketplaceErrorDetail,
} from '@/lib/marketplaceBuildAuthority'

/* ───────────────────────── Design tokens ────────────────────────── */

/* Use the shared CSS-variable tokens so the palette picker affects
   the full landing page — not just the shell navbar. */
import { T, F } from '@/components/marketplace/tokens'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

function signUpHref(utm: string): string {
  return (
    `${PORTAL_URL}/sign-up/student` +
    `?source=marketing&return_to=https://market.yousafeconsultancy.com/&utm_content=${encodeURIComponent(utm)}`
  )
}

/* ───────────────────────── Server data ─────────────────────────── */

interface CategoryStat {
  cat: Category
  count: number
  fromCents: number | null
}

interface JurisdictionStat {
  code: JxCode
  name: string
  currency: string
  count: number
  fromCents: number | null
  topCategories: Array<{ name: string; count: number }>
}

interface LandingReview {
  rating: number
  body: string
  gigTitle: string
  reviewerInitial: string
  reviewerName: string
}

interface Slice {
  /**
   * First ranked page of the slice — the cards the SERVER renders (crawlable)
   * and the only gig records that travel to the browser. Later pages are
   * fetched on demand from /api/marketplace/gigs?view=card (MARKET-ROOT-TRANSFER-LATENCY).
   */
  featured: LandingCardGig[]
  /** Ranked size of the whole slice (never truncated) — pager totals, chips. */
  totalFeatured: number
  /** Full-slice category facet counts for the discovery chip row. */
  categoryCounts: Record<string, number>
  caseFile: (LandingGig & { caseTiers: Array<{ tier: string; price: number }> }) | null
  categories: CategoryStat[]
  totalActive: number
  fromCents: number | null
  currency: string
  label: string
}

interface LandingData {
  slices: Record<Country, Slice>
  jurisdictions: JurisdictionStat[]
  reviews: LandingReview[]
  /** Live DB facet counts (lib/marketplaceFacets). null = COUNT path failed entirely. */
  facets: FacetCounts | null
}

function emptySlice(label: string, currency: string): Slice {
  return {
    featured: [],
    totalFeatured: 0,
    categoryCounts: {},
    caseFile: null,
    categories: CATEGORIES.slice(0, 8).map((cat) => ({ cat, count: 0, fromCents: null })),
    totalActive: 0,
    fromCents: null,
    currency,
    label,
  }
}

function buildSlice(label: string, currency: string, gigs: LandingGig[]): Slice {
  const catCount = new Map<CategoryId, number>()
  const catMin = new Map<CategoryId, number>()
  let fromCents: number | null = null

  for (const g of gigs) {
    const catId = g.category
      ? (LEGACY_CATEGORY_MAP[g.category] || normalizeCategory(g.category))
      : null
    if (catId && CATEGORIES.some((c) => c.id === catId)) {
      catCount.set(catId, (catCount.get(catId) ?? 0) + 1)
      if (g.starting_price != null) {
        const cur = catMin.get(catId)
        if (cur == null || g.starting_price < cur) catMin.set(catId, g.starting_price)
      }
    }
    if (g.starting_price != null && (fromCents == null || g.starting_price < fromCents)) {
      fromCents = g.starting_price
    }
  }

  // Featured grid is ranked by demand & review score using the SAME total order
  // the listing API paginates with (rank_score desc, order_count desc, id asc —
  // marketplaceGigSort.ts). That equality is what lets the client append later
  // windows from /api/marketplace/gigs without duplicates or gaps: the build
  // snapshot and the API must window the same ranked sequence.
  //
  // Only the first page is serialized into the document. The rest of the slice
  // is fetched on demand (the size fix — the market root used to embed every
  // active gig, ~217 records twice-serialized, in the HTML + RSC payload).
  const ranked = [...gigs].sort(rankedGigComparator)
  const featured = toLandingCards(ranked.slice(0, FEATURED_PAGE_SIZE))

  // "Case file" hero card = highest-impressions-or-most-reviews gig in the
  // slice. We use a composite signal (max(order_count, review_count)) since
  // there's no impressions column; both are valid signals of "the gig
  // everyone gravitates to" and we want either to qualify. Tie-break on
  // rank_score.
  const score = (g: LandingGig) =>
    Math.max(Number(g.order_count || 0), Number(g.review_count || 0)) * 1000 +
    Number(g.rank_score || 0)
  const top = [...gigs].sort((a, b) => score(b) - score(a))[0]
  let caseFile: Slice['caseFile'] = null
  if (top) {
    const labels = ['Brief', 'Standard', 'Filed']
    const tiers = [...top.tiers]
      .sort((a, b) => a.price - b.price)
      .slice(0, 3)
      .map((t, i) => ({ tier: labels[i] ?? `Tier ${i + 1}`, price: t.price }))
    caseFile = { ...top, caseTiers: tiers }
  }

  return {
    featured,
    totalFeatured: ranked.length,
    // Chips must count the WHOLE slice, not the serialized first page: the
    // numbers are computed here from full inventory and travel as numbers.
    categoryCounts: Object.fromEntries(catCount.entries()),
    caseFile,
    categories: CATEGORIES.slice(0, 8).map((cat) => ({
      cat,
      count: catCount.get(cat.id) ?? 0,
      fromCents: catMin.get(cat.id) ?? null,
    })),
    totalActive: gigs.length,
    fromCents,
    currency,
    label,
  }
}

/** Empty SSR shell served when the DB client can't be created at all. */
function fallbackLandingData(): LandingData {
  const fallbackSlices: Record<Country, Slice> = {
    all: emptySlice('All jurisdictions', 'USD'),
    us: emptySlice('United States', 'USD'),
    uk: emptySlice('United Kingdom', 'GBP'),
    ca: emptySlice('Canada', 'CAD'),
    au: emptySlice('Australia', 'AUD'),
  }
  return {
    slices: fallbackSlices,
    jurisdictions: [
      { code: 'us', name: 'United States', currency: 'USD', count: 0, fromCents: null, topCategories: [] },
      { code: 'uk', name: 'United Kingdom', currency: 'GBP', count: 0, fromCents: null, topCategories: [] },
      { code: 'ca', name: 'Canada', currency: 'CAD', count: 0, fromCents: null, topCategories: [] },
      { code: 'au', name: 'Australia', currency: 'AUD', count: 0, fromCents: null, topCategories: [] },
    ],
    reviews: [],
    facets: null,
  }
}

/**
 * DB-backed landing snapshot. `null` means the Supabase client could not be
 * created — callers serve the empty shell WITHOUT persisting it.
 */
async function computeLandingData(): Promise<LandingData | null> {
  // BUILD-ONLY AUTHORITY GATE. This loader also serves the Worker, so the
  // guard is scoped to `phase-production-build` and runtime fail-soft
  // behavior below is unchanged. During the build, an anon-scoped client can
  // read zero rows from public.gigs without an error — baking that snapshot
  // is the false-empty landing this guard prevents.
  assertMarketplaceBuildServiceRoleAuthority('marketplace landing inventory')

  let db
  try {
    db = createSupabaseAdminClient()
  } catch (error) {
    if (isMarketplaceProductionBuild()) {
      throw new Error(
        `[marketplace/landing] admin client unavailable during production build: ${marketplaceErrorDetail(error)}`,
      )
    }
    return null
  }

  // One fat query: every active gig with provider country + tiers. The
  // marketplace inventory is small enough that pulling it whole on a public
  // landing is cheap, and partitioning happens in memory afterwards.
  // Do NOT request cover_image_url by name — that column is optional and
  // missing on some deployments; naming it triggers a PostgREST 42703 that
  // empties the whole inventory and leaves the marketplace blank.
  // resolveCoverUrl() below derives the cover from gallery_images[0] when
  // the column is absent, so card components still get an image.
  const inventoryP = db
    .from('gigs')
    .select(
      // provider_id is needed so we can join headshots from the seller-
      // specific tables (attorneys / consultants) below — profiles.avatar_url
      // is rarely set for verified sellers, so without that follow-up
      // query every gig card falls through to initials.
      'id, slug, title, category, provider_type, provider_id, jurisdiction, avg_rating, review_count, rank_score, order_count, gallery_images, tiers:gig_tiers(price, delivery_days, is_active), provider:profiles!gigs_provider_id_fkey(full_name, country)',
    )
    .eq('status', 'active')
    .order('rank_score', { ascending: false })
    // Headroom above the current 217 active gigs so the "show all" grid
    // contract holds as inventory grows; the whole-inventory pull stays
    // cheap per the comment above.
    .limit(1000)

  const reviewsP = db
    .from('gig_reviews')
    .select(
      'rating, body, gig:gigs(title), reviewer:profiles!gig_reviews_reviewer_id_fkey(full_name)',
    )
    .eq('status', 'published')
    .gte('rating', 5)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3)

  // Facet counts — same lib and the SAME versioned KV entry the gig-facets
  // API serves from, so the landing and discovery share one COUNT fan-out per
  // cache version. Keeps the "All (N)" and category chips in sync with what
  // the drawer/API would actually list, even when a seller pauses a gig
  // between this cached snapshot and a chip click. On a miss we compute via
  // the shared lib and write the raw counts back (nulls preserved) so a
  // failed COUNT still falls back per-field instead of lying with 0. Runs in
  // parallel with the inventory pull; never throws.
  const facetsP = (async (): Promise<FacetCounts> => {
    const cachedFacets = await getCachedFacetCounts()
    if (cachedFacets) return cachedFacets
    const counts = await computeFacetCounts(db)
    await setCachedFacetCounts(counts)
    return counts
  })()

  const [inventoryRes, reviewsRes, facetCounts] = await Promise.all([inventoryP, reviewsP, facetsP])

  // BUILD-ONLY SUPPLY GATE. A query error must fail the build instead of
  // baking the empty landing; at runtime the existing fail-soft shard keeps
  // rendering whatever the other probes returned.
  if (inventoryRes.error) {
    const detail = `inventory query failed: ${inventoryRes.error.message}`
    if (isMarketplaceProductionBuild()) {
      throw new Error(
        `[marketplace/landing] ${detail} — refusing to bake a false-empty landing page.`,
      )
    }
    console.warn(`[marketplace/landing] ${detail}`)
  }

  const inventoryRows = (inventoryRes.data ?? []) as any[]
  assertMarketplaceBuildEstateNonEmpty(
    'marketplace landing inventory',
    inventoryRows.length,
    'active gigs',
  )

  // Batch-fetch headshots from the seller-specific tables. Each profile_id
  // is unique per attorney/consultant row (we added unique(profile_id) in
  // an earlier migration), so the two queries return at most one row per
  // provider. We index by profile_id so the gig-map below resolves in O(1)
  // regardless of how many gigs a single seller owns.
  const providerIds = Array.from(
    new Set(inventoryRows.map((r) => r.provider_id).filter(Boolean)),
  )
  const headshotByProfileId = new Map<string, string>()
  if (providerIds.length > 0) {
    const [attyHeadshots, consHeadshots] = await Promise.all([
      db.from('attorneys').select('profile_id, headshot_url').in('profile_id', providerIds),
      db.from('consultants').select('profile_id, headshot_url').in('profile_id', providerIds),
    ])
    for (const row of (attyHeadshots.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
    for (const row of (consHeadshots.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
  }

  const allGigs: LandingGig[] = inventoryRows.map((row) => {
    const activeTiers = (row.tiers ?? [])
      .filter((t: any) => t.is_active && Number(t.price) > 0)
      .map((t: any) => ({ price: Number(t.price), delivery_days: t.delivery_days != null ? Number(t.delivery_days) : null }))
    const cheapest = activeTiers.sort((a: any, b: any) => a.price - b.price)[0]
    const country = row.provider?.country ?? null
    // Gig-level jurisdiction wins over provider.country — the column is the
    // contract going forward, profile country is only the legacy fallback
    // until the backfill catches every row.
    const gigJx: JxCode | null = ['us', 'uk', 'ca', 'au'].includes(String(row.jurisdiction || '').toLowerCase())
      ? (String(row.jurisdiction).toLowerCase() as JxCode)
      : null
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      provider_type: row.provider_type,
      avg_rating: Number(row.avg_rating ?? 0),
      review_count: Number(row.review_count ?? 0),
      rank_score: Number(row.rank_score ?? 0),
      order_count: Number(row.order_count ?? 0),
      starting_price: cheapest ? cheapest.price : null,
      delivery_days: cheapest ? cheapest.delivery_days : null,
      // Empty-string full_name must fall through — a blank name next to
      // "Licensed attorney" on the hero case-file card was the symptom.
      providerName: providerDisplayName(row.provider),
      providerCountry: country,
      providerHeadshot: headshotByProfileId.get(row.provider_id) ?? null,
      jx: gigJx ?? resolveJurisdiction(country),
      tiers: activeTiers,
      // Only the resolved cover travels to the cached snapshot / client grid.
      // The raw gallery would be re-serialized for every gig in every slice
      // (and ships in the RSC props) without a single consumer reading it —
      // resolveCoverUrl already collapsed gallery_images[0] into the cover.
      cover_image_url: resolveCoverUrl(row),
    }
  })

  const gigsByCountry: Record<JxCode, LandingGig[]> = { us: [], uk: [], ca: [], au: [] }
  for (const g of allGigs) {
    if (g.jx) gigsByCountry[g.jx].push(g)
  }
  // Gigs whose jurisdiction can't be resolved (no valid `jurisdiction` column
  // value AND no mappable provider.country) previously vanished from every
  // country tab — they only surfaced under "All jurisdictions". Include them
  // under every jurisdiction instead, mirroring the NULL-category treatment
  // in the category filters: active inventory must not be invisible. Card
  // badges already fall back to the active tab's code for jx=null gigs.
  const unresolvedJx = allGigs.filter((g) => !g.jx)
  if (unresolvedJx.length > 0) {
    for (const code of Object.keys(gigsByCountry) as JxCode[]) {
      gigsByCountry[code].push(...unresolvedJx)
    }
  }

  const slices: Record<Country, Slice> = {
    all: buildSlice('All jurisdictions', 'USD', allGigs),
    us: buildSlice(COUNTRY_META.us.name, COUNTRY_META.us.currency, gigsByCountry.us),
    uk: buildSlice(COUNTRY_META.uk.name, COUNTRY_META.uk.currency, gigsByCountry.uk),
    ca: buildSlice(COUNTRY_META.ca.name, COUNTRY_META.ca.currency, gigsByCountry.ca),
    au: buildSlice(COUNTRY_META.au.name, COUNTRY_META.au.currency, gigsByCountry.au),
  }

  /* ── Jurisdiction rail cards (always all 3, regardless of active slice) ── */
  const jurisdictions: JurisdictionStat[] = (Object.keys(COUNTRY_META) as JxCode[]).map((code) => {
    const slice = slices[code]
    const top = [...slice.categories]
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((c) => ({ name: c.cat.name, count: c.count }))
    return {
      code,
      name: COUNTRY_META[code].name,
      currency: COUNTRY_META[code].currency,
      // Prefer the DB COUNT (same source as the country-tab badges in the
      // drawer/API); in-memory partition only if that COUNT failed.
      count: isResolved(facetCounts.jurisdictionCounts[code])
        ? (facetCounts.jurisdictionCounts[code] as number)
        : slice.totalActive,
      fromCents: slice.fromCents,
      topCategories: top,
    }
  })

  /* ── Reviews ────────────────────────────────────────────────── */
  const reviews: LandingReview[] = ((reviewsRes.data ?? []) as any[])
    .filter((r) => r.body && r.gig?.title && r.reviewer?.full_name)
    .slice(0, 3)
    .map((r) => {
      const name: string = r.reviewer.full_name
      const initial = name.trim().charAt(0).toUpperCase() || 'A'
      const displayName = `${name.split(' ')[0]} ${(name.split(' ')[1] ?? '').charAt(0) || ''}.`.trim()
      return {
        rating: Number(r.rating),
        body: String(r.body),
        gigTitle: String(r.gig.title),
        reviewerInitial: initial,
        reviewerName: displayName,
      }
    })

  return { slices, jurisdictions, reviews, facets: facetCounts }
}

/* ───────────────────────── KV read-through ─────────────────────── */

// Explicit versioned-KV cache (lib/cache.ts) — not Next.js's data cache. The
// landing must not depend on OpenNext incremental-cache behavior for the
// single heaviest public fan-out (inventory + tiers + reviews + headshots +
// facet COUNTs). Same 5-minute freshness contract as before, but every read
// is a plain KV get that also works on the Free plan without an
// incremental-cache backend.
const LANDING_CACHE_TTL_SECONDS = 300
const LANDING_CACHE_PATH = '/marketplace-landing'
// Bumped v1 -> v2 with the first-page projection: the old entry holds the whole
// inventory, so it must never be served again (it would put all ~217 gigs back
// into the document). `isLandingData` below rejects it a second time.
const LANDING_CACHE_QUERY = 'v2'

function isLandingData(value: unknown): value is LandingData {
  const v = value as LandingData | null
  return Boolean(
    v &&
      typeof v === 'object' &&
      v.slices &&
      v.slices.all &&
      Array.isArray(v.slices.all.featured) &&
      // MARKET-ROOT-TRANSFER-LATENCY: a snapshot that still carries the whole
      // inventory (a pre-fix entry, or a future regression) is rejected as a
      // cache miss instead of being re-serialized into the document.
      v.slices.all.featured.length <= FEATURED_PAGE_SIZE &&
      Array.isArray(v.reviews) &&
      Array.isArray(v.jurisdictions),
  )
}

/**
 * Cached landing snapshot, keyed with the versioned `gigs` namespace so every
 * gig publish/edit/moderate (bumpCacheVersion('gigs')) invalidates it along
 * with the rest of the marketplace caches.
 *
 * Fail-soft: getCached returns null on miss/expired/KV error → recompute;
 * a malformed entry is treated as a miss and overwritten. The empty fallback
 * (DB client unavailable) is deliberately NOT written to KV — caching it
 * would keep the marketplace blank for the whole TTL after a transient blip.
 */
export async function loadLandingData(): Promise<LandingData> {
  const cacheKey = await generateVersionedCacheKey('gigs', LANDING_CACHE_PATH, LANDING_CACHE_QUERY)
  const cached = await getCached<LandingData>(cacheKey, LANDING_CACHE_TTL_SECONDS)
  if (isLandingData(cached)) return cached

  const fresh = await computeLandingData()
  if (!fresh) return fallbackLandingData()

  await setCached(cacheKey, fresh, LANDING_CACHE_TTL_SECONDS)
  return fresh
}

/* ───────────────────────── Helpers ─────────────────────────── */

// Card-render display helpers (formatPrice, glyphFor, initialsOf, …) and the
// country maps moved to lib/marketplaceDisplay.ts — shared with the client
// FeaturedBriefsGrid so both surfaces render cards identically.

const POPULAR_CHIPS: Record<Country, Array<{ label: string; q: string }>> = {
  all: [
    { label: 'F-1 visa denial recovery', q: 'F-1 denial' },
    { label: 'I-485 evidence package', q: 'I-485' },
    { label: 'OPT & STEM OPT review', q: 'OPT' },
    { label: 'Spouse visa financial req.', q: 'Spouse' },
    { label: 'Section 21 defence letter', q: 'Section 21' },
    { label: 'PGWP eligibility opinion', q: 'PGWP' },
  ],
  us: [
    { label: 'F-1 visa denial recovery', q: 'F-1 denial' },
    { label: 'I-485 evidence package', q: 'I-485' },
    { label: 'OPT & STEM OPT review', q: 'OPT' },
    { label: 'I-130 spouse petition', q: 'I-130' },
    { label: 'H-1B cap-gap memo', q: 'H-1B' },
    { label: '1040-NR + treaty review', q: '1040-NR' },
  ],
  uk: [
    { label: 'Spouse visa financial req.', q: 'Spouse visa' },
    { label: 'ILR from Spouse Visa', q: 'ILR' },
    { label: 'Skilled Worker COS review', q: 'Skilled Worker' },
    { label: 'Section 21 defence letter', q: 'Section 21' },
    { label: 'Renters Rights Act 2025', q: 'Renters Rights' },
    { label: 'Student & Graduate Route', q: 'Graduate Route' },
  ],
  ca: [
    { label: 'Express Entry CRS audit', q: 'Express Entry' },
    { label: 'PGWP eligibility opinion', q: 'PGWP' },
    { label: 'Study Permit pack', q: 'Study Permit' },
    { label: 'PNP strategy review', q: 'PNP' },
    { label: 'Spousal sponsorship', q: 'Spousal sponsorship' },
    { label: 'LMIA support letter', q: 'LMIA' },
  ],
  au: [
    { label: 'Student visa evidence pack', q: 'Subclass 500' },
    { label: 'Genuine Student review', q: 'Genuine Student' },
    { label: 'Subclass 485 checklist', q: 'Subclass 485' },
    { label: 'Work rights explanation', q: 'work rights' },
    { label: 'NSW tenancy help', q: 'NSW tenancy' },
    { label: 'Financial capacity review', q: 'financial capacity' },
  ],
}

/* ───────────────────────── JSON-LD ─────────────────────────── */

const SERVICE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'YouSafe Marketplace',
  provider: {
    '@type': 'Organization',
    name: 'YouSafe Consultancy',
    url: 'https://yousafeconsultancy.com',
  },
  serviceType: 'Immigration and Tenancy Legal Marketplace',
  areaServed: [
    { '@type': 'Country', name: 'United States' },
    { '@type': 'Country', name: 'United Kingdom' },
    { '@type': 'Country', name: 'Canada' },
    { '@type': 'Country', name: 'Australia' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Service categories',
    itemListElement: CATEGORIES.slice(0, 8).map((cat) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: cat.name, description: cat.description },
    })),
  },
}

const FAQS = [
  {
    q: 'Is YouSafe a law firm?',
    a:
      'No. YouSafe Consultancy operates a technology platform that connects students and immigrants with independent consultants and licensed attorneys. ' +
      "Legal advice comes from the attorney's own practice, not from YouSafe. The platform handles matching, messaging, file sharing, and escrow.",
  },
  {
    q: 'How do attorneys get vetted?',
    a:
      'Attorneys submit their bar or regulator number, malpractice insurance status, and jurisdiction. YouSafe checks registration against the relevant state or national database. ' +
      "This is a screening step, not an endorsement — verify the attorney's current standing with your local bar association.",
  },
  {
    q: 'How does escrow work?',
    a:
      'When you accept an offer, your payment is held in escrow by the platform. The provider is paid only after you confirm the deliverable meets the agreed brief. ' +
      "If the work isn't delivered as agreed, you can open a dispute through the platform.",
  },
  {
    q: 'What jurisdictions do you cover?',
    a:
      'The marketplace focuses on the United States, the United Kingdom, Canada, and Australia. Providers specialise in visas, work permits, permanent residency, family sponsorship, and tenancy law for those four countries.',
  },
]

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

/* ───────────────────────── Component ─────────────────────────── */

const HERO_HEADLINES: Record<Country, { eyebrow: string; h1: React.ReactNode; lede: string }> = {
  all: {
    eyebrow: 'US · UK · CA · AU — fixed-fee, no consultation traps',
    h1: <>Talk to an attorney about your case — <em>by the brief, not the hour.</em></>,
    lede:
      'A vetted marketplace of licensed immigration attorneys, regulated consultants and tenancy specialists. ' +
      'Pick a fixed-fee brief, review samples and timelines, and pay only when the work clears review.',
  },
  us: {
    eyebrow: 'United States · F-1 · OPT · I-130 · I-485',
    h1: <>U.S. immigration help — <em>by the brief, not the billable hour.</em></>,
    lede:
      'Licensed U.S. attorneys handling F-1 reinstatement, OPT and STEM OPT, marriage green cards, and family petitions. ' +
      'Fixed-fee briefs, evidence packs reviewed before filing, payment held in escrow until you approve.',
  },
  uk: {
    eyebrow: 'United Kingdom · ILR · Spouse · Skilled Worker · § Tenancy',
    h1: <>U.K. immigration & tenancy briefs — <em>fixed fee, no surprises.</em></>,
    lede:
      'OISC-regulated consultants and U.K. solicitors handling Spouse visas, ILR, Skilled Worker COS, Graduate Route, ' +
      'and Renters Rights Act 2025 disputes. Each brief is scoped and priced upfront.',
  },
  ca: {
    eyebrow: 'Canada · Study Permit · PGWP · Express Entry · Provincial tenancy',
    h1: <>Canadian immigration help — <em>by the brief, not the meter.</em></>,
    lede:
      'ICCRC-registered consultants and Canadian attorneys covering Study Permit packs, PGWP, Express Entry CRS, ' +
      'PNP strategy, spousal sponsorship, and provincial tenancy law. Fixed-fee, escrowed, refundable.',
  },
  au: {
    eyebrow: 'Australia · Subclass 500 · Subclass 485 · Student work rights',
    h1: <>Australian study and housing help — <em>by the brief, not the meter.</em></>,
    lede:
      'Providers covering student visa packs, Genuine Student checks, financial capacity evidence, graduate visa prep, ' +
      'and tenancy support for Australia. Fixed-fee briefs, escrowed payment, clear scope.',
  },
}

export async function PublicMarketplaceLanding({ country = 'all' as Country, page = 1 }: { country?: Country; page?: number }) {
  // The landing inventory fan-out (gigs + tiers + reviews + headshots) used to
  // run on EVERY anonymous request inside the Worker — a major CPU-time
  // (CF 1102) contributor. loadLandingData() now serves one explicit 5-minute
  // KV entry to all visitors (see the KV read-through above).
  const data = await loadLandingData()
  const active: Country = (['all', 'us', 'uk', 'ca', 'au'] as Country[]).includes(country) ? country : 'all'
  const slice = data.slices[active]
  const { reviews } = data
  const facets = data.facets
  const headline = HERO_HEADLINES[active]
  const chips = POPULAR_CHIPS[active]
  const totalActive = slice.totalActive
  const currency = slice.currency

  // Chip counts prefer the live DB facet COUNTs (same source as the
  // gig-facets API and the drawer), falling back per-field to the in-memory
  // partition whenever that COUNT didn't resolve.
  const chipTotal = isResolved(facets?.total) ? (facets!.total as number) : totalActive
  const catCountFor = (catId: CategoryId, inMemory: number): number =>
    isResolved(facets?.categoryCounts?.[catId]) ? (facets!.categoryCounts[catId] as number) : inMemory
  const baseCountryParam = active === 'all' ? '' : `&country=${active}`
  // Build one slide per jurisdiction that has a caseFile (most-popular gig).
  // Always include the active slice first, then remaining jurisdictions.
  // Fallback to the global top brief only for jurisdictions with zero gigs.
  const slides: HeroSlide[] = []
  const jxOrder: Country[] = [active, ...(['all', 'us', 'uk', 'ca', 'au'] as Country[]).filter((c) => c !== active)]
  for (const jx of jxOrder) {
    const s = data.slices[jx]
    if (!s) continue
    if (s.caseFile) {
      slides.push({
        id: s.caseFile.id,
        title: s.caseFile.title,
        providerName: s.caseFile.providerName,
        providerHeadshot: s.caseFile.providerHeadshot,
        provider_type: s.caseFile.provider_type,
        providerCountry: s.caseFile.providerCountry,
        jx: s.caseFile.jx,
        avg_rating: s.caseFile.avg_rating,
        review_count: s.caseFile.review_count,
        slug: s.caseFile.slug,
        caseTiers: s.caseFile.caseTiers,
        isFallback: false,
        label: s.label,
      })
    } else if (data.slices.all.caseFile) {
      slides.push({
        id: data.slices.all.caseFile.id,
        title: data.slices.all.caseFile.title,
        providerName: data.slices.all.caseFile.providerName,
        providerHeadshot: data.slices.all.caseFile.providerHeadshot,
        provider_type: data.slices.all.caseFile.provider_type,
        providerCountry: data.slices.all.caseFile.providerCountry,
        jx: data.slices.all.caseFile.jx,
        avg_rating: data.slices.all.caseFile.avg_rating,
        review_count: data.slices.all.caseFile.review_count,
        slug: data.slices.all.caseFile.slug,
        caseTiers: data.slices.all.caseFile.caseTiers,
        isFallback: true,
        label: s.label,
      })
    }
  }
  // Deduplicate by id.
  const deduped: HeroSlide[] = []
  const seen = new Set<string>()
  for (const s of slides) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      deduped.push(s)
    }
  }
  // Featured grid fallback: same idea — fill with the global ranked list
  // if the slice has nothing.
  // Fiverr/Upwork-style browsing over the full ranked slice — no extra
  // fetches, the inventory is already in memory. The server clamps what it
  // renders to ?page=N (SSR matches the URL for crawlers); the client
  // FeaturedBriefsGrid then appends pages in place (Load more) or jumps
  // between page windows without a reload.
  // First page (serialized) + ranked total (a number, not the gigs). The client
  // grid appends later windows from the listing API on demand.
  const firstPageCards = slice.featured.length > 0 ? slice.featured : data.slices.all.featured
  const featuredIsFallback = slice.featured.length === 0 && data.slices.all.featured.length > 0
  const totalRanked = featuredIsFallback ? data.slices.all.totalFeatured : slice.totalFeatured
  const categoryCounts = featuredIsFallback ? data.slices.all.categoryCounts : slice.categoryCounts
  const serverVisible = Math.min(deepLinkVisibleCount(page, totalRanked), firstPageCards.length)

  const trustItems: Array<{ label: string }> = []
  if (chipTotal > 0) trustItems.push({ label: `${chipTotal.toLocaleString('en-US')} active briefs` })
  trustItems.push({ label: 'Escrow on every brief — released on approval' })
  trustItems.push({ label: 'Licensed attorneys & regulated consultants only' })

  return (
    <div className="cw-market" style={{ minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SERVICE_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />

      {/* Hero — Fiverr-style media hero. Drop a video at /public/hero-bg.mp4
          and it plays full-bleed behind the dark overlay; until then the
          gradient background carries the same look with zero payload. */}
      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <HeroBackgroundMedia />
          <div className="hero-media-overlay" />
        </div>
        <div className="wrap hero-grid">
          <div>
            <span className="hero-eyebrow">
              <span className={`flagbar ${active !== 'all' ? active : ''}`} aria-hidden="true" />
              {headline.eyebrow}
            </span>

            <h1>{headline.h1}</h1>
            <p className="lede">{headline.lede}</p>

            <form className="hero-search" action="/" method="get">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" placeholder="What do you need help with?" />
              {active !== 'all' && <input type="hidden" name="country" value={active} />}
              <span className="pick">
                Jurisdiction:&nbsp;
                <Suspense
                  fallback={
                    <span>
                      {active === 'all' ? 'All jurisdictions' : COUNTRY_META[active].name}
                    </span>
                  }
                >
                  <CountryPicker active={active} />
                </Suspense>
              </span>
              <button type="submit" className="search-go">Find help</button>
            </form>

            <div className="suggest">
              <span className="lbl">Popular:</span>
              {chips.map((c) => (
                <a key={c.q} href={withCountry(`/?q=${encodeURIComponent(c.q)}`, active)}>{c.label}</a>
              ))}
            </div>
          </div>

          <HeroCaseFileSlideshow
            slides={deduped}
            currency={currency}
            T={T}
            F={F}
          />
        </div>
      </section>

      {/* Trust bar */}
      <div className="trust">
        <div className="wrap trust-inner">
          <span className="label">Trusted by</span>
          {trustItems.map((it) => (
            <span key={it.label} className="item"><span className="dot" /> {it.label}</span>
          ))}
        </div>
      </div>

      <section className="cw-files-band" aria-label="Open the file shop">
        <div className="wrap cw-files-band-inner">
          <div>
            <p className="kicker">36 instant downloads · $7–79 · secure Payhip checkout</p>
            <h2>Preparation packs and practical files, now in one shop</h2>
            <p className="lede">Shop USA and Canada immigration organizers alongside business templates, workbooks, and short guides.</p>
          </div>
          <a className="cw-files-band-cta" href="/shop">Browse all 36 files</a>
        </div>
      </section>

      <section className="cw-files-rail" aria-label="Immigration preparation packs">
        <div className="wrap">
          <div className="cw-files-rail-head">
            <h2>Immigration preparation packs</h2>
            <a href="/shop">See the complete shop →</a>
          </div>
          <ImmigrationPackRail />
        </div>
      </section>

      <section className="cw-files-rail" aria-label="Instant-download file shop">
        <div className="wrap">
          <div className="cw-files-rail-head">
            <h2>Instant downloads — from $7</h2>
            <a href="/shop">See all files →</a>
          </div>
          <FilesRailScroller products={FILE_SHOP_PRODUCTS.filter((p) => p.published).slice(0, 10)} />
        </div>
      </section>

      {/* Featured gigs */}
      {firstPageCards.length > 0 ? (
        <section className="featured" id="featured">
          <div className="wrap">
            <div className="section-head">
              <h2>{featuredIsFallback ? (
                <>Global <em>top briefs.</em></>
              ) : (
                <>This week's <em>recommended {active !== 'all' ? slice.label.split(' ')[0] : ''} briefs.</em></>
              )}</h2>
              <div className="meta">
                <span>{featuredIsFallback ? `No ${slice.label} listings yet · showing global top` : 'Ranked by demand & review score'}</span>
                <span><AllGigsDrawer initialCountry={active} /></span>
              </div>
            </div>

            <div className="filters">
              <a className="on" href={withCountry('/', active)}>All <span className="ct">({chipTotal})</span></a>
              {slice.categories.filter((c) => c.count > 0).slice(0, 5).map((cs) => (
                <a key={cs.cat.id} href={withCountry(`/?category=${cs.cat.id}`, active)}>
                  {cs.cat.name.replace(' Services', '')} <span className="ct">({catCountFor(cs.cat.id, cs.count)})</span>
                </a>
              ))}
              <a href={withCountry('/?delivery_days=3', active)}>· Delivery ≤ 3d</a>
            </div>

            <FeaturedBriefsGrid
              cards={firstPageCards}
              total={totalRanked}
              categoryCounts={categoryCounts}
              initialVisible={serverVisible}
              country={active}
              currency={currency}
            />
          </div>
        </section>
      ) : null}

      {/* Live case briefs moved to the provider-only "Trending Opportunities"
          tab in MarketplaceShell (attorneys + consultants). Students no longer
          see other students' inquiries broadcast on the public landing. */}

      {/* How it works */}
      <section className="how" id="how-it-works">
        <div className="wrap">
          <div className="section-head">
            <h2>A <em>brief, not a billable.</em></h2>
            <div className="meta">
              <span>Fixed fees · Escrowed · Refundable</span>
            </div>
          </div>

          <div className="how-grid">
            <div className="how-step">
              <span className="icon">i</span>
              <span className="step-num">Step 01</span>
              <h3>Tell us the <em>case</em></h3>
              <p>Pick a brief by jurisdiction and topic. Each gig lists exactly what the attorney delivers, the timeline, and the price — no opaque hourly meters.</p>
            </div>
            <div className="how-step">
              <span className="icon">ii</span>
              <span className="step-num">Step 02</span>
              <h3>Funds sit in <em>escrow</em></h3>
              <p>Your payment is held by YouSafe. Attorneys see funds are committed before they begin work; you stay in control until the deliverable lands.</p>
            </div>
            <div className="how-step">
              <span className="icon">iii</span>
              <span className="step-num">Step 03</span>
              <h3>Approve &amp; <em>release</em></h3>
              <p>Review the file, request revisions inside the bundled limit, and release funds. If the work doesn't clear our standards, we refund — no questions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Become a seller */}
      <section className="seller-cta">
        <div className="wrap">
          <div className="seller-card">
            <div>
              <span className="mono-eyebrow">For attorneys &amp; regulated consultants</span>
              <h2>Take on the <em>cases you want.</em> Skip the intake calls.</h2>
              <p>List fixed-fee briefs in your wheelhouse, choose your jurisdictions, and let clients arrive vetted, scoped, and pre-paid. Funds are escrowed before you begin work; payouts release on client approval.</p>
              <div className="actions">
                <a className="btn primary" href={`${PORTAL_URL}/sign-up/attorney`}>Apply as an attorney →</a>
                <a className="btn ghost" href={`${PORTAL_URL}/sign-up/consultant`}>Apply as a consultant →</a>
              </div>
            </div>
            <div className="stats">
              <div className="stat"><b>0%</b><span>Hourly intake calls</span></div>
              <div className="stat"><b>Fixed fees</b><span>Set per brief by the seller</span></div>
              <div className="stat"><b>Escrowed</b><span>Paid out on client approval</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials — always shown near bottom; uses real reviews if any */}
      <section className="quotes">
        <div className="wrap">
          <div className="section-head">
            <h2>Testimonials <em>from buyers.</em></h2>
            <div className="meta">
              <span>From completed briefs across the platform</span>
            </div>
          </div>

          {reviews.length > 0 ? (
            <div className="quotes-grid">
              {reviews.map((r, i) => (
                <div key={i} className="quote">
                  <span className="stars">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <svg key={k} viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ opacity: k < r.rating ? 1 : 0.3 }}>
                        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" />
                      </svg>
                    ))}
                    {r.rating.toFixed(1)}
                  </span>
                  <blockquote>{r.body}</blockquote>
                  <cite>
                    <span className="av">{r.reviewerInitial}</span>
                    <b>{r.reviewerName}</b> · on "{r.gigTitle}"
                  </cite>
                </div>
              ))}
            </div>
          ) : (
            <p className="quotes-empty">
              No published reviews yet — every brief on YouSafe is escrowed and refundable, and reviewer names appear here once a buyer publishes one. Be the first to <a href={withCountry('/', active)} style={{ borderBottom: `1px solid ${T.indigo}`, color: T.indigo }}>commission a brief</a>.
            </p>
          )}
        </div>
      </section>

      <section className="close-strip" aria-label="Payments and protection">
        <div className="wrap close-strip-inner">
          <span>Visa</span>
          <span className="dot" aria-hidden="true" />
          <span>Mastercard</span>
          <span className="dot" aria-hidden="true" />
          <span>Amex</span>
          <span className="dot" aria-hidden="true" />
          <span>PayPal</span>
          <span className="dot" aria-hidden="true" />
          <span>Escrow until you approve</span>
          <span className="dot" aria-hidden="true" />
          <span>Refundable on review</span>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="wrap">
          <h2 className="faq-heading">Questions</h2>
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      <MarketplaceFooter />
      <MarketplaceHomeSeo />
    </div>
  )
}
