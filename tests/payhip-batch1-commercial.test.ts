import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import {
  PAYHIP_BATCH1_COMMERCIAL,
  applyPayhipBatch1Commercial,
  getPayhipBatch1CrossSells,
} from '@/lib/payhipBatch1Commercial'

const EXPECTED_IDS = ['Ap382', 'kcRoK', 'e9Usb', '6gsAa', 'jTfbO', 'ZsyvP', 'IMFsj', '8Yo4F', 'u0S1v']

describe('Payhip Batch 1 commercial contract', () => {
  test('contains exactly the authorized first nine catalog products', () => {
    expect(PAYHIP_BATCH1_COMMERCIAL).toHaveLength(9)
    expect(PAYHIP_BATCH1_COMMERCIAL.map((p) => p.payhipId)).toEqual(EXPECTED_IDS)
  })

  test('keeps researched prices inside their recorded market bands', () => {
    for (const product of PAYHIP_BATCH1_COMMERCIAL) {
      expect(product.priceUsd).toBeGreaterThanOrEqual(product.marketRangeUsd[0])
      expect(product.priceUsd).toBeLessThanOrEqual(product.marketRangeUsd[1])
      expect(Number.isInteger(product.priceUsd * 100)).toBe(true)
    }
  })

  test('every product states exact delivery, truth boundary, real cover provenance and full Payhip blog copy', () => {
    for (const product of PAYHIP_BATCH1_COMMERCIAL) {
      expect(product.deliveryLabel.length).toBeGreaterThan(15)
      expect(product.deliveryPromise).toMatch(/not an official government form/i)
      expect(product.deliveryPromise).toMatch(/not .*legal advice/i)
      expect(product.deliveryPromise).toMatch(/guarantee of approval|guaranteed/i)
      expect(product.cover.pexelsPage).toMatch(/^https:\/\/www\.pexels\.com\/photo\//)
      expect(product.cover.imageUrl).toMatch(/^https:\/\/images\.pexels\.com\/photos\//)
      expect(product.tags.length).toBeGreaterThanOrEqual(6)
      expect(product.payhipBlog.bodyMarkdown.length).toBeGreaterThan(1200)
      expect(product.apex.slug).toMatch(/^shop-/)
      expect(product.apex.authorityLinks.length).toBeGreaterThan(0)
    }
  })

  test('commercial overlay changes only the researched fields and preserves official-source registry', () => {
    for (const commercial of PAYHIP_BATCH1_COMMERCIAL) {
      const base = IMMIGRATION_SHOP_PRODUCTS.find((p) => p.slug === commercial.slug)
      expect(base).toBeDefined()
      const resolved = applyPayhipBatch1Commercial(base!)
      expect(resolved.price_usd).toBe(commercial.priceUsd)
      expect(resolved.official_sources).toEqual(base!.official_sources)
      expect(resolved.payhip_url).toEqual(base!.payhip_url)
    }
  })

  test('cross-sells are real products, unique and never recommend the current product', () => {
    for (const commercial of PAYHIP_BATCH1_COMMERCIAL) {
      const crossSells = getPayhipBatch1CrossSells(commercial.slug, IMMIGRATION_SHOP_PRODUCTS)
      expect(new Set(crossSells.map((p) => p.slug)).size).toBe(crossSells.length)
      expect(crossSells.map((p) => p.slug)).not.toContain(commercial.slug)
    }
  })
})
