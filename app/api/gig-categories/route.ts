import { ok } from '@/lib/apiEnvelope'
import { CATEGORIES, getCategorySourceLabels, getPopularCategories } from '@/lib/categories'

export async function GET() {
  // Return all categories with their subcategories
  const categories = CATEGORIES.map(cat => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    icon: cat.icon,
    vertical: cat.vertical,
    popular: cat.popular,
    sourceLabels: getCategorySourceLabels(cat.id),
    sourceCount: getCategorySourceLabels(cat.id).length,
    subcategories: cat.subcategories.map(sub => ({
      id: sub.id,
      name: sub.name,
      description: sub.description,
      popular: sub.popular,
      sourceLabels: getCategorySourceLabels(sub.id),
      sourceCount: getCategorySourceLabels(sub.id).length,
    })),
  }))

  // Also return a flat list of all subcategories for easy selection
  const allSubcategories = categories.flatMap(cat =>
    cat.subcategories.map(sub => ({
      id: sub.id,
      name: sub.name,
      categoryId: cat.id,
      categoryName: cat.name,
    }))
  )

  // Pure static taxonomy — let browsers/CDN cache it for an hour.
  return ok({
    categories,
    popularCategories: getPopularCategories().map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
    })),
    allSubcategories,
  }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } })
}
