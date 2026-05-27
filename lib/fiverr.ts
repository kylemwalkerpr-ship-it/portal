import { getPlatformSettings } from './platformConfig'

export const DEFAULT_MIN_CENTS = 100
export const DEFAULT_MAX_CENTS = 500000

export function toCents(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const raw = String(value ?? '').trim()
  if (!raw) return NaN
  const n = Number(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return NaN
  return raw.includes('.') ? Math.round(n * 100) : Math.trunc(n)
}

export function centsToDollars(cents: unknown) {
  return Math.round(Number(cents || 0)) / 100
}

export async function getPaymentSettingsForApi() {
  const settings = await getPlatformSettings()
  const raw = settings as Record<string, unknown>
  const platformFeePercent = Number(raw.platform_fee_percent ?? 20)
  const attorneyPlatformFeePercent = Number(raw.attorney_platform_fee_percent ?? 25)
  const consultantFeePercent = Number(raw.consultant_fee_percent ?? 80)
  const minimumOfferAmount = Number(raw.minimum_offer_amount_cents ?? raw.minimum_offer_amount ?? DEFAULT_MIN_CENTS)
  const maximumOfferAmount = Number(raw.maximum_offer_amount_cents ?? raw.maximum_offer_amount ?? DEFAULT_MAX_CENTS)
  const minimumGigPrice = Number(raw.minimum_gig_price_cents ?? minimumOfferAmount)
  const maximumGigPrice = Number(raw.maximum_gig_price_cents ?? maximumOfferAmount)
  const primaryCurrency = String(raw.primary_currency || 'usd').toLowerCase()
  const allowedCurrencies = Array.isArray(raw.allowed_currencies) ? raw.allowed_currencies : [primaryCurrency]

  return {
    ...settings,
    platform_fee_percent: Number.isFinite(platformFeePercent) ? platformFeePercent : 20,
    attorney_platform_fee_percent: Number.isFinite(attorneyPlatformFeePercent) ? attorneyPlatformFeePercent : 25,
    consultant_fee_percent: Number.isFinite(consultantFeePercent) ? consultantFeePercent : 80,
    minimum_offer_amount_cents: Number.isFinite(minimumOfferAmount) ? minimumOfferAmount : DEFAULT_MIN_CENTS,
    maximum_offer_amount_cents: Number.isFinite(maximumOfferAmount) ? maximumOfferAmount : DEFAULT_MAX_CENTS,
    minimum_gig_price_cents: Number.isFinite(minimumGigPrice) ? minimumGigPrice : DEFAULT_MIN_CENTS,
    maximum_gig_price_cents: Number.isFinite(maximumGigPrice) ? maximumGigPrice : DEFAULT_MAX_CENTS,
    primary_currency: primaryCurrency,
    allowed_currencies: allowedCurrencies.map(String).map(s => s.toLowerCase()),
  }
}

export function providerFeePercent(senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  return senderType === 'attorney'
    ? Number(settings.attorney_platform_fee_percent ?? 25)
    : Number(settings.platform_fee_percent ?? 20)
}

export function computePlatformFeeCents(amountCents: number, senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  return Math.round(amountCents * (providerFeePercent(senderType, settings) / 100))
}

export function computeNetPayoutCents(amountCents: number, senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  if (senderType === 'attorney') return amountCents
  return amountCents - computePlatformFeeCents(amountCents, senderType, settings)
}

export function normalizeRevision(value: unknown) {
  if (String(value).toLowerCase() === 'unlimited') return 999
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}

/**
 * Slugify a gig title for use as the URL path. SEO-tuned:
 *  - normalises unicode (é → e, ñ → n) so multilingual titles produce ASCII slugs
 *  - strips ' " ’ apostrophes and quotes WITHOUT inserting a dash
 *  - drops English stop-words (a, the, an, of, for, to, in, on, &) that dilute
 *    keyword density without changing meaning — long-form titles still keep
 *    the meaningful words
 *  - collapses to single dashes, trims edge dashes
 *  - caps at 70 chars (under the 75-char practical URL limit Google still
 *    indexes cleanly), trimmed to the previous word boundary so we don't
 *    cut a word in half
 *  - falls back to a UUID only if the resulting slug is empty
 *
 * Uniqueness is handled by the caller — gig creation appends a short hash
 * suffix, profile usernames are checked unique at write time.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'by', 'with', 'is', 'are', 'be', 'was', 'were',
])

export function buildSlug(input: string): string {
  const normalised = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’"]/g, '')

  const tokens = normalised
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))

  let slug = tokens.join('-')
  if (slug.length > 70) {
    // Trim to a word boundary instead of mid-word.
    const trimmed = slug.slice(0, 70)
    const cut = trimmed.lastIndexOf('-')
    slug = cut > 30 ? trimmed.slice(0, cut) : trimmed
  }
  slug = slug.replace(/^-+|-+$/g, '')
  return slug || crypto.randomUUID()
}

// First writer gets the clean slug; collisions get -2, -3, …
// Hex fallback only kicks in after 999 numeric collisions (effectively never).
export async function buildUniqueSlug(
  db: { from: (table: string) => any },
  title: string,
): Promise<string> {
  const base = buildSlug(title)
  const { data } = await db
    .from('gigs')
    .select('slug')
    .like('slug', `${base}%`)

  const taken = new Set<string>((data ?? []).map((r: { slug: string }) => r.slug))
  if (!taken.has(base)) return base

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`
}
