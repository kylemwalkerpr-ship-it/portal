/**
 * SEO utility functions for gig content optimization.
 * Extracted from SEOPreviewPanel for testability and reuse across components.
 */

// Recommended keywords by category (simplified taxonomy-based suggestion engine)
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'study-permit': ['study permit', 'student visa', 'study abroad', 'visa application', 'document review'],
  'visa': ['visa application', 'immigration', 'visa assistance', 'travel visa', 'visa documents'],
  'legal-consultation': ['legal advice', 'legal review', 'lawyer consultation', 'legal documents', 'contract review'],
  'academic': ['university application', 'admission help', 'college essay', 'academic writing', 'application review'],
  'career': ['career coaching', 'resume review', 'job search', 'interview prep', 'professional development'],
  'business': ['business plan', 'company formation', 'business registration', 'corporate documents', 'business advice'],
  'immigration': ['immigration lawyer', 'immigration help', 'visa process', 'residence permit', 'citizenship'],
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
