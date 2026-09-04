/**
 * Interlink Registry — canonical link map for the YouSafe ecosystem.
 *
 * Maps topic keywords → internal URLs across:
 *   - legal.yousafeconsultancy.com  (caseworks estate — articles, guides, glossary, country pages)
 *   - yousafeconsultancy.com        (consultancy home)
 *   - portal.yousafeconsultancy.com (marketplace — services, attorneys, gigs)
 *
 * EVERY url below is verified live against the estate (2026-08-13 sweep).
 * Dead legacy hosts (caseworks.com, yousafeconsultancy.com/usa|ca|uk|au) were
 * repointed to their live legal.yousafeconsultancy.com equivalents.
 *
 * Used by the Content Studio to:
 *   1. Inject relevant internal links into AI generation prompts
 *      so the output naturally references the right pages.
 *   2. Power the interlinks panel in the admin dashboard.
 *
 * Add new entries below as the content library grows.
 * Rule of thumb: 2–5 links per generated piece, naturally woven in.
 */

import { filterLiveInternalUrls, normalizeEstateUrl } from './seoFactory/linkAudit'

export interface InterlinkEntry {
  /** Human label shown in the admin panel */
  label: string
  /** Full URL (use https://, not relative) */
  url: string
  /** Which site the link points to */
  site: 'caseworks' | 'regional' | 'marketplace'
  /** What kind of page */
  kind: 'guide' | 'article' | 'landing' | 'service' | 'glossary' | 'comparison' | 'marketplace' | 'template' | 'track'
  /** Keywords that should trigger this link (case-insensitive match on topic + keywords) */
  triggers: string[]
  /** Priority: higher = preferred when multiple links match */
  priority: number
  /** Optional note for the admin */
  note?: string
}

