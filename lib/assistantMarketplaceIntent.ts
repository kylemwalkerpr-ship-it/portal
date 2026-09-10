import { CATEGORIES } from '@/lib/categories'
import { getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

export type MarketplaceIntentMatch = {
  categoryId: string
  categoryName: string
  subcategoryId: string | null
  subcategoryName: string | null
  url: string
  score: number
  confidence: 'high' | 'medium'
}

const STOP = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'can', 'could', 'for', 'from', 'have',
  'help', 'how', 'into', 'need', 'please', 'that', 'the', 'this', 'with', 'would', 'you', 'your',
])

function tokens(value: string): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token))
}

function phraseScore(query: string, phrase: string, weight: number): number {
  const normalized = phrase.trim().toLowerCase()
  if (!normalized || normalized.length < 3) return 0
  return query.includes(normalized) ? weight : 0
}

/**
 * Deterministically maps a visitor's latest inquiry to the real marketplace
 * taxonomy. The model never invents category URLs; this resolver is the source
 * of truth for assistant conversion links.
 */
export function matchMarketplaceIntent(input: string): MarketplaceIntentMatch | null {
  const query = String(input || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!query) return null
  const queryTokens = new Set(tokens(query))

  let best: MarketplaceIntentMatch | null = null

  for (const category of CATEGORIES) {
    let categoryScore = 0
    categoryScore += phraseScore(query, category.id.replace(/-/g, ' '), 5)
    categoryScore += phraseScore(query, category.name.toLowerCase().replace(/ services?$/i, ''), 5)

    const categoryHaystack = `${category.name} ${category.description} ${category.id}`.toLowerCase()
    for (const token of queryTokens) {
      if (categoryHaystack.includes(token)) categoryScore += token.length > 5 ? 2 : 1
    }

    let localBest: MarketplaceIntentMatch = {
      categoryId: category.id,
      categoryName: category.name,
      subcategoryId: null,
      subcategoryName: null,
      url: getMarketplaceCanonicalUrl(`/categories/${category.id}`),
      score: categoryScore,
      confidence: categoryScore >= 9 ? 'high' : 'medium',
    }

    for (const subcategory of category.subcategories) {
      let score = categoryScore * 0.35
      score += phraseScore(query, subcategory.id.replace(/-/g, ' '), 7)
      score += phraseScore(query, subcategory.name.toLowerCase(), 7)
      for (const keyword of subcategory.keywords || []) {
        score += phraseScore(query, keyword.toLowerCase(), keyword.includes(' ') ? 8 : 5)
      }
      const haystack = `${subcategory.name} ${subcategory.description} ${(subcategory.keywords || []).join(' ')} ${subcategory.id}`.toLowerCase()
      for (const token of queryTokens) {
        if (haystack.includes(token)) score += token.length > 5 ? 2.5 : 1.25
      }
      if (score > localBest.score) {
        localBest = {
          categoryId: category.id,
          categoryName: category.name,
          subcategoryId: subcategory.id,
          subcategoryName: subcategory.name,
          url: getMarketplaceCanonicalUrl(`/categories/${subcategory.id}`),
          score,
          confidence: score >= 10 ? 'high' : 'medium',
        }
      }
    }

    if (!best || localBest.score > best.score) best = localBest
  }

  // Avoid forcing a sales CTA on generic conversation. A match must have a
  // meaningful lexical/phrase signal from the real marketplace taxonomy.
  if (!best || best.score < 5.5) return null
  best.confidence = best.score >= 10 ? 'high' : 'medium'
  return best
}
