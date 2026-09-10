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
      categoryPage.indexOf('<CaseworksReadMoreRail categoryId=')
    )
  })

  test('ranks exact-category gigs first and only broadens within the same category family', () => {
    expect(carousel).toContain("requestGigs(categoryId, 'trending'")
    expect(carousel).toContain("requestGigs(fallback, 'best_rated'")
    expect(carousel).toContain("requestGigs(fallback, 'most_orders'")
    expect(carousel).toContain('const fallback = fallbackCategoryId || categoryId')
    expect(carousel).not.toContain("category: 'all'")
  })

  test('uses a compact hero band with image-led belt cards and a focused centre item', () => {
    expect(carousel).toContain('AUTO_ADVANCE_MS')
    expect(carousel).toContain('syncBeltState')
    expect(carousel).toContain('CompactGigCard')
    expect(carousel).toContain('className={styles.heroCopy}')
    expect(carousel).toContain('className={styles.carouselArea}')
    expect(carousel).toContain("--ys-belt-scale")
    expect(carousel).toContain("--ys-belt-rotate")
    expect(carousel).toContain('scrollToIndex')
    expect(carousel).toContain('scrollByCard(direction)')
    expect(carousel).toContain('data-active={index === activeIndex')
    expect(carousel).toContain('Show previous recommended gig')
    expect(carousel).toContain('Show next recommended gig')
    expect(carousel).toContain("prefers-reduced-motion: reduce")

    expect(carouselCss).toContain('width: min(calc(100% - 40px), 1120px)')
    expect(carouselCss).toContain('min-height: 300px')
    expect(carouselCss).toContain('grid-template-columns: minmax(250px, 0.7fr) minmax(0, 1.45fr)')
    expect(carouselCss).toContain('height: 262px')
    expect(carouselCss).toContain('height: 220px')
    expect(carouselCss).toContain('scroll-snap-type: x mandatory')
    expect(carouselCss).toContain('scroll-snap-align: center')
    expect(carouselCss).toContain('perspective: 1150px')
    expect(carouselCss).toContain(".slide[data-active='true']")
    expect(carouselCss).toContain('var(--ys-belt-scale)')
    expect(carouselCss).toContain('background: linear-gradient(180deg')
    expect(carouselCss).toContain('font-family: var(--font-display, Georgia, serif)')
  })
})
