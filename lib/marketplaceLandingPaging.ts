/**
 * On-demand inventory paging for the marketplace landing grid.
 *
 * MARKET-ROOT-TRANSFER-LATENCY: the market root used to serialize every active
 * gig (all ~217 records) into the HTML + RSC payload for a section that only
 * ever rendered 48 cards. The first page now comes from the build snapshot and
 * later windows are fetched from the existing public listing endpoint:
 *
 *   GET /api/marketplace/gigs?view=card&sort=trending&country=<jx>&page=N&limit=48
 *
 * `view=card` is a narrow projection of the same route (the exact fields the
 * card renders), `sort=trending` is the same total order the snapshot is ranked
 * with (lib/marketplaceGigSort.ts), and the response envelope is unchanged.
 *
 * Everything here is pure so the mapping/thresholds are unit-tested rather than
 * re-implemented inline in the client component.
 */

import {
  FEATURED_PAGE_SIZE,
  resolveJurisdiction,
  type Country,
  type JxCode,
  type LandingCardGig,
} from '@/lib/marketplaceDisplay'
import { normalizeGallery } from '@/lib/galleryImages'
import { providerDisplayName } from '@/lib/providerDisplayName'

/** Requests the narrow card projection instead of the full listing rows. */
export const LANDING_CARDS_VIEW = 'card'
/** Must match the snapshot's ranking (marketplaceGigSortOrder('trending')). */
export const LANDING_CARDS_SORT = 'trending'

/** Request path for one page of landing cards. */
export function landingCardsPath(country: Country, page: number): string {
  const params = new URLSearchParams({
    view: LANDING_CARDS_VIEW,
    sort: LANDING_CARDS_SORT,
    limit: String(FEATURED_PAGE_SIZE),
    page: String(Math.max(1, Math.trunc(page) || 1)),
  })
  if (country !== 'all') params.set('country', country)
  return `/api/marketplace/gigs?${params.toString()}`
}

