import { FilesRailScroller } from '@/components/marketplace/FilesRailScroller'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import { applyPayhipBatch1Commercial, getPayhipBatch1Commercial } from '@/lib/payhipBatch1Commercial'
import type { FileShopProduct } from '@/lib/files-shop-catalog'

/**
 * Reuses the established Marketplace instant-download rail. Batch 1 products
 * resolve through the audited commercial manifest so price, packaging and
 * real-photo covers match their customer-facing release contract.
 */
export function ImmigrationPackRail() {
  const products: FileShopProduct[] = IMMIGRATION_SHOP_PRODUCTS
    .filter((pack) => pack.payhip_published)
    .slice(0, 8)
    .map((basePack, index) => {
      const pack = applyPayhipBatch1Commercial(basePack)
      const commercial = getPayhipBatch1Commercial(pack.slug)
      return {
        id: pack.slug,
        file: String(index + 21).padStart(2, '0'),
        cat: 'template',
        format: commercial?.deliveryLabel ?? 'Digital preparation pack',
        stamp: 'IMMIGRATION\nPACK',
        title: pack.name,
        desc: pack.short_description,
        bullets: commercial
          ? [commercial.deliveryLabel, 'Official-source guidance included']
          : [
              pack.includes[0] || 'Application preparation organizer',
              pack.includes[1] || 'Document checklist',
            ],
        price: String(pack.price_usd),
        href: `/shop/${pack.slug}`,
        cover: commercial?.cover.imageUrl ?? '/shop/covers/immigration-prep-pack.svg',
        published: true,
      }
    })

  return <FilesRailScroller products={products} />
}
