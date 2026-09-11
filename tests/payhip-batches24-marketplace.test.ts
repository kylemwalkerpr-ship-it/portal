import fs from 'node:fs'
import path from 'node:path'
import { PAYHIP_BATCHES_2_4_PRODUCTS } from '@/lib/payhipBatches24'
import { FILE_SHOP_PRODUCTS } from '@/lib/files-shop-catalog'

const EXPECTED_IDS = [
  'b3pSu', '1LXUs', 'g7efi', 'baRtH', '9Fxb4', 'UuQMj', 'oOzae', 'l3Cdc', '87eHp',
  'ntE4Q', 'XLI0e', 'rRVb4', '9jpJQ', 'KX0Rd', 'YngNy', '9Pgn8', 'eB2KM', 'yJP2Y',
  'Jnm2E', 'ju1Xm', 'ROGvC', 'xdCZl', 'tWBz2', 'sjFIf', 'ZLyP9', 'xQg6i', 'rlsyK',
]

const EXPECTED_PRICES = [
  12.99, 18.99, 15.99, 13.99, 12.99, 16.99, 19.99, 8.99, 9.99,
  6.99, 8.99, 12.99, 11.99, 14.99, 9.99, 12.99, 9.99, 9.99,
  7.99, 8.99, 12.99, 10.99, 11.99, 10.99, 11.99, 14.99, 8.99,
]

describe('Payhip Batches 2-4 Marketplace release contract', () => {
  test('contains exactly products 10-36 in three batches of nine', () => {
    expect(PAYHIP_BATCHES_2_4_PRODUCTS).toHaveLength(27)
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.productNumber)).toEqual(
      Array.from({ length: 27 }, (_, index) => index + 10),
    )
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.filter((product) => product.batch === 2)).toHaveLength(9)
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.filter((product) => product.batch === 3)).toHaveLength(9)
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.filter((product) => product.batch === 4)).toHaveLength(9)
  })

  test('locks the Phase-A Payhip IDs, prices, cover photography and commercial metadata', () => {
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.payhipId)).toEqual(EXPECTED_IDS)
    expect(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.price)).toEqual(EXPECTED_PRICES)

    const uniqueIds = new Set(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.payhipId))
    const uniqueSlugs = new Set(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.slug))
    expect(uniqueIds.size).toBe(27)
    expect(uniqueSlugs.size).toBe(27)

    for (const product of PAYHIP_BATCHES_2_4_PRODUCTS) {
      expect(product.imageUrl).toMatch(/^https:\/\/payhip\.com\/cdn-cgi\/image\//)
      expect(product.imageAlt.length).toBeGreaterThan(20)
      expect(product.description.length).toBeGreaterThan(80)
      expect(product.tags.length).toBeGreaterThanOrEqual(6)
      expect(product.deliveryLabel.length).toBeGreaterThan(3)
      expect(product.buyerFile.length).toBeGreaterThan(3)
      expect(product.apexSlug.startsWith('shop-')).toBe(true)
    }
  })

  test('surfaces every audited product through the Marketplace file-shop catalog', () => {
    for (const product of PAYHIP_BATCHES_2_4_PRODUCTS) {
      const card = FILE_SHOP_PRODUCTS.find((item) => item.href === `/shop/${product.slug}`)
      expect(card, product.slug).toBeDefined()
      expect(card?.price).toBe(product.price.toFixed(2))
      expect(card?.cover).toBe(product.imageUrl)
      expect(card?.published).toBe(true)
    }
  })

  test('routes only the 27 audited public shop slugs to the shared product renderer', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8')
    const page = fs.readFileSync(path.join(process.cwd(), 'app/payhip-product/[slug]/page.tsx'), 'utf8')

    for (const product of PAYHIP_BATCHES_2_4_PRODUCTS) {
      expect(config).toContain(`'${product.slug}'`)
    }
    expect(page).toContain("const PAYHIP = 'https://shop.yousafeconsultancy.com/b'")
    expect(page).toContain("const APEX = 'https://yousafeconsultancy.com/blog'")
    expect(page).toContain('Product')
    expect(page).toContain('BreadcrumbList')
    expect(page).toContain('Search Marketplace for')
  })
})
