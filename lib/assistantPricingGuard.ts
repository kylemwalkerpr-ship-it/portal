const PRICE_QUERY = /\b(price|pricing|cost|fee|discount|quote|offer|checkout|how much)\b/i
const MONEY = /\b(?:USD|CAD|GBP|AUD|EUR|NZD)\s*\d[\d,]*(?:\.\d{1,2})?\b|[$£€¥]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|CAD|GBP|AUD|EUR|NZD)\b|\b\d+(?:\.\d+)?\s*%/gi
const BARE_PRICE = /\b(?:price|pricing|cost|fee|charge|offer|discount|rate)\b[^.!?\n]{0,24}\b(\d[\d,]*(?:\.\d{1,2})?)\b(?!\d|,\d|\.\d|\s*%)/gi
const normalizeClaim = (claim: string) => claim.replace(/,/g, '').replace(/\s+/g, '').replace(/\b(?:USD|CAD|GBP|AUD|EUR|NZD)\b/gi, '').replace(/[$£€¥]/g, '').toLowerCase()
export type YqaaPricingAuthority = {
  source: 'marketplace-listing' | 'checkout'
  claims: readonly string[]
}

/** Allow price claims only when a trusted server-side listing/checkout supplied the exact claim. */
export function guardYqaaPricingClaims(query: string, reply: string, authority?: YqaaPricingAuthority): { text: string; corrected: boolean } {
  const verifiedClaims = new Set<string>(
    authority && ['marketplace-listing', 'checkout'].includes(authority.source)
      ? authority.claims.map((claim) => normalizeClaim(String(claim)))
      : [],
  )
  const text = String(reply || '')
  const replyClaims: string[] = text.match(MONEY) || []
  const barePriceMatches = [...text.matchAll(BARE_PRICE)].map((match) => match[1])
  const allClaims = [...replyClaims, ...barePriceMatches]
  const hasUngroundedPrice = allClaims.some((claim) => !verifiedClaims.has(normalizeClaim(claim)))
  if (!hasUngroundedPrice) return { text: reply, corrected: false }
  const destination = PRICE_QUERY.test(query) ? 'Check the public Marketplace listing for its current scope and price; the checkout screen shows the final offer and fee breakdown before you pay.' : 'Check the public Marketplace listing for the current scope and price before you rely on any amount.'
  return {
    text: `I can’t verify a current price or custom offer for your specific request here. ${destination} You can also ask the provider to send a custom offer through YouSafe.`,
    corrected: true,
  }
}
