import { PAYHIP_BATCH1_COMMERCIAL } from '@/lib/payhipBatch1Commercial'

export const PAYHIP_BATCH1_MARKETPLACE_CATEGORY = 'Education' as const

export interface PayhipBatch1StorePlanItem {
  slug: string
  payhipId: string
  priceUsd: number
  marketplaceCategory: typeof PAYHIP_BATCH1_MARKETPLACE_CATEGORY
  tags: readonly string[]
  coverImageUrl: string
  coverAlt: string
  coverSourcePage: string
  coverWidthPx: number
  visibility: 'Visible'
  submitToMarketplace: true
  customerPreview: 'guidance-and-workbook-preview'
}

/**
 * Seller-side source of truth for the fields that must be applied on Payhip
 * before Batch 1 is allowed to ship. Education is the closest current Payhip
 * Marketplace category for self-guided immigration preparation workbooks; the
 * product-specific tags carry the route/search specificity.
 */
export const PAYHIP_BATCH1_STORE_PLAN: readonly PayhipBatch1StorePlanItem[] =
  PAYHIP_BATCH1_COMMERCIAL.map((product) => ({
    slug: product.slug,
    payhipId: product.payhipId,
    priceUsd: product.priceUsd,
    marketplaceCategory: PAYHIP_BATCH1_MARKETPLACE_CATEGORY,
    tags: product.tags,
    coverImageUrl: product.cover.imageUrl,
    coverAlt: product.cover.alt,
    coverSourcePage: product.cover.pexelsPage,
    coverWidthPx: 1200,
    visibility: 'Visible' as const,
    submitToMarketplace: true as const,
    customerPreview: 'guidance-and-workbook-preview' as const,
  }))
