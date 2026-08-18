/**
 * Strike-seed routing — the five locked GSC pages from the 2026-08-18 snapshot.
 *
 * These pages already earn impressions at positions ~8–14 with proven click
 * intent. The factory must EXPAND these owners (canonicalUrl set, never a
 * sibling) — never open a new sibling, never write a Pacific-PDF article.
 *
 * Deterministic and pure — no network, no AI. Consumed by the opportunity
 * engine, the war room / auto-run, and the keyword planner.
 */

export type StrikeSeedMode = 'expand' | 'defend'

export interface StrikeSeedTarget {
  /** Public URL path (apex homepage is '/'). */
  path: string
  /** Live canonical URL the factory must expand (legal host or apex). */
  canonicalUrl: string
  host: 'legal' | 'apex'
  repo: 'caseworks' | 'yousafe-consultancy'
  /** Repo-relative file path for the existing owner page. */
  filePath: string
  /** Owner keyword phrases that map to this page (query terms the factory sees). */
  keywords: string[]
  impressions: number
  clicks: number
  position: number
  /** 'expand' for the four guide/lease pages; 'defend' for the apex homepage. */
  mode: StrikeSeedMode
}

/**
 * The five seed pages from the locked 2026-08-18 GSC snapshot (brief §1).
 * Do not invent more seeds; do not change the metrics.
 */
export const GSC_STRIKE_SEEDS_2026_08: readonly StrikeSeedTarget[] = [
  {
    path: '/guide/uk-university-of-bristol-international-student-guide/',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/uk-university-of-bristol-international-student-guide/',
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/guide/uk-university-of-bristol-international-student-guide/page.tsx',
    keywords: [
      'uk university of bristol international student guide',
      'university of bristol international student guide',
    ],
    impressions: 248,
    clicks: 1,
    position: 10.2,
    mode: 'expand',
  },
  {
    path: '/guide/university-of-the-pacific-student-housing/',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/university-of-the-pacific-student-housing/',
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/guide/university-of-the-pacific-student-housing/page.tsx',
    keywords: [
      'university of the pacific student housing',
      'pacific student housing',
    ],
    impressions: 193,
    clicks: 1,
    position: 9.8,
    mode: 'expand',
  },
  {
    path: '/guide/uk-university-of-warwick-international-student-guide/',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/guide/uk-university-of-warwick-international-student-guide/',
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/guide/uk-university-of-warwick-international-student-guide/page.tsx',
    keywords: [
      'uk university of warwick international student guide',
      'university of warwick international student guide',
    ],
    impressions: 189,
    clicks: 1,
    position: 13.8,
    mode: 'expand',
  },
  {
    path: '/us/breaking-a-lease-international-student-us/',
    canonicalUrl: 'https://legal.yousafeconsultancy.com/us/breaking-a-lease-international-student-us/',
    host: 'legal',
    repo: 'caseworks',
    filePath: 'app/us/breaking-a-lease-international-student-us/page.tsx',
    keywords: [
      'breaking a lease international student',
      'breaking a lease as an international student',
    ],
    impressions: 76,
    clicks: 4,
    position: 10.4,
    mode: 'expand',
  },
  {
    path: '/',
    canonicalUrl: 'https://yousafeconsultancy.com/',
    host: 'apex',
    repo: 'yousafe-consultancy',
    filePath: 'landing-page/content/index.md',
    keywords: ['yousafeconsultancy', 'yousafe consultancy'],
    impressions: 134,
    clicks: 4,
    position: 8.2,
    mode: 'defend',
  },
]

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'and', 'or', 'with', 'as',
  'is', 'are', 'us', 'uk', 'by', 'from',
])

function normTerm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function significantTokens(s: string): string[] {
  return normTerm(s)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
}

function normPage(p: string): string {
  if (!p) return ''
  let path = p.trim().toLowerCase()
  try {
    path = new URL(p).pathname
  } catch {
    /* keep raw string */
  }
  return path.replace(/\/+$/, '') || '/'
}

/** True when every significant keyword token appears in the term's tokens. */
function keywordMatches(term: string, keyword: string): boolean {
  const termTokens = new Set(significantTokens(term))
  const kwTokens = significantTokens(keyword)
  if (kwTokens.length < 2) return false
  const shared = kwTokens.filter((t) => termTokens.has(t)).length
  return shared === kwTokens.length
}

/**
 * Match a query term (or its page URL) to one of the five strike seeds.
 * Returns the seed target, or null when the term/page is not a seed owner.
 */
export function matchStrikeSeed(term?: string, page?: string): StrikeSeedTarget | null {
  const t = normTerm(term || '')
  const p = normPage(page || '')

  for (const seed of GSC_STRIKE_SEEDS_2026_08) {
    const seedPath = normPage(seed.path)
    // Page URL match (authoritative — e.g. homepage '/', a guide path).
    if (p && seedPath !== '/' && (p === seedPath || p.endsWith(seedPath) || seedPath.endsWith(p))) {
      return seed
    }
    if (p && seedPath === '/' && p === '/') return seed
    // Keyword match (the query terms the factory actually sees).
    if (!t) continue
    if (seed.keywords.some((k) => normTerm(k) === t || keywordMatches(t, k))) return seed
  }
  return null
}
