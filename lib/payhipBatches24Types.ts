export type PayhipBatches24Category = 'spreadsheet' | 'guide' | 'template' | 'craft'

export type PayhipBatches24Product = {
  productNumber: number
  batch: 2 | 3 | 4
  slug: string
  apexSlug: string
  payhipId: string
  legacyCardId?: string
  name: string
  price: number
  imageUrl: string
  imageAlt: string
  description: string
  deliveryLabel: string
  buyerFile: string
  fileShopCategory: PayhipBatches24Category
  tags: string[]
  marketplaceCategory: string
  authorityLinks: { label: string; href: string }[]
  relatedSlugs: string[]
}