const LINKS: InterlinkEntry[] = [
  // ============================================================
  // MARKETPLACE — primary funnel target (always suggest when relevant)
  // ============================================================
  {
    label: 'YouSafe Marketplace — Browse Services',
    url: 'https://portal.yousafeconsultancy.com/',
    site: 'marketplace',
    kind: 'marketplace',
    triggers: ['services', 'hire', 'lawyer', 'attorney', 'consultation', 'help', 'assistance', 'apply', 'application', 'filing'],
    priority: 10,
    note: 'Primary conversion target — suggest when content mentions services, hiring, or filing',
  },
  {
    label: 'Find an Immigration Attorney',
    url: 'https://portal.yousafeconsultancy.com/attorneys',
    site: 'marketplace',
    kind: 'marketplace',
    triggers: ['attorney', 'lawyer', 'legal help', 'representation', 'legal advice', 'counsel', 'barrister', 'solicitor', 'paralegal'],
    priority: 10,
    note: 'Suggest when content mentions needing legal help',
  },
  {
    label: 'Get a Consultation',
    url: 'https://portal.yousafeconsultancy.com/consultation',
    site: 'marketplace',
    kind: 'marketplace',
    triggers: ['consult', 'consultation', 'review', 'assessment', 'evaluation', 'eligibility check', 'case review'],
    priority: 9,
    note: 'Suggest for any "next steps" or "need help" context',
  },

  // ============================================================
  // CASE WORKS — SEO hub (guides, articles, glossary, country pages)
  // ============================================================

  // --- United States ---
  {
    label: 'US Immigration — Complete Guide',
    url: 'https://legal.yousafeconsultancy.com/us/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['us immigration', 'united states', 'american visa', 'usa', 'uscis', 'green card', 'f-1', 'h-1b', 'opt', 'cpt', 'i-20', 'i-765', 'i-485', 'i-130', 'i-140', 'ds-160', 'n-400', 'naturalization', 'daca', 'tps'],
    priority: 10,
  },
  {
    label: 'F-1 OPT: Application, Timeline & EAD',
    url: 'https://legal.yousafeconsultancy.com/us/student-visas/opt-ead-replacement',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['f-1 opt', 'optional practical training', 'opt timeline', 'opt application', 'stem opt', 'opt extension', 'i-765', 'ead', 'employment authorization', 'sevis', 'dso'],
    priority: 10,
  },
  {
    label: 'H-1B Visa: Lottery, Cap & Transfer',
    url: 'https://legal.yousafeconsultancy.com/us/h1b-lottery-explained-2026',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['h-1b', 'h1b', 'work visa', 'specialty occupation', 'lca', 'i-129', 'h1b cap', 'h1b lottery', 'prevailing wage'],
    priority: 10,
  },
  {
    label: 'Green Card Process (Family & Employment)',
    url: 'https://legal.yousafeconsultancy.com/us/family-green-card',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['green card', 'permanent residence', 'adjustment of status', 'i-485', 'i-130', 'i-140', 'priority date', 'visa bulletin', 'dv lottery'],
    priority: 10,
  },
  {
    label: 'Student Visas — F-1, J-1, M-1 Compared',
    url: 'https://legal.yousafeconsultancy.com/us/student-visas/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['student visa', 'f-1', 'j-1', 'm-1', 'study in the us', 'international student', 'sevp', 'sevis', 'i-20', 'ds-2019'],
    priority: 9,
  },

  // --- Canada ---
  {
    label: 'Canada Immigration — Complete Guide',
    url: 'https://legal.yousafeconsultancy.com/ca/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['canada immigration', 'canadian visa', 'express entry', 'ircc', 'pr card', 'canadian permanent residence', 'ontario', 'british columbia', 'quebec'],
    priority: 10,
  },
  {
    label: 'Study Permit & PGWP — Canada (Checklist)',
    url: 'https://legal.yousafeconsultancy.com/ca/study-permit-document-checklist',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['study permit', 'canada student', 'pgwp', 'post graduation work permit', 'dlis', 'canadian university', 'canada college'],
    priority: 10,
  },
  {
    label: 'Express Entry: CRS & Application Timeline',
    url: 'https://legal.yousafeconsultancy.com/ca/express-entry-crs-calculator',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['express entry', 'crs', 'comprehensive ranking system', 'fswp', 'fstp', 'cec', 'canadian experience class', 'ita', 'invitation to apply'],
    priority: 10,
  },
  {
    label: 'PNP: Provincial Nominee Programs',
    url: 'https://legal.yousafeconsultancy.com/ca/pnp-ontario-bc-alberta',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['pnp', 'provincial nominee', 'ontario immigrant nominee', 'oinp', 'bc pnp', 'ainp', 'saskatchewan', 'manitoba', 'nova scotia'],
    priority: 9,
  },

  // --- United Kingdom ---
  {
    label: 'UK Immigration — Complete Guide',
    url: 'https://legal.yousafeconsultancy.com/uk/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['uk immigration', 'british visa', 'home office', 'ukvi', 'ilr', 'indefinite leave', 'british citizenship', 'uk settlement'],
    priority: 10,
  },
  {
    label: 'Skilled Worker Visa (UK)',
    url: 'https://legal.yousafeconsultancy.com/uk/skilled-worker/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['skilled worker visa', 'tier 2', 'uk work visa', 'certificate of sponsorship', 'cos', 'uk job', 'uk employer', 'nhs visa', 'health and care'],
    priority: 10,
  },
  {
    label: 'UK Spouse Visa: Financial Requirement 2026',
    url: 'https://legal.yousafeconsultancy.com/uk/immigration/uk-spouse-visa-financial-requirement-2026',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['spouse visa', 'partner visa', 'family visa uk', 'minimum income', 'financial requirement', 'adequate maintenance', 'Appendix FM'],
    priority: 10,
  },
  {
    label: 'UK Graduate Route & Student Visas',
    url: 'https://legal.yousafeconsultancy.com/uk/blog/graduate-route-2026-changes',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['graduate route', 'uk student visa', 'tier 4', 'student route', 'cas', 'confirmation of acceptance', 'ucas', 'uk university'],
    priority: 9,
  },

  // --- Australia ---
  {
    label: 'Australia Immigration — Complete Guide',
    url: 'https://legal.yousafeconsultancy.com/au/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['australia immigration', 'australian visa', 'department of home affairs', 'skillselect', 'immiaccount', 'australian pr'],
    priority: 10,
  },
  {
    label: 'Skilled Migration (189/190/491)',
    url: 'https://legal.yousafeconsultancy.com/au/skilled-migration-points-test-189-190',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['skilled migration', 'subclass 189', 'subclass 190', 'subclass 491', 'anzsco', 'skills assessment', 'skillselect', 'eoi', 'expression of interest'],
    priority: 10,
  },
  {
    label: 'Australian Student Visas (Subclass 500)',
    url: 'https://legal.yousafeconsultancy.com/au/student-visa-subclass-500-document-checklist',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['student visa australia', 'subclass 500', 'australian university', 'coe', 'confirmation of enrolment', 'gs requirement', 'genuine student'],
    priority: 9,
  },

  // --- Cross-Country Comparisons ---
  {
    label: 'Compare Immigration: US vs Canada vs UK vs Australia',
    url: 'https://legal.yousafeconsultancy.com/compare/',
    site: 'caseworks',
    kind: 'comparison',
    triggers: ['compare', 'comparison', 'vs', 'versus', 'which country', 'best country', 'difference between', 'move to', 'immigrate to'],
    priority: 9,
  },

  // --- Content Hubs ---
  {
    label: 'Immigration Articles Library',
    url: 'https://legal.yousafeconsultancy.com/articles/',
    site: 'caseworks',
    kind: 'article',
    triggers: ['articles', 'blog', 'reading', 'resources', 'learn more', 'further reading', 'guides', 'in-depth'],
    priority: 7,
  },
  {
    label: 'Immigration Glossary',
    url: 'https://legal.yousafeconsultancy.com/glossary/',
    site: 'caseworks',
    kind: 'glossary',
    triggers: ['glossary', 'definition', 'term', 'terminology', 'abbreviation', 'acronym', 'what does'],
    priority: 7,
  },
  {
    label: 'Immigration Topics Directory',
    url: 'https://legal.yousafeconsultancy.com/topics/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['topics', 'browse', 'all topics', 'categories', 'directory'],
    priority: 6,
  },
  {
    label: 'Immigration Services Overview',
    url: 'https://legal.yousafeconsultancy.com/services/',
    site: 'caseworks',
    kind: 'service',
    triggers: ['services', 'what we do', 'help available', 'service', 'offering', 'solutions'],
    priority: 7,
  },
  {
    label: 'Free Immigration Templates & Checklists',
    url: 'https://legal.yousafeconsultancy.com/templates/',
    site: 'caseworks',
    kind: 'template',
    triggers: ['template', 'checklist', 'form', 'document', 'download', 'sample', 'example'],
    priority: 8,
  },
  {
    label: 'Immigration FAQ',
    url: 'https://legal.yousafeconsultancy.com/faq/',
    site: 'caseworks',
    kind: 'article',
    triggers: ['faq', 'frequently asked', 'common question', 'q&a'],
    priority: 6,
  },
  {
    label: 'Immigration Tracks: Step-by-Step Guides',
    url: 'https://legal.yousafeconsultancy.com/tracks/',
    site: 'caseworks',
    kind: 'track',
    triggers: ['step by step', 'track', 'pathway', 'roadmap', 'timeline', 'process overview'],
    priority: 8,
  },

  // --- Key Topic Pages (generic) ---
  {
    label: 'Immigration Attorneys & Legal Help',
    url: 'https://legal.yousafeconsultancy.com/attorneys/',
    site: 'caseworks',
    kind: 'service',
    triggers: ['attorney', 'lawyer', 'legal', 'counsel', 'representation'],
    priority: 8,
  },
  {
    label: 'Pricing & Plans',
    url: 'https://legal.yousafeconsultancy.com/pricing/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['pricing', 'cost', 'fee', 'price', 'how much', 'affordable', 'budget', 'package'],
    priority: 7,
  },

  // ============================================================
  // REGIONAL LANDING PAGES — yousafeconsultancy.com
  // ============================================================
  {
    label: 'YouSafe Consultancy — Home',
    url: 'https://yousafeconsultancy.com/',
    site: 'regional',
    kind: 'landing',
    triggers: ['yousafe', 'you safe', 'consultancy', 'immigration consultancy', 'immigration services'],
    priority: 6,
  },
  {
    label: 'US Immigration Services',
    url: 'https://legal.yousafeconsultancy.com/services/f1-student-support',
    site: 'caseworks',
    kind: 'service',
    triggers: ['us immigration service', 'usa immigration', 'us immigration help', 'us visa service'],
    priority: 8,
  },
  {
    label: 'Canada Immigration Services',
    url: 'https://legal.yousafeconsultancy.com/services/canada-study-permit-support',
    site: 'caseworks',
    kind: 'service',
    triggers: ['canada immigration service', 'canadian immigration help', 'canada visa service'],
    priority: 8,
  },
  {
    label: 'UK Immigration Services',
    url: 'https://legal.yousafeconsultancy.com/uk/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['uk immigration service', 'british immigration help', 'uk visa service'],
    priority: 8,
  },
  {
    label: 'Australia Immigration Services',
    url: 'https://legal.yousafeconsultancy.com/au/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['australia immigration service', 'australian immigration help', 'australia visa service'],
    priority: 8,
  },
]

