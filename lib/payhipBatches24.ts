import { PAYHIP_BATCH2_PRODUCTS } from './payhipBatches24Batch2'
import { PAYHIP_BATCH3_PRODUCTS } from './payhipBatches24Batch3'
import { PAYHIP_BATCH4_PRODUCTS } from './payhipBatches24Batch4'
import type { PayhipBatches24Product } from './payhipBatches24Types'

export const PAYHIP_BATCHES_2_4_PRODUCTS: readonly PayhipBatches24Product[] = [
  ...PAYHIP_BATCH2_PRODUCTS,
  ...PAYHIP_BATCH3_PRODUCTS,
  ...PAYHIP_BATCH4_PRODUCTS,
]

const BY_SLUG = new Map(PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => [product.slug, product]))
const BY_LEGACY_CARD_ID = new Map(
  PAYHIP_BATCHES_2_4_PRODUCTS
    .filter((product) => product.legacyCardId)
    .map((product) => [product.legacyCardId as string, product]),
)

export function getPayhipBatches24Product(slug: string) {
  return BY_SLUG.get(slug)
}

export function getPayhipBatches24ProductByLegacyCardId(id: string) {
  return BY_LEGACY_CARD_ID.get(id)
}

export function getPayhipBatches24RelatedProducts(product: PayhipBatches24Product) {
  return product.relatedSlugs
    .map((slug) => BY_SLUG.get(slug))
    .filter((related): related is PayhipBatches24Product => Boolean(related))
}

export const PAYHIP_BATCHES_2_4_SHOP_SLUGS = PAYHIP_BATCHES_2_4_PRODUCTS.map((product) => product.slug)
