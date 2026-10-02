import fs from 'fs'
import path from 'path'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import {
  F1_REINSTATEMENT_REVIEW,
  OPT_I765_REVIEW,
  getPackReviewUpsell,
} from '@/lib/packReviewUpsell'

const DELIVERABLE_GIGS = new Set([OPT_I765_REVIEW.slug, F1_REINSTATEMENT_REVIEW.slug])

describe('pack -> professional review upsell', () => {
  it('only ever links deliverable review gigs', () => {
    for (const product of IMMIGRATION_SHOP_PRODUCTS) {
      const upsell = getPackReviewUpsell(product.slug)
      if (upsell.primary) expect(DELIVERABLE_GIGS.has(upsell.primary.slug)).toBe(true)
      if (upsell.secondary) expect(DELIVERABLE_GIGS.has(upsell.secondary.gig.slug)).toBe(true)
    }
  })

  it('maps the OPT packs to the I-765 review', () => {
    expect(getPackReviewUpsell('us-opt-i765-application-prep-pack').primary?.slug).toBe(OPT_I765_REVIEW.slug)
    expect(getPackReviewUpsell('us-stem-opt-i765-i983-companion-pack').primary).toBeNull()
  })

  it('falls back to the free intake for packs with no matching review', () => {
    const upsell = getPackReviewUpsell('canada-trv-visitor-visa-pack')
    expect(upsell.primary).toBeNull()
    expect(upsell.secondary).toBeNull()
  })

  it('renders a tracked review section on every pack page', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app/shop/[slug]/page.tsx'), 'utf8')
    expect(page).toContain('getPackReviewUpsell(slug)')
    expect(page).toContain('GET_MATCHED_PATH')
    expect(page).toContain('pack_review_upsell:')
  })
})