// ============================================================
// Matching engine
// ============================================================

export interface InterlinkSuggestion {
  label: string
  url: string
  site: 'caseworks' | 'regional' | 'marketplace'
  kind: string
  priority: number
  matchedOn: string[]
  note?: string
}

interface MatchResult {
  entry: InterlinkEntry
  matchedTriggers: string[]
  score: number
}

/**
 * Match a topic + keyword set against the interlink registry.
 * Returns ranked suggestions, highest priority first.
 */
export function suggestInterlinks(
  topic: string,
  keywords: string[] = [],
  maxResults = 5,
  region?: string | null,
): InterlinkSuggestion[] {
  const combined = [topic, ...keywords]
    .filter(Boolean)
    .map((s) => s.toLowerCase())

  const matches: MatchResult[] = []

  for (const entry of LINKS) {
    const matchedTriggers: string[] = []
    for (const trigger of entry.triggers) {
      const t = trigger.toLowerCase()
      for (const input of combined) {
        if (input.includes(t) || t.includes(input)) {
          if (!matchedTriggers.includes(trigger)) {
            matchedTriggers.push(trigger)
          }
        }
      }
    }
    if (matchedTriggers.length > 0) {
      // Score = priority * (number of matched triggers)
      matches.push({
        entry,
        matchedTriggers,
        score: entry.priority * matchedTriggers.length,
      })
    }
  }

  // Sort by score desc, then priority desc
  matches.sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority)

  const want = String(region || '').toUpperCase().slice(0, 2)
  const ranked = matches.map((m) => ({
    label: m.entry.label,
    url: m.entry.url,
    site: m.entry.site,
    kind: m.entry.kind,
    priority: m.entry.priority,
    matchedOn: m.matchedTriggers,
    note: m.entry.note,
  }))
  if (!want) return ranked.slice(0, maxResults)
  const inRegion = ranked.filter((item) => {
    const hay = `${item.url} ${item.label}`.toLowerCase()
    const found = /\/au\/|au\.yousafe|australia/.test(hay) ? 'AU'
      : /\/ca\/|ca\.yousafe|canada/.test(hay) ? 'CA'
        : /\/uk\/|uk\.yousafe|\buk\b|united kingdom/.test(hay) ? 'UK'
          : /\/us\/|usa\.yousafe|uscis|united states/.test(hay) ? 'US'
            : null
    return !found || found === want
  })
  const offRegion = ranked.filter((item) => !inRegion.includes(item))
  const kept = inRegion.length > 0 ? inRegion : [...inRegion, ...offRegion]
  return kept.slice(0, maxResults)
}

