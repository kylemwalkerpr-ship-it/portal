/**
 * Page-shape families for Content Studio drafts.
 *
 * Blogs are narrative essays. Legal guides, articles, and regional pages keep
 * the YMYL apparatus (In 60 seconds, procedural H2s, FAQ, sources, disclaimer).
 * Marketplace gigs keep their existing shape — this module does not invent one.
 */

export type WritingFamily = 'blog' | 'guide' | 'regional' | 'short' | 'marketplace'

const BLOG_TYPES = new Set([
  'blog',
  'blog_post',
  'blog_summary',
  'news_summary',
])

const GUIDE_TYPES = new Set([
  'legal_guide',
  'legal-guide',
  'article',
])

const REGIONAL_TYPES = new Set([
  'regional',
  'regional_page',
  'regional_from',
  'regional_university',
])

const MARKETPLACE_TYPES = new Set([
  'marketplace_gig',
  'gig',
])

export function writingFamilyFor(contentType: string | null | undefined): WritingFamily {
  const t = String(contentType || '').trim().toLowerCase()
  if (BLOG_TYPES.has(t)) return 'blog'
  if (GUIDE_TYPES.has(t)) return 'guide'
  if (REGIONAL_TYPES.has(t) || t.startsWith('regional_')) return 'regional'
  if (MARKETPLACE_TYPES.has(t)) return 'marketplace'
  if (t === 'short') return 'short'
  return 'guide'
}

export function isBlogFamily(contentType: string | null | undefined): boolean {
  return writingFamilyFor(contentType) === 'blog'
}

/** True when the YMYL kit (In 60 seconds / FAQ / 180-char / ≥4 H2) still applies. */
export function usesGuideApparatus(contentType: string | null | undefined): boolean {
  const family = writingFamilyFor(contentType)
  return family === 'guide' || family === 'regional'
}

/**
 * Prompt bullets for consultancy blogs — one specialist article, not a kit.
 * Callers join these under a SHIP GATES heading.
 */
export function blogShipRequirements(): string[] {
  return [
    'You are a senior specialist writing one article, not an SEO content factory filling a kit.',
    'STRUCTURE: one H1; answer the thesis in the opening 1–2 paragraphs; 3–6 purpose-led H2s that each advance the argument; cite primary sources in-body (not a dump); short educational disclaimer if the topic is YMYL-adjacent; author byline if the brief supplies one.',
    'NOT REQUIRED and MUST NOT be forced: table of contents, "## In 60 seconds", FAQPage JSON-LD, a 4–6 FAQ block, a worked-example H2, a 180-character paragraph cap, ≥2 internal links, or ≥4 H2s.',
    'Do not invent a personal anecdote, testimonial, or hypothetical protagonist. If EXPERIENCE_BEATS are supplied in the brief, use those anonymised beats only.',
    'Paragraph rhythm MAY include a 4–6 sentence developed paragraph. Sections must advance the thesis; do not restate the intro under every H2. Close once.',
    'KEYWORDS: place DEMAND short keywords naturally in prose (meaning coverage). Missing a demand short is a warning on blogs, never a reason to stuff a phrase. Synthesized floor-fill is optional.',
    'SCHEMA: Article JSON-LD is welcome when the template emits it; FAQPage is not required. Do not write raw schema blocks by hand.',
    'VOICE: calm specialist, second person, no AI clichés, ZERO outcome promises, no invented fees, dates, or URLs.',
  ]
}

/**
 * Prompt bullets for legal guides / articles — current YMYL apparatus, minus
 * invented-person worked examples.
 */
export function guideShipRequirements(): string[] {
  return [
    'STRUCTURE: H1 + "## In 60 seconds" TL;DR (3–5 direct bullets) + opening answer ≤40 words + ≥4 H2 sections + FAQ (4–6 Q&A) + ## Sources + short educational disclaimer.',
    'SCHEMA: Article JSON-LD AND FAQPage JSON-LD in <script type="application/ld+json"> blocks.',
    'LINKS: at least 2 internal estate links taken VERBATIM from the INTERNAL LINK ALLOWLIST. ZERO invented, guessed, or modified URLs — a made-up URL is a hard error.',
    'CONCRETE PROCEDURES: use procedural concreteness (forms, documents, sequences, official steps). Do NOT invent a personal anecdote, testimonial, or hypothetical protagonist. If EXPERIENCE_BEATS are supplied in the brief, use those anonymised beats only.',
    'KEYWORDS: DEMAND short keywords appear ≥1× and ≤4× (floor 3 distinct head terms). DEMAND long-tails ≥1× and ≤2× as meaning coverage in prose, never a forced exact 6-word string. Synthesized floor-fill is optional — never stuff it. Missing a demand short is a HARD blocker on guides.',
    'VOICE: human, second person, varied sentence length, no AI clichés, no outcome promises.',
    'ANTI-WALL-OF-TEXT: paragraphs of 1–3 sentences, each under 180 characters, on guides and regional pages.',
  ]
}

/** Regional pages keep In 60 seconds / procedural H2s / FAQ 3–5 / sources / disclaimer. */
export function regionalShipRequirements(): string[] {
  return [
    'STRUCTURE: H1 + "## In 60 seconds" TL;DR (3–5 direct bullets) + opening answer + procedural H2s (who, what to prepare, steps, what changes, next action) + FAQ (3–5 Q&A) + ## Sources + short educational disclaimer.',
    'SCHEMA: Article JSON-LD; FAQPage JSON-LD when the page has an FAQ section.',
    'LINKS: use INTERNAL LINK ALLOWLIST URLs verbatim when linking internally. ZERO invented URLs.',
    'CONCRETE PROCEDURES: forms, documents, sequences, local agencies. Do NOT invent a personal anecdote, testimonial, or hypothetical protagonist. If EXPERIENCE_BEATS are supplied in the brief, use those anonymised beats only.',
    'KEYWORDS: DEMAND short keywords appear ≥1× and ≤4× (floor 3 distinct head terms). Missing a demand short is a HARD blocker on regional pages. Long-tails: meaning coverage in prose. Synthesized floor-fill is optional.',
    'VOICE: informative, practical, second person, no hype, no outcome promises.',
    'ANTI-WALL-OF-TEXT: paragraphs of 1–3 sentences, each under 180 characters.',
  ]
}
