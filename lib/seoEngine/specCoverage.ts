/**
 * Honest coverage of the Claude/ChatGPT 700+ (838) variable taxonomy
 * versus the live Master Engine registry.
 *
 * Harden rule: never treat a dark slot as 0. The composite only averages
 * observed signals (see masterEngine.bundle). This file names the gaps so
 * the engine can ingest hundreds of *real* inputs without pretending the
 * unused 600 are already in the score.
 */

import { SIGNAL_REGISTRY } from '@/lib/seoFactory/masterEngine'

export const SPEC_POINT_COUNT = 838

export type SpecGroupId =
  | 'content'
  | 'technical'
  | 'architecture'
  | 'offpage'
  | 'engagement'
  | 'cwv'
  | 'mobile'
  | 'semantic'
  | 'eeat'
  | 'local'
  | 'schema'
  | 'media'
  | 'security'
  | 'freshness'
  | 'serp'
  | 'brand'
  | 'behavioral'
  | 'international'

export interface SpecGroup {
  id: SpecGroupId
  spec: string
  range: string
  specCount: number
  /** Highest-leverage spec items we do NOT yet compute (not just dark slots). */
  missingHighLeverage: string[]
}

/**
 * Spec groups → what we actually compute today vs what still needs a
 * data source. Counts are the spec's published ranges (some numbering
 * overlaps at the seams; the source file totals 838 unique points).
 */
export const SPEC_GROUPS: SpecGroup[] = [
  {
    id: 'content', spec: 'A. Content & on-page', range: '1–100', specCount: 100,
    missingHighLeverage: [
      'TF-IDF vs live top-10 SERP (we use a draft-only proxy)',
      'Title pixel-width / SERP truncation',
      'External duplicate / plagiarism scan',
      'Content-to-code ratio on the live DOM',
      'Keyword stuffing as a sitewide graph (we catch per-draft only)',
    ],
  },
  {
    id: 'technical', spec: 'B. Technical SEO & crawlability', range: '101–190', specCount: 90,
    missingHighLeverage: [
      'Log-file crawl frequency / budget waste',
      'Redirect chain + loop length',
      'HTTP/2–3, TTFB, CDN, compression (server ops)',
      'Index bloat / low-value indexed URLs',
      'Site-migration redirect integrity',
    ],
  },
  {
    id: 'architecture', spec: 'C. Site architecture & internal linking', range: '191–240', specCount: 50,
    missingHighLeverage: [
      'PageRank-style internal equity flow',
      'Anchor-text exact-match ratio sitewide',
      'Internal-link CTR from analytics',
      'Clicks-to-conversion path length',
      'Hub-and-spoke integrity beyond the ontology map',
    ],
  },
  {
    id: 'offpage', spec: 'D. Off-page & backlinks', range: '241–330', specCount: 90,
    missingHighLeverage: [
      'Referring-domain topical relevance',
      'Link velocity anomaly / negative-SEO pattern',
      'Lost-link rate + broken-backlink recovery',
      '.edu/.gov inbound (we score outbound citations, not inbound)',
      'Unlinked brand-mention → link conversion',
    ],
  },
  {
    id: 'engagement', spec: 'E. UX & engagement', range: '331–390', specCount: 60,
    missingHighLeverage: [
      'Dwell time / pogo-stick (needs analytics or GSC+)',
      'Scroll depth, rage-click, form abandonment',
      'Engaged-session ratio (GA4)',
      'Direct-traffic share as brand proxy',
    ],
  },
  {
    id: 'cwv', spec: 'F. Page experience & CWV depth', range: '391–430', specCount: 40,
    missingHighLeverage: [
      'CrUX field LCP/INP/CLS (slot exists, no feed)',
      'Long-task count / main-thread breakdown',
      'bfcache eligibility (slot exists, no feed)',
      'RUM coverage + geo latency',
    ],
  },
  {
    id: 'mobile', spec: 'G. Mobile', range: '431–460', specCount: 30,
    missingHighLeverage: [
      'GSC mobile-usability errors (slot exists, no feed)',
      'Tap-target overlap, horizontal scroll',
      'Mobile vs desktop conversion parity',
    ],
  },
  {
    id: 'semantic', spec: 'H. Semantic / NLP / entity', range: '461–530', specCount: 70,
    missingHighLeverage: [
      'Embedding similarity to ranking pages (slot exists)',
      'Passage-level relevance (slot exists)',
      'Wikidata / knowledge-graph link (slot exists)',
      'Query fan-out coverage vs live PAA',
    ],
  },
  {
    id: 'eeat', spec: 'I. E-E-A-T & trust', range: '531–575', specCount: 45,
    missingHighLeverage: [
      'Independent reputation / reviews',
      'Reviewer identity that is not just a disclosure string',
      'Author topical history across the estate',
    ],
  },
  {
    id: 'local', spec: 'J. Local SEO', range: '576–620', specCount: 45,
    missingHighLeverage: [
      'NAP consistency (slot exists)',
      'GBP completeness (slot exists)',
      'Local pack presence — low priority for this YMYL corpus',
    ],
  },
  {
    id: 'schema', spec: 'K. Structured data', range: '621–655', specCount: 35,
    missingHighLeverage: [
      'Rich-result impression data from GSC',
      'HowTo / VideoObject (slots exist, rarely used)',
    ],
  },
  {
    id: 'media', spec: 'L. Media', range: '656–690', specCount: 35,
    missingHighLeverage: [
      'Image sitemap + srcset (slots exist)',
      'Video transcript / watch time',
    ],
  },
  {
    id: 'security', spec: 'M. Security & compliance', range: '691–715', specCount: 25,
    missingHighLeverage: [
      'CSP / HSTS / X-Frame headers (slot exists)',
      'Malware / Safe Browsing status',
      'SPF/DKIM/DMARC',
    ],
  },
  {
    id: 'freshness', spec: 'N. Freshness & history', range: '716–745', specCount: 30,
    missingHighLeverage: [
      'Time-to-index / time-to-top-10 (slots exist)',
      'Algorithm-update impact history',
      'Content-decay early warning from GSC trend',
    ],
  },
  {
    id: 'serp', spec: 'O. SERP features & competitive', range: '741–775', specCount: 35,
    missingHighLeverage: [
      'Featured snippet / PAA / AI Overview ownership (slots exist)',
      'Competitor publish velocity',
      'SERP volatility index',
    ],
  },
  {
    id: 'brand', spec: 'P. Brand & social', range: '772–795', specCount: 24,
    missingHighLeverage: [
      'Branded search volume (slot exists)',
      'Unlinked mention volume',
      'Share-of-search vs Boundless / competitors',
    ],
  },
  {
    id: 'behavioral', spec: 'Q. Behavioral & algorithmic', range: '795–825', specCount: 31,
    missingHighLeverage: [
      'Rank-position as the dependent variable for weight learning',
      'Query-deserves-freshness classification',
    ],
  },
  {
    id: 'international', spec: 'R. International / multi-market', range: '818–845', specCount: 28,
    missingHighLeverage: [
      'Hreflang reciprocity (slot exists — high leverage for US/UK/CA/AU)',
      'Localized content depth per country host',
    ],
  },
]