/**
 * Build a prompt-ready interlinks block for the AI system message.
 * The AI is instructed to naturally weave 1–3 of these links into the content.
 */

/**
 * Live-verified suggestions: registry matches are normalized to the live
 * estate base and filtered against the live sitemap + on-demand HEAD checks.
 * Only fully-live URLs ever reach a brief, a prompt, or the admin panel — a
 * dead registry entry is silently dropped instead of shipping a 404 link.
 */
export async function suggestVerifiedInterlinks(
  topic: string,
  keywords: string[] = [],
  maxResults = 5,
  region?: string | null,
): Promise<InterlinkSuggestion[]> {
  const suggestions = suggestInterlinks(topic, keywords, maxResults * 2, region)
  if (suggestions.length === 0) return []
  const liveUrls = await filterLiveInternalUrls(suggestions.map((s) => normalizeEstateUrl(s.url)))
  const live = new Set(liveUrls)
  return suggestions
    .filter((s) => live.has(normalizeEstateUrl(s.url)))
    .slice(0, maxResults)
    .map((s) => ({ ...s, url: normalizeEstateUrl(s.url) }))
}

export function buildInterlinksPrompt(
  topic: string,
  keywords: string[] = [],
  maxLinks = 5,
): string {
  const suggestions = suggestInterlinks(topic, keywords, maxLinks)
  if (suggestions.length === 0) return ''

  const lines = [
    '',
    '=== INTERNAL LINKING GUIDE (SEO: caseworks → regional → marketplace funnel) ===',
    'Naturally weave 1–3 of these internal links into the content body where contextually relevant.',
    'Use descriptive anchor text (never "click here"). Place links in the flow of the article.',
    'Link to at least one marketplace or service page to drive conversions.',
    '',
    'Available internal links (pick the most relevant):',
    ...suggestions.map(
      (s, i) =>
        `${i + 1}. [${s.label}](${s.url}) — ${s.kind} on ${s.site}${s.note ? ` (${s.note})` : ''}`,
    ),
    '',
    'IMPORTANT: Only include links that fit naturally. Do not force irrelevant links.',
    '=== END INTERNAL LINKING GUIDE ===',
    '',
  ]

  return lines.join('\n')
}

export { LINKS }
