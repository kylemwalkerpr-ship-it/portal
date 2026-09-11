import { PAYHIP_BATCH1_STORE_PLAN } from '@/lib/payhipBatch1StorePlan'

describe('Payhip Batch 1 seller listing plan', () => {
  test('covers all nine products with marketplace-ready metadata', () => {
    expect(PAYHIP_BATCH1_STORE_PLAN).toHaveLength(9)
    for (const item of PAYHIP_BATCH1_STORE_PLAN) {
      expect(item.marketplaceCategory).toBe('Education')
      expect(item.tags.length).toBeGreaterThanOrEqual(6)
      expect(item.coverWidthPx).toBeGreaterThanOrEqual(1000)
      expect(item.coverImageUrl).toMatch(/^https:\/\/images\.pexels\.com\/photos\//)
      expect(item.coverImageUrl).toContain('w=1200')
      expect(item.coverSourcePage).toMatch(/^https:\/\/www\.pexels\.com\/photo\//)
      expect(item.coverAlt.length).toBeGreaterThan(20)
      expect(item.visibility).toBe('Visible')
      expect(item.submitToMarketplace).toBe(true)
    }
  })
})
