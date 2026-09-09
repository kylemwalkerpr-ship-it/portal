export type YouSafeMarketAuthority = {
  code: 'US' | 'UK' | 'CA' | 'AU'
  name: string
  regionalHost: string
  keywords: RegExp
  scope: string
}

export const YQAA_SUPPORTED_MARKETS: YouSafeMarketAuthority[] = [
  {
    code: 'US',
    name: 'United States',
    regionalHost: 'https://usa.yousafeconsultancy.com',
    keywords: /\b(united states|usa|u\.?s\.?|america|american|f-?1|opt|stem opt|cpt|h-?1b|green card|uscis)\b/i,
    scope: 'US study, education, immigration-document preparation, career, family-document and settlement support; individualized legal advice is handled by an appropriately licensed professional.',
  },
  {
    code: 'UK',
    name: 'United Kingdom',
    regionalHost: 'https://uk.yousafeconsultancy.com',
    keywords: /\b(united kingdom|uk|britain|british|student route|graduate route|skilled worker|ukvi|ilr)\b/i,
    scope: 'UK study, education, immigration-document preparation, career, family-document and settlement support; individualized legal advice is handled by an appropriately licensed professional.',
  },
  {
    code: 'CA',
    name: 'Canada',
    regionalHost: 'https://ca.yousafeconsultancy.com',
    keywords: /\b(canada|canadian|ircc|study permit|pgwp|express entry|pnp|lmia)\b/i,
    scope: 'Canada study, education, immigration-document preparation, career, family-document and settlement support; individualized legal advice is handled by an appropriately licensed professional.',
  },
  {
    code: 'AU',
    name: 'Australia',
    regionalHost: 'https://au.yousafeconsultancy.com',
    keywords: /\b(australia|australian|subclass\s*500|subclass\s*485|temporary graduate|genuine student|home affairs|coe|oshc)\b/i,
    scope: 'Australia study, Subclass 500 and Temporary Graduate (Subclass 485) document preparation, university/program planning, dependant-document and settlement support; individualized Australian immigration/legal advice is handled by an appropriately licensed Australian professional.',
  },
]

export const YQAA_SIBLING_KNOWLEDGE_ESTATE = [
  {
    repository: 'kylemwalkerpr-ship-it/portal',
    publicSurfaces: ['https://portal.yousafeconsultancy.com', 'https://market.yousafeconsultancy.com'],
    knowledge: 'portal/platform mechanics, Marketplace taxonomy, providers, gigs, orders, documents, messaging, wallet/billing, escrow and YQAA core knowledge',
  },
  {
    repository: 'kylemwalkerpr-ship-it/yousafe-consultancy',
    publicSurfaces: [
      'https://yousafeconsultancy.com',
      'https://usa.yousafeconsultancy.com',
      'https://ca.yousafeconsultancy.com',
      'https://uk.yousafeconsultancy.com',
      'https://au.yousafeconsultancy.com',
    ],
    knowledge: 'main-brand and country-specific public service, education, document-preparation and settlement knowledge',
  },
  {
    repository: 'kylemwalkerpr-ship-it/caseworks',
    publicSurfaces: ['https://legal.yousafeconsultancy.com'],
    knowledge: 'legal-panel public articles, intake and jurisdiction-specific legal/procedural context',
  },
  {
    repository: 'kylemwalkerpr-ship-it/support-saas',
    publicSurfaces: ['https://support.yousafeconsultancy.com'],
    knowledge: 'human-support and escalation surface knowledge',
  },
] as const

export function relevantMarketAuthority(query: string): YouSafeMarketAuthority[] {
  const text = String(query || '').trim()
  if (!text) return []
  return YQAA_SUPPORTED_MARKETS.filter((market) => market.keywords.test(text))
}

/**
 * Pinned network facts are injected ahead of live/crawled snippets.
 * They are deliberately small and deterministic: identity/coverage facts must
 * never depend on retrieval ranking across a multi-megabyte crawl snapshot.
 */
export function buildAuthoritativeNetworkContext(query = ''): string {
  const relevant = relevantMarketAuthority(query)
  const marketLines = YQAA_SUPPORTED_MARKETS
    .map((market) => `- ${market.name} (${market.code}): ${market.regionalHost}`)
    .join('\n')

  const parts = [
    '# CANONICAL YOUSAFE NETWORK AUTHORITY — HIGHEST PRIORITY',
    'These facts are maintained by the YouSafe application and override older, incomplete, or contradictory crawl/static snippets.',
    'YouSafe currently supports FOUR country markets: **United States, United Kingdom, Canada, and Australia**.',
    '**Australia is a supported YouSafe destination and jurisdiction. Never state or imply that Australia is outside YouSafe coverage.**',
    '',
    'Canonical regional surfaces:',
    marketLines,
    '',
    'Cross-site roles:',
    '- https://yousafeconsultancy.com — main brand hub.',
    '- https://market.yousafeconsultancy.com — Marketplace discovery and service listings.',
    '- https://portal.yousafeconsultancy.com — authenticated workspace for messages, orders, documents, billing/wallet and escrow.',
    '- https://legal.yousafeconsultancy.com — legal-panel public content and licensed-professional routing.',
    '- https://support.yousafeconsultancy.com — human support and escalation.',
    '',
    'Safety rule: YouSafe/YQAA may provide verified platform information and administrative/document-preparation guidance. Individualized legal or regulated immigration advice must be routed to an appropriately licensed professional for the relevant jurisdiction.',
  ]

  if (relevant.length) {
    parts.push(
      '',
      '# COUNTRY AUTHORITY FOR THIS INQUIRY',
      ...relevant.map((market) => `- **${market.name} (${market.code})** — ${market.scope} Regional site: ${market.regionalHost}`),
    )
  }

  return parts.join('\n')
}
