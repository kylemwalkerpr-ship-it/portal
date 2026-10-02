import fs from 'fs'
import path from 'path'
import { getGigGuideLinks, GIG_GUIDE_SLUGS } from '@/lib/gigGuideLinks'

// Only gigs with a consenting provider who actually delivers may get pushed traffic.
const DELIVERABLE_GIGS = new Set([
  'review-i765-opt-application-before-filing',
  'provide-immigration-expert-lawyer-services',
  'edit-thesis-admissions-essay-us-university-applications',
  'edit-dissertation-research-paper-us-graduate-school',
  'proofread-thesis-dissertation-grammar-consistency',
])

describe('gig guide links', () => {
  it('only lists confirmed-delivery gigs', () => {
    for (const slug of GIG_GUIDE_SLUGS) expect(DELIVERABLE_GIGS.has(slug)).toBe(true)
  })

  it('links only to YouSafe estate guides over https', () => {
    for (const slug of GIG_GUIDE_SLUGS) {
      for (const g of getGigGuideLinks(slug)) {
        expect(g.href).toMatch(/^https:\/\/(yousafeconsultancy\.com|legal\.yousafeconsultancy\.com)\//)
        expect(g.title.length).toBeGreaterThan(10)
      }
    }
  })

  it('never points the post-completion I-765 review at STEM OPT or pre-completion guides', () => {
    for (const g of getGigGuideLinks('review-i765-opt-application-before-filing')) {
      expect(g.href).not.toMatch(/stem-opt|pre-completion/)
    }
  })

  it('renders nothing for roster or unknown gigs', () => {
    expect(getGigGuideLinks('some-roster-listing')).toEqual([])
    expect(getGigGuideLinks(undefined)).toEqual([])
  })

  it('is rendered on the gig detail page', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'components/marketplace/GigDetailPage.tsx'), 'utf8')
    expect(page).toContain('<GigGuideLinks slug=')
  })
})
