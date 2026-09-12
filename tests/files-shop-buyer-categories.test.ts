import { FILE_SHOP_PRODUCTS } from '../lib/files-shop-catalog'
import {
  FILE_SHOP_BUYER_CATEGORIES,
  getFileShopBuyerCategory,
} from '../lib/files-shop-buyer-categories'

describe('buyer-friendly file shop categories', () => {
  test('categorizes every published shop product', () => {
    const published = FILE_SHOP_PRODUCTS.filter((product) => product.published)
    expect(published).toHaveLength(36)

    const uncategorized = published.filter((product) => !getFileShopBuyerCategory(product.id))
    expect(uncategorized).toEqual([])
  })

  test('keeps immigration as a dedicated 16-product category', () => {
    const immigration = FILE_SHOP_PRODUCTS.filter(
      (product) => product.published && getFileShopBuyerCategory(product.id) === 'immigration',
    )

    expect(immigration).toHaveLength(16)
    expect(FILE_SHOP_BUYER_CATEGORIES.find((category) => category.id === 'immigration')?.label).toBe(
      'Immigration Packs',
    )
  })

  test('uses a compact buyer-intent taxonomy instead of file-format navigation', () => {
    expect(FILE_SHOP_BUYER_CATEGORIES.map((category) => category.label)).toEqual([
      'Immigration Packs',
      'Business & Freelance',
      'Marketing & Content',
      'Personal Planning',
      'Career & Job Search',
      'Weddings & Creative',
    ])
  })
})
