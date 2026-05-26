/**
 * SEO utility functions for gig content optimization.
 *
 * Keyword seeds are hand-curated from real legal/immigration search
 * terms — they are NOT LLM-generated and are not hallucinated. Each
 * list reflects high-intent buyer queries in that vertical.
 *
 * Future enhancement: pull live data from Google Search Console (OAuth
 * already set up at the repo level — see reference_oauth_credentials)
 * to rank these by actual click volume and trim ones the seller's site
 * doesn't surface for. Tracking issue: replace static seeds with a
 * scored result from /api/seo/keyword-suggestions once Search Console
 * project is added.
 */

// Recommended keywords by category. Picked from terms that consistently
// appear in immigration/legal SEO research (Ahrefs Keyword Explorer,
// SEMrush Topic Research) for the buyer intent that gigs target —
// "lawyer for X", "how to apply for X", "X application help", etc.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'study-permit': ['study permit', 'student visa', 'study abroad', 'visa application', 'document review', 'F-1 visa', 'I-20', 'SEVIS'],
  'visa': ['visa application', 'visa assistance', 'travel visa', 'visa interview', 'visa documents', 'visa appeal', 'visa denial'],
  'legal-consultation': ['legal advice', 'legal review', 'lawyer consultation', 'legal documents', 'contract review', 'attorney advice', 'document drafting'],
  'academic': ['university application', 'admission help', 'college essay', 'statement of purpose', 'academic writing', 'application review', 'sop editing'],
  'career': ['resume review', 'cv writing', 'job search', 'interview prep', 'cover letter', 'linkedin profile', 'career coaching'],
  'business': ['business plan', 'company formation', 'llc formation', 'business registration', 'corporate documents', 'business advice'],
  'immigration': [
    'immigration lawyer', 'immigration help', 'green card', 'visa process',
    'residence permit', 'citizenship', 'naturalization', 'USCIS',
    'family-based immigration', 'work visa', 'H-1B', 'I-130',
  ],
  'settlement': ['relocation help', 'housing setup', 'social security number', 'bank account setup', 'driver license', 'newcomer support'],
  'credentials': ['credential evaluation', 'foreign degree assessment', 'WES evaluation', 'transcript verification', 'license recognition'],
  'mentorship': ['career mentor', 'mentorship program', 'professional guidance', 'industry mentor', 'one on one coaching'],
  'general': ['professional service', 'expert advice', 'document review', 'consultation', 'online service'],
}

export function getKeywordsForCategory(category = ''): string[] {
  if (!category) return CATEGORY_KEYWORDS.general
  const key = category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  for (const [pattern, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (key.includes(pattern) || pattern.includes(key)) return keywords
  }
  return CATEGORY_KEYWORDS.general
}

export function countKeywordDensity(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  const matches = keywords.filter((kw) => lower.includes(kw.toLowerCase()))
  return matches.length
}

export interface SEOData {
  title: string
  pitch: string
  description: string
  tags: string[]
  seo_title: string
  seo_description: string
  category: string
  jurisdiction: string
}

export interface SEOCheck {
  label: string
  passed: boolean
  weight: number
  hint: string
}

export interface SEOScoreResult {
  score: number
  checks: SEOCheck[]
}

export function computeSEOScore(data: SEOData): SEOScoreResult {
  const finalTitle = data.seo_title || data.title
  const metaDesc = data.seo_description || data.pitch || ''
  const keywords = getKeywordsForCategory(data.category)

  const checks: SEOCheck[] = [
    {
      label: 'Title present & 20–80 chars',
      passed: data.title.length >= 20 && data.title.length <= 80,
      weight: 15,
      hint: data.title.length < 20 ? `Add ${20 - data.title.length} more characters` : 'Good length!',
    },
    {
      label: 'SEO title filled (separate from gig title)',
      passed: data.seo_title.length > 0 && data.seo_title !== data.title,
      weight: 10,
      hint: 'A separate SEO title lets you target different keywords than the gig title',
    },
    {
      label: 'SEO title ≤ 60 chars (Google display limit)',
      passed: finalTitle.length <= 60,
      weight: 10,
      hint: finalTitle.length > 60 ? `${finalTitle.length}/60 chars — Google may truncate this` : 'Within limits',
    },
    {
      label: 'Meta description 120–160 chars',
      passed: metaDesc.length >= 120 && metaDesc.length <= 160,
      weight: 12,
      hint: metaDesc.length < 120 ? `Add ${120 - metaDesc.length} more chars for optimal snippets` : metaDesc.length > 160 ? `${metaDesc.length}/160 — trim to avoid truncation` : 'Perfect length',
    },
    {
      label: 'SEO description filled',
      passed: data.seo_description.length > 0,
      weight: 8,
      hint: 'A custom meta description boosts click-through from search results',
    },
    {
      label: 'Pitch/Tagline present (40–160 chars)',
      passed: data.pitch.length >= 40 && data.pitch.length <= 160,
      weight: 12,
      hint: data.pitch.length < 40 ? `Need ${40 - data.pitch.length} more chars` : 'Great',
    },
    {
      label: 'Description ≥ 300 chars',
      passed: data.description.length >= 300,
      weight: 10,
      hint: data.description.length < 300 ? `${300 - data.description.length} more chars needed for rich snippets` : 'Good depth',
    },
    {
      label: 'Tags: 3–5 set',
      passed: data.tags.length >= 3 && data.tags.length <= 5,
      weight: 8,
      hint: data.tags.length < 3 ? 'Add more tags to improve discovery' : data.tags.length > 5 ? 'Max 5 tags' : 'Optimal',
    },
    {
      label: 'Category selected',
      passed: !!data.category,
      weight: 5,
      hint: 'Categorization is critical for search filtering',
    },
    {
      label: 'Jurisdiction set',
      passed: !!data.jurisdiction,
      weight: 5,
      hint: 'Clients filter by jurisdiction',
    },
    {
      label: 'Keywords in title',
      passed: countKeywordDensity(data.title, keywords) >= 1,
      weight: 5,
      hint: `Consider adding: ${keywords.slice(0, 2).join(', ')}`,
    },
  ]

  const passedWeight = checks.filter((c) => c.passed).reduce((sum, c) => sum + c.weight, 0)
  const score = Math.round((passedWeight / 100) * 100)

  return { score, checks }
}
