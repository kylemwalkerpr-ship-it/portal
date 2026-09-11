import { PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES } from '@/lib/payhipBatch1BlogFunnel'
import { PAYHIP_BATCH1_COMMERCIAL } from '@/lib/payhipBatch1Commercial'

describe('Payhip Batch 1 blog funnel', () => {
  test('creates one publication package for every Batch 1 product', () => {
    expect(PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES).toHaveLength(9)
    expect(PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES.map((item) => item.productSlug)).toEqual(
      PAYHIP_BATCH1_COMMERCIAL.map((item) => item.slug),
    )
  })

  test('every post links Apex, Marketplace, exact Payhip product and authority sources', () => {
    for (const item of PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES) {
      const purposes = new Set(item.links.map((link) => link.purpose))
      expect(purposes).toContain('apex-guide')
      expect(purposes).toContain('marketplace-detail')
      expect(purposes).toContain('product')
      expect(purposes).toContain('authority')

      expect(item.body).toContain('https://yousafeconsultancy.com/blog/')
      expect(item.body).toContain('https://market.yousafeconsultancy.com/shop/')
      expect(item.body).toContain('https://payhip.com/b/')
      expect(item.visibleLinkFooter).toContain('Continue with YouSafe:')
    }
  })

  test('cross-sells are situational and Mega Bundle does not upsell duplicate constituent products', () => {
    const mega = PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES.find(
      (item) => item.productSlug === 'premium-usa-canada-study-work-mega-bundle',
    )
    expect(mega).toBeDefined()
    expect(mega!.links.filter((link) => link.purpose === 'cross-sell')).toHaveLength(0)

    for (const item of PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES.filter((candidate) => candidate !== mega)) {
      expect(item.links.filter((link) => link.purpose === 'cross-sell').length).toBeGreaterThan(0)
    }
  })
})
