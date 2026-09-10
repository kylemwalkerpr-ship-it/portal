import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const layout = read('app/marketplace/categories/[categoryId]/layout.tsx')
const categoryPage = read('app/marketplace/categories/[categoryId]/page.tsx')
const carousel = read('components/marketplace/CategoryRecommendedGigsCarousel.tsx')
const carouselCss = read('components/marketplace/CategoryRecommendedGigsCarousel.module.css')

describe('category recommendation carousel', () => {
  test('preserves the upper category exploration rail', () => {
    expect(layout).toContain('className={styles.cardRail}')
    expect(layout).toContain('className={styles.serviceCard}')
    expect(layout).toContain('Related ${category.name}')
    expect(layout).not.toContain('CategoryRecommendedGigsCarousel')
  })

  test('replaces only the lower related-services taxonomy block with recommended gigs', () => {
    expect(categoryPage).toContain("import { CategoryRecommendedGigsCarousel }")
    expect(categoryPage).toContain('<CategoryRecommendedGigsCarousel')
    expect(categoryPage).toContain('categoryId={filterId}')
    expect(categoryPage).toContain('fallbackCategoryId={subcategory ? category.id : undefined}')
    expect(categoryPage).not.toContain('siblingSubcategories.map')
    expect(categoryPage).not.toContain('Related ${category.name} services')
    expect(categoryPage.indexOf('<CategoryRecommendedGigsCarousel')).toBeLessThan(
      categoryPage.indexOf('<CaseworksReadMoreRail')
    )
  })

  test('ranks exact-category gigs first and only broadens within the same category family', () => {
    expect(carousel).toContain("requestGigs(categoryId, 'trending'")
    expect(carousel).toContain("requestGigs(fallback, 'best_rated'")
    expect(carousel).toContain("requestGigs(fallback, 'most_orders'")
    expect(carousel).toContain('const fallback = fallbackCategoryId || categoryId')
    expect(carousel).not.toContain("category: 'all'")
  })

  test('behaves as a centered, responsive card slideshow', () => {
    expect(carousel).toContain('AUTO_ADVANCE_MS')
    expect(carousel).toContain('scrollByCard(1)')
    expect(carousel).toContain('Show previous recommended gig')
    expect(carousel).toContain('Show next recommended gig')
    expect(carousel).toContain("prefers-reduced-motion: reduce")
    expect(carouselCss).toContain('scroll-snap-type: x mandatory')
    expect(carouselCss).toContain('flex: 0 0 calc((100% - 54px) / 4)')
    expect(carouselCss).toContain('.centerFew')
    expect(carouselCss).toContain('justify-content: center')
  })
})
