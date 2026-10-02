import { getPayhipBatch1Commercial } from '@/lib/payhipBatch1Commercial'
import { getPayhipBatches24Product } from '@/lib/payhipBatches24'

/**
 * MARKET HOME — "Most requested" rail, category tiles and the curated boost list.
 *
 * EDIT HERE to change what the Market first page features. Everything in this
 * file is static data: the landing is build-static (true SSG on the Cloudflare
 * Free plan), so the rail is resolved ONCE at build time from the landing
 * inventory snapshot and never computed per request.
 *
 * - Gig cards name a gig `slug`; the starting price and delivery time come from
 *   that gig's live active tiers at build time (never typed here), and a card
 *   whose gig is not active is dropped instead of linking to a 404.
 * - Pack cards name a File Shop product `slug`; the price comes from the
 *   audited Payhip commercial manifests that the /shop pages already render.
 * - `outcome` is the one-line buyer outcome shown on the card. Keep it to what
 *   the listing actually delivers. No ratings, review counts or order counts.
 */

export type MostRequestedEntry =
  | { kind: 'gig'; slug: string; title: string; outcome: string }
  | { kind: 'pack'; slug: string; title: string; outcome: string }

export const MOST_REQUESTED_ENTRIES: readonly MostRequestedEntry[] = [
  {
    kind: 'gig',
    slug: 'review-i765-opt-application-before-filing',
    title: 'I-765 OPT application review',
    outcome: 'An annotated I-765 and a correction checklist before you file.',
  },
  {
    kind: 'gig',
    slug: 'provide-immigration-expert-lawyer-services',
    title: 'F-1 reinstatement file review',
    outcome: 'Written risks and next steps on your F-1/SEVIS reinstatement file.',
  },
  {
    kind: 'gig',
    slug: 'edit-thesis-admissions-essay-us-university-applications',
    title: 'Admissions essay & SOP editing',
    outcome: 'Tracked line edits and comments on your SOP or admissions essay.',
  },
  {
    kind: 'gig',
    slug: 'proofread-thesis-dissertation-grammar-consistency',
    title: 'Thesis & dissertation proofreading',
    outcome: 'Tracked-change proofreading for grammar, spelling and consistency.',
  },
  {
    kind: 'pack',
    slug: 'us-stem-opt-i765-i983-companion-pack',
    title: 'STEM OPT I-765 + I-983 pack',
    outcome: 'Organize your extension facts, employer details and training plan.',
  },
  {
    kind: 'pack',
    slug: 'us-f1-student-visa-ds160-i20-pack',
    title: 'F-1 DS-160 + I-20 pack',
    outcome: 'Organize DS-160 facts, I-20/SEVIS details and interview prep.',
  },
  {
    kind: 'pack',
    slug: 'us-opt-i765-application-prep-pack',
    title: 'OPT I-765 prep pack',
    outcome: 'Build your OPT filing timeline and supporting-document record.',
  },
  {
    kind: 'pack',
    slug: 'canada-proof-of-funds-sponsor-pack',
    title: 'Canada proof of funds pack',
    outcome: 'Organize your funding plan, sponsor evidence and cost tracking.',
  },
]

/**
 * Gigs pinned to the top of the /gigs hub, in this order. The same gigs carry
 * the DB featured flag (`gigs.featured_until`), which lifts them in the default
 * listing sort and in on-site search (supabase/migrations/20261002091500_…).
 */
export const BOOSTED_GIG_SLUGS: readonly string[] = [
  'review-i765-opt-application-before-filing',
  'provide-immigration-expert-lawyer-services',
  'edit-thesis-admissions-essay-us-university-applications',
  'proofread-thesis-dissertation-grammar-consistency',
  'edit-dissertation-research-paper-us-graduate-school',
]

export interface CategoryTile {
  id: string
  label: string
  blurb: string
  href: string
}

/** Each href is a working filtered view: /gigs?q= (client discovery) or the shop catalog. */
export const MARKET_HOME_CATEGORY_TILES: readonly CategoryTile[] = [
  { id: 'student-visas', label: 'Student visas', blurb: 'F-1 status, reinstatement and visa prep', href: '/gigs?q=F-1' },
  { id: 'work-permits-opt', label: 'Work permits & OPT', blurb: 'I-765 OPT and STEM OPT help', href: '/gigs?q=OPT' },
  { id: 'admissions-editing', label: 'Admissions & academic editing', blurb: 'SOPs, admissions essays, theses', href: '/gigs?q=editing' },
  { id: 'self-serve-packs', label: 'Self-serve packs', blurb: 'Instant-download preparation packs', href: '/shop#catalog' },
]

/* ───────────────────────── Resolution (build time) ───────────────────────── */

export interface MostRequestedGigSource {
  slug: string | null
  provider_type?: string | null
  providerName?: string | null
  /** The gig's cover (gallery_images[0], via resolveCoverUrl) from the build-time inventory. */
  cover_image_url?: string | null
  tiers: Array<{ price: number; delivery_days: number | null }>
}

