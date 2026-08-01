/**
 * Interlink Registry — canonical link map for the YouSafe ecosystem.
 *
 * Maps topic keywords → internal URLs across:
 *   - caseworks.com       (SEO hub — articles, guides, glossary, country pages)
 *   - yousafeconsultancy.com  (regional landing pages: /us, /ca, /uk, /au)
 *   - portal.yousafeconsultancy.com  (marketplace — services, attorneys, gigs)
 *
 * Used by the Content Studio to:
 *   1. Inject relevant internal links into AI generation prompts
 *      so the output naturally references the right pages.
 *   2. Power the interlinks panel in the admin dashboard.
 *
 * Add new entries below as the content library grows.
 * Rule of thumb: 2–5 links per generated piece, naturally woven in.
 */

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
    url: 'https://caseworks.com/us/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['us immigration', 'united states', 'american visa', 'usa', 'uscis', 'green card', 'f-1', 'h-1b', 'opt', 'cpt', 'i-20', 'i-765', 'i-485', 'i-130', 'i-140', 'ds-160', 'n-400', 'naturalization', 'daca', 'tps'],
    priority: 10,
  },
  {
    label: 'F-1 OPT: Complete Timeline & Application',
    url: 'https://caseworks.com/us/f1-opt/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['f-1 opt', 'optional practical training', 'opt timeline', 'opt application', 'stem opt', 'opt extension', 'i-765', 'ead', 'employment authorization', 'sevis', 'dso'],
    priority: 10,
  },
  {
    label: 'H-1B Visa: Application, Cap, & Timeline',
    url: 'https://caseworks.com/us/h1b/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['h-1b', 'h1b', 'work visa', 'specialty occupation', 'lca', 'i-129', 'h1b cap', 'h1b lottery', 'prevailing wage'],
    priority: 10,
  },
  {
    label: 'Green Card Process (Family & Employment)',
    url: 'https://caseworks.com/us/green-card/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['green card', 'permanent residence', 'adjustment of status', 'i-485', 'i-130', 'i-140', 'priority date', 'visa bulletin', 'dv lottery'],
    priority: 10,
  },
  {
    label: 'Student Visas — F-1, J-1, M-1 Compared',
    url: 'https://caseworks.com/us/student-visas/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['student visa', 'f-1', 'j-1', 'm-1', 'study in the us', 'international student', 'sevp', 'sevis', 'i-20', 'ds-2019'],
    priority: 9,
  },

  // --- Canada ---
  {
    label: 'Canada Immigration — Complete Guide',
    url: 'https://caseworks.com/ca/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['canada immigration', 'canadian visa', 'express entry', 'ircc', 'pr card', 'canadian permanent residence', 'ontario', 'british columbia', 'quebec'],
    priority: 10,
  },
  {
    label: 'Study Permit & PGWP — Canada',
    url: 'https://caseworks.com/ca/study-permit/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['study permit', 'canada student', 'pgwp', 'post graduation work permit', 'dlis', 'canadian university', 'canada college'],
    priority: 10,
  },
  {
    label: 'Express Entry: CRS & Application Timeline',
    url: 'https://caseworks.com/ca/express-entry/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['express entry', 'crs', 'comprehensive ranking system', 'fswp', 'fstp', 'cec', 'canadian experience class', 'ita', 'invitation to apply'],
    priority: 10,
  },
  {
    label: 'PNP: Provincial Nominee Programs',
    url: 'https://caseworks.com/ca/pnp/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['pnp', 'provincial nominee', 'ontario immigrant nominee', 'oinp', 'bc pnp', 'ainp', 'saskatchewan', 'manitoba', 'nova scotia'],
    priority: 9,
  },

  // --- United Kingdom ---
  {
    label: 'UK Immigration — Complete Guide',
    url: 'https://caseworks.com/uk/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['uk immigration', 'british visa', 'home office', 'ukvi', 'ilr', 'indefinite leave', 'british citizenship', 'uk settlement'],
    priority: 10,
  },
  {
    label: 'Skilled Worker Visa (UK)',
    url: 'https://caseworks.com/uk/skilled-worker/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['skilled worker visa', 'tier 2', 'uk work visa', 'certificate of sponsorship', 'cos', 'uk job', 'uk employer', 'nhs visa', 'health and care'],
    priority: 10,
  },
  {
    label: 'UK Spouse Visa: Financial Requirement 2026',
    url: 'https://caseworks.com/uk/spouse-visa/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['spouse visa', 'partner visa', 'family visa uk', 'minimum income', 'financial requirement', 'adequate maintenance', 'Appendix FM'],
    priority: 10,
  },
  {
    label: 'UK Graduate Route & Student Visas',
    url: 'https://caseworks.com/uk/student-visas/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['graduate route', 'uk student visa', 'tier 4', 'student route', 'cas', 'confirmation of acceptance', 'ucas', 'uk university'],
    priority: 9,
  },

  // --- Australia ---
  {
    label: 'Australia Immigration — Complete Guide',
    url: 'https://caseworks.com/au/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['australia immigration', 'australian visa', 'department of home affairs', 'skillselect', 'immiaccount', 'australian pr'],
    priority: 10,
  },
  {
    label: 'Skilled Migration (189/190/491)',
    url: 'https://caseworks.com/au/skilled-migration/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['skilled migration', 'subclass 189', 'subclass 190', 'subclass 491', 'anzsco', 'skills assessment', 'skillselect', 'eoi', 'expression of interest'],
    priority: 10,
  },
  {
    label: 'Australian Student Visas (Subclass 500)',
    url: 'https://caseworks.com/au/student-visas/',
    site: 'caseworks',
    kind: 'guide',
    triggers: ['student visa australia', 'subclass 500', 'australian university', 'coe', 'confirmation of enrolment', 'gs requirement', 'genuine student'],
    priority: 9,
  },

  // --- Cross-Country Comparisons ---
  {
    label: 'Compare Immigration: US vs Canada vs UK vs Australia',
    url: 'https://caseworks.com/compare/',
    site: 'caseworks',
    kind: 'comparison',
    triggers: ['compare', 'comparison', 'vs', 'versus', 'which country', 'best country', 'difference between', 'move to', 'immigrate to'],
    priority: 9,
  },

  // --- Content Hubs ---
  {
    label: 'Immigration Articles Library',
    url: 'https://caseworks.com/articles/',
    site: 'caseworks',
    kind: 'article',
    triggers: ['articles', 'blog', 'reading', 'resources', 'learn more', 'further reading', 'guides', 'in-depth'],
    priority: 7,
  },
  {
    label: 'Immigration Glossary',
    url: 'https://caseworks.com/glossary/',
    site: 'caseworks',
    kind: 'glossary',
    triggers: ['glossary', 'definition', 'term', 'terminology', 'abbreviation', 'acronym', 'what does'],
    priority: 7,
  },
  {
    label: 'Immigration Topics Directory',
    url: 'https://caseworks.com/topics/',
    site: 'caseworks',
    kind: 'landing',
    triggers: ['topics', 'browse', 'all topics', 'categories', 'directory'],
    priority: 6,
  },
  {
    label: 'Immigration Services Overview',
    url: 'https://caseworks.com/services/',
    site: 'caseworks',
    kind: 'service',
    triggers: ['services', 'what we do', 'help available', 'service', 'offering', 'solutions'],
    priority: 7,
  },
  {
    label: 'Free Immigration Templates & Checklists',
    url: 'https://caseworks.com/templates/',
    site: 'caseworks',
    kind: 'template',
    triggers: ['template', 'checklist', 'form', 'document', 'download', 'sample', 'example'],
    priority: 8,
  },
  {
    label: 'Immigration FAQ',
    url: 'https://caseworks.com/faq/',
    site: 'caseworks',
    kind: 'article',
    triggers: ['faq', 'frequently asked', 'common question', 'q&a'],
    priority: 6,
  },
  {
    label: 'Immigration Tracks: Step-by-Step Guides',
    url: 'https://caseworks.com/tracks/',
    site: 'caseworks',
    kind: 'track',
    triggers: ['step by step', 'track', 'pathway', 'roadmap', 'timeline', 'process overview'],
    priority: 8,
  },

  // --- Key Topic Pages (generic) ---
  {
    label: 'Immigration Attorneys & Legal Help',
    url: 'https://caseworks.com/attorneys/',
    site: 'caseworks',
    kind: 'service',
    triggers: ['attorney', 'lawyer', 'legal', 'counsel', 'representation'],
    priority: 8,
  },
  {
    label: 'Pricing & Plans',
    url: 'https://caseworks.com/pricing/',
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
    url: 'https://yousafeconsultancy.com/usa',
    site: 'regional',
    kind: 'landing',
    triggers: ['us immigration service', 'usa immigration', 'us immigration help', 'us visa service'],
    priority: 8,
  },
  {
    label: 'Canada Immigration Services',
    url: 'https://yousafeconsultancy.com/ca',
    site: 'regional',
    kind: 'landing',
    triggers: ['canada immigration service', 'canadian immigration help', 'canada visa service'],
    priority: 8,
  },
  {
    label: 'UK Immigration Services',
    url: 'https://yousafeconsultancy.com/uk',
    site: 'regional',
    kind: 'landing',
    triggers: ['uk immigration service', 'british immigration help', 'uk visa service'],
    priority: 8,
  },
  {
    label: 'Australia Immigration Services',
    url: 'https://yousafeconsultancy.com/au',
    site: 'regional',
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

  return matches.slice(0, maxResults).map((m) => ({
    label: m.entry.label,
    url: m.entry.url,
    site: m.entry.site,
    kind: m.entry.kind,
    priority: m.entry.priority,
    matchedOn: m.matchedTriggers,
    note: m.entry.note,
  }))
}

/**
 * Build a prompt-ready interlinks block for the AI system message.
 * The AI is instructed to naturally weave 1–3 of these links into the content.
 */
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
