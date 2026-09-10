import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/marketplace/CategoryRecommendedGigsCarousel.tsx'),
  'utf8',
)
const editorialCss = fs.readFileSync(
  path.join(process.cwd(), 'components/marketplace/CaseworksReadMoreRail.module.css'),
  'utf8',
)

describe('category recommendation diversity and editorial cohesion', () => {
  test('reserves room for sibling and adjacent service families rather than echoing only the selected filter', () => {
    expect(source).toContain('const CATEGORY_AFFINITIES')
    expect(source).toContain('function getRelatedCategoryIds')
    expect(source).toContain('parent.subcategories')
    expect(source).toContain('category.vertical === parent.vertical')
    expect(source).toContain('const exact = await requestGigs([categoryId]')
    expect(source).toContain('let ranked = exact.slice(0, 4)')
    expect(source).toContain("requestGigs(relatedCategoryIds.slice(0, 8), 'trending'")
    expect(source).toContain("education: ['academic-writing', 'immigration', 'credentials', 'mentorship']")
  })

  test('keeps recommendations on clean market-host gig paths', () => {
    expect(source).toContain('href={`/gigs/${gig.slug}`}')
    expect(source).not.toContain('href={`/marketplace/gigs/${gig.slug}`}')
  })

  test('keeps MyCaseworks visually narrower than the broad discovery canvas', () => {
    expect(editorialCss).toContain('max-width: 64rem')
    expect(editorialCss).toContain('min-height: 122px')
    expect(editorialCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  })
})
