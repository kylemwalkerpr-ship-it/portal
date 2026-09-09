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
  if (/^https?:\/\//i.test(t)) return true
  if (/market\.yousafeconsultancy\.com/i.test(t)) return true
  return false
}

/**
 * Rewrite marketplace mentions so the visible text is a person or service
 * name and the URL lives only in the markdown href.
 */
export function rewriteMarketAnchors(content: string): { content: string; changed: number } {
  let next = String(content || '')
  let changed = 0

  next = next.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?market\.yousafeconsultancy\.com\/[^)\s]+)\)/gi,
    (full, label: string, href: string) => {
      const want = labelForMarketUrl(href)
      const parsed = parseMarketUrl(href)
      if (!want || !parsed) return full
      if (!isUrlishLabel(label)) return `[${String(label).trim()}](${parsed.url})`
      changed++
      return `[${want}](${parsed.url})`
    },
  )

  next = next.replace(
    /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})\s*[\u00b7,\u2013-]\s*\((https?:\/\/(?:www\.)?market\.yousafeconsultancy\.com\/(?:marketplace\/)?providers\/[a-z0-9-]+\/?)\)/g,
    (full, name: string, href: string) => {
      const parsed = parseMarketUrl(href)
      if (!parsed) return full
      changed++
      return `[${name.trim()}](${parsed.url})`
    },
  )

  return { content: next, changed }
}