export interface MostRequestedCard {
  key: string
  kind: 'gig' | 'pack'
  href: string
  kicker: string
  title: string
  outcome: string
  priceLabel: string
  deliveryLabel: string
  rushLabel: string | null
  /**
   * Card image: the gig's own cover, or the pack's audited Payhip cover (the
   * same image the /shop page shows). Null renders the text-only card.
   */
  imageUrl: string | null
}

function usd(amount: number): string {
  const whole = Number.isInteger(amount)
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

function days(n: number): string {
  return n === 1 ? '1-day delivery' : `${n}-day delivery`
}

function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/\S+$/.test(value.trim()) ? value.trim() : null
}

/** Same resolution order as the /shop rail (ImmigrationPackRail): audited Batches 2–4, then Batch 1. */
export function packCoverUrl(slug: string): string | null {
  return httpsUrl(getPayhipBatches24Product(slug)?.imageUrl) ?? httpsUrl(getPayhipBatch1Commercial(slug)?.cover.imageUrl)
}

export function packPriceUsd(slug: string): number | null {
  const commercial = getPayhipBatch1Commercial(slug)
  if (commercial?.priceUsd) return commercial.priceUsd
  const audited = getPayhipBatches24Product(slug)
  return audited?.price ?? null
}

function gigCard(entry: Extract<MostRequestedEntry, { kind: 'gig' }>, gig: MostRequestedGigSource | undefined): MostRequestedCard | null {
  const tiers = (gig?.tiers ?? []).filter((t) => Number(t.price) > 0)
  if (!gig || tiers.length === 0) return null
  const cheapest = [...tiers].sort((a, b) => a.price - b.price)[0]
  const fastest = [...tiers]
    .filter((t) => t.delivery_days != null)
    .sort((a, b) => Number(a.delivery_days) - Number(b.delivery_days))[0]
  const rush =
    fastest && cheapest.delivery_days != null && Number(fastest.delivery_days) < Number(cheapest.delivery_days)
      ? `${fastest.delivery_days}-day rush ${usd(fastest.price / 100)}`
      : null
  const role = gig.provider_type === 'attorney' ? 'Attorney' : 'Specialist'
  return {
    key: `gig:${entry.slug}`,
    kind: 'gig',
    href: `/gigs/${entry.slug}`,
    kicker: gig.providerName ? `${role} · ${gig.providerName}` : role,
    title: entry.title,
    outcome: entry.outcome,
    priceLabel: `From ${usd(cheapest.price / 100)}`,
    deliveryLabel: cheapest.delivery_days != null ? days(Number(cheapest.delivery_days)) : 'Delivery time on listing',
    rushLabel: rush,
    imageUrl: httpsUrl(gig.cover_image_url),
  }
}

function packCard(entry: Extract<MostRequestedEntry, { kind: 'pack' }>): MostRequestedCard | null {
  const price = packPriceUsd(entry.slug)
  if (price == null) return null
  return {
    key: `pack:${entry.slug}`,
    kind: 'pack',
    href: `/shop/${entry.slug}`,
    kicker: 'Self-serve pack',
    title: entry.title,
    outcome: entry.outcome,
    priceLabel: usd(price),
    deliveryLabel: 'Instant download',
    rushLabel: null,
    imageUrl: packCoverUrl(entry.slug),
  }
}

/** Resolve the curated entries against the build-time inventory. Order is preserved. */
export function resolveMostRequestedCards(
  gigs: readonly MostRequestedGigSource[],
  entries: readonly MostRequestedEntry[] = MOST_REQUESTED_ENTRIES,
): MostRequestedCard[] {
  const bySlug = new Map<string, MostRequestedGigSource>()
  for (const g of gigs) if (g.slug) bySlug.set(g.slug, g)
  const cards: MostRequestedCard[] = []
  for (const entry of entries) {
    const card = entry.kind === 'gig' ? gigCard(entry, bySlug.get(entry.slug)) : packCard(entry)
    if (card) cards.push(card)
  }
  return cards
}

/** Delivery-day range across the resolved gig cards (for the trust strip). */
export function gigDeliveryRange(gigs: readonly MostRequestedGigSource[]): { min: number; max: number } | null {
  const wanted = new Set(MOST_REQUESTED_ENTRIES.filter((e) => e.kind === 'gig').map((e) => e.slug))
  const values: number[] = []
  for (const g of gigs) {
    if (!g.slug || !wanted.has(g.slug)) continue
    for (const t of g.tiers) if (t.delivery_days != null && Number(t.price) > 0) values.push(Number(t.delivery_days))
  }
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

/** Stable reorder: boosted slugs first (in BOOSTED_GIG_SLUGS order), then the rest unchanged. */
export function orderWithBoostedFirst<T extends { slug: string | null }>(
  gigs: readonly T[],
  boosted: readonly string[] = BOOSTED_GIG_SLUGS,
): T[] {
  const rank = new Map(boosted.map((slug, i) => [slug, i]))
  const pinned = gigs
    .filter((g) => g.slug != null && rank.has(g.slug))
    .sort((a, b) => (rank.get(a.slug as string) ?? 0) - (rank.get(b.slug as string) ?? 0))
  const rest = gigs.filter((g) => g.slug == null || !rank.has(g.slug))
  return [...pinned, ...rest]
}
