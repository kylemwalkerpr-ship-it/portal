/**
 * Marketplace URLs are citations of people and services, not visible addresses.
 *
 * Reader-facing copy is `[Ann McCoy](https://market…/providers/ann-mccoy)`.
 * The raw URL never appears as anchor text or as a parenthetical.
 */

const MARKET_HOST = 'market.yousafeconsultancy.com'

export type MarketPathKind = 'providers' | 'gigs'

export type ParsedMarketUrl = {
  kind: MarketPathKind
  slug: string
  url: string
}

const MARKET_PATH =
  /^\/(?:marketplace\/)?(providers|gigs)\/([a-z0-9][a-z0-9-]*)\/?$/i

export function parseMarketUrl(raw: string): ParsedMarketUrl | null {
  try {
    const u = new URL(String(raw || '').trim())
    if (u.hostname.replace(/^www\./, '').toLowerCase() !== MARKET_HOST) return null
    const m = u.pathname.match(MARKET_PATH)
    if (!m) return null
    const kind = m[1].toLowerCase() as MarketPathKind
    const slug = m[2].toLowerCase()
    const url = `https://${MARKET_HOST}/${kind}/${slug}`
    return { kind, slug, url }
  } catch {
    return null
  }
}

export function prettyMarketSlug(slug: string): string {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => {
      if (/^mc[a-z]/.test(w) && w.length > 2) {
        return `Mc${w.charAt(2).toUpperCase()}${w.slice(3)}`
      }
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

export function labelForMarketUrl(raw: string): string | null {
  const parsed = parseMarketUrl(raw)
  if (!parsed) return null
  return prettyMarketSlug(parsed.slug)
}

function isUrlishLabel(label: string): boolean {
  const t = String(label || '').trim()
  if (!t) return true
  if (/^https?:\/\//i.test(t) return true
  if (/market\.yousafeconsultancy\.com/i.test(t)) return true
  return false
}