export function reportSpecCoverage(): {
  specPoints: number
  registered: number
  computedCapable: number
  darkSlots: number
  groups: Array<SpecGroup & { registered: number; computedCapable: number; darkSlots: number }>
  hardenOrder: string[]
} {
  const registered = SIGNAL_REGISTRY.length
  const computedCapable = SIGNAL_REGISTRY.filter((s) => s.computed).length
  const darkSlots = registered - computedCapable
  return {
    specPoints: SPEC_POINT_COUNT,
    registered,
    computedCapable,
    darkSlots,
    groups: SPEC_GROUPS.map((g) => ({ ...g, registered: 0, computedCapable: 0, darkSlots: 0 })),
    hardenOrder: [
      '1. Keep scoring only observed values (null ≠ 0) — already in scoreMaster.',
      '2. Wire the dark slots we already registered, in this order: GSC history (CTR/dwell proxies, lost queries), CrUX CWV, backlink graph (velocity, lost links, topical RD), hreflang, featured-snippet/PAA/AIO.',
      '3. Do not add the remaining ~600 spec rows until a feed exists. Empty rows dilute nothing today, but they create false coverage if flipped to 0.',
      '4. Learn family weights from shipped rank outcomes (seo_ranking_scores + GSC position) — rankingModel already has a bounded calibration loop.',
      '5. Competitive delta stays the decision layer: invest where Page − SERP_top10 is most negative and lift is cheapest.',
    ],
  }
}