export interface LandingCardsPage {
  cards: LandingCardGig[]
  total: number
  hasMore: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * Map one listing record to the card shape.
 *
 * Tolerant on purpose: it accepts the `view=card` projection AND the legacy
 * full-row shape (`provider`, `gallery_images`, `tiers`), so a Worker still
 * serving an older deployment's response cannot blank the appended pages.
 */
export function listingRecordToLandingCard(raw: unknown): LandingCardGig | null {
  const gig = asRecord(raw)
  if (!gig) return null
  const id = typeof gig.id === 'string' ? gig.id : ''
  if (!id) return null

  const provider = asRecord(gig.provider)
  const providerCountry =
    typeof gig.provider_country === 'string'
      ? gig.provider_country
      : typeof provider?.country === 'string'
        ? provider.country
        : null

  const rawJx = typeof gig.jx === 'string' ? gig.jx.toLowerCase() : ''
  const jx: JxCode | null = ['us', 'uk', 'ca', 'au'].includes(rawJx)
    ? (rawJx as JxCode)
    : resolveJurisdiction(typeof gig.jurisdiction === 'string' ? gig.jurisdiction : null) ??
      resolveJurisdiction(providerCountry)

  const explicitProviderName = typeof gig.provider_name === 'string' ? gig.provider_name.trim() : ''
  const tiers = Array.isArray(gig.tiers) ? (gig.tiers as Array<Record<string, unknown>>) : []
  const activeTiers = tiers
    .filter((t) => t && t.is_active !== false && Number(t.price) > 0)
    .map((t) => ({ price: Number(t.price), delivery_days: t.delivery_days == null ? null : Number(t.delivery_days) }))
    .sort((a, b) => a.price - b.price)
  const cheapest = activeTiers[0]
  const startingPrice =
    gig.starting_price != null ? Number(gig.starting_price) : cheapest ? cheapest.price : null
  const deliveryDays =
    gig.delivery_days != null
      ? Number(gig.delivery_days)
      : cheapest
        ? cheapest.delivery_days
        : null

  const cover =
    typeof gig.cover_image_url === 'string' && gig.cover_image_url
      ? gig.cover_image_url
      : normalizeGallery(gig.gallery_images)[0]?.url ?? null

  const headshot =
    typeof gig.provider_headshot_url === 'string' && gig.provider_headshot_url
      ? gig.provider_headshot_url
      : null

  return {
    id,
    slug: typeof gig.slug === 'string' ? gig.slug : null,
    title: typeof gig.title === 'string' ? gig.title : '',
    category: typeof gig.category === 'string' ? gig.category : null,
    provider_type:
      gig.provider_type === 'attorney' || gig.provider_type === 'consultant' ? gig.provider_type : null,
    avg_rating: Number(gig.avg_rating ?? 0) || 0,
    review_count: Number(gig.review_count ?? 0) || 0,
    starting_price: startingPrice != null && Number.isFinite(startingPrice) ? startingPrice : null,
    delivery_days: deliveryDays != null && Number.isFinite(deliveryDays) ? deliveryDays : null,
    providerName: explicitProviderName || providerDisplayName(provider),
    providerHeadshot: headshot,
    jx,
    cover_image_url: cover,
  }
}

/**
 * Read a listing response (either the `{ ok, data }` envelope or the bare
 * payload) into cards + honest totals. `total`/`hasMore` come from the API, so
 * "N more of TOTAL" can never be invented client-side.
 */
export function parseLandingCardsPage(payload: unknown): LandingCardsPage {
  const body = asRecord(payload)
  const data = asRecord(body?.data) ?? body
  const rows = Array.isArray(data?.gigs) ? data!.gigs : []
  const cards: LandingCardGig[] = []
  for (const row of rows) {
    const card = listingRecordToLandingCard(row)
    if (card) cards.push(card)
  }
  const total = Number(data?.total ?? cards.length)
  return {
    cards,
    total: Number.isFinite(total) && total > 0 ? total : cards.length,
    hasMore: data?.hasMore === true,
  }
}

/**
 * Keep only cards not already present (order preserved).
 *
 * The build snapshot and the live listing can drift by a row or two while gigs
 * are published/paused, so every window is de-duplicated by id BEFORE it is
 * rendered — and `applyLandingWindow` runs one window through this helper so a
 * repeated row inside a single response can never render twice.
 */
export function mergeNewLandingCards(
  existing: LandingCardGig[],
  incoming: LandingCardGig[],
): LandingCardGig[] {
  const seen = new Set(existing.map((card) => card.id))
  const merged: LandingCardGig[] = []
  for (const card of incoming) {
    if (!card?.id || seen.has(card.id)) continue
    seen.add(card.id)
    merged.push(card)
  }
  return merged
}

/**
 * The grid's rendered window: exactly ONE page of the ranked slice.
 *
 * TRUE PAGINATION — `cards` is the requested page's own window and is never a
 * prefix of the slice ("page 2 shows cards 49-96", not "the first 96"). The
 * previous cumulative state (`allCards` + `visibleCount`) is gone, so there is
 * no shape left in which earlier pages can leak into a later one.
 */
export interface LandingWindowState {
  /** Clamped page the window belongs to. */
  page: number
  /** That page's cards, in ranked order. */
  cards: LandingCardGig[]
  /** Honest ranked size of the whole slice. */
  total: number
}

/**
 * Apply a navigation to the rendered window.
 *
 * Deliberately a REPLACEMENT reducer: the incoming window becomes the rendered
 * cards wholesale (only de-duplicated inside itself), so no caller can
 * accidentally go back to appending pages. `total` is only replaced by a real
 * positive count — an empty/absent API total keeps the last honest one — and
 * the same total keeps the page pointer clamped to the pages that exist.
 */
export function applyLandingWindow(
  state: LandingWindowState,
  next: { page: number; cards: LandingCardGig[]; total?: number },
): LandingWindowState {
  const total = next.total != null && next.total > 0 ? next.total : state.total
  const totalPages = Math.max(1, Math.ceil(total / FEATURED_PAGE_SIZE))
  const page = Number.isFinite(next.page) ? Math.min(Math.max(1, Math.trunc(next.page)), totalPages) : 1
  return { page, cards: mergeNewLandingCards([], next.cards), total }
}
