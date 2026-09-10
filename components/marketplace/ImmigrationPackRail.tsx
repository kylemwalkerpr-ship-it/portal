import { FilesRailScroller } from '@/components/marketplace/FilesRailScroller'
import { IMMIGRATION_SHOP_PRODUCTS } from '@/lib/immigration-shop-products'
import type { FileShopProduct } from '@/lib/files-shop-catalog'

/**
 * Reuses the established Marketplace instant-download rail instead of
 * importing the older styling from the direct Cloudflare deployment.
 */
export function ImmigrationPackRail() {
  const products: FileShopProduct[] = IMMIGRATION_SHOP_PRODUCTS
    .filter((pack) => pack.payhip_published)
    .slice(0, 8)
    .map((pack, index) => ({
      id: pack.slug,
      file: String(index + 21).padStart(2, '0'),
      cat: 'template',
      format: 'Digital preparation pack',
      stamp: 'IMMIGRATION\nPACK',
      title: pack.name,
      desc: pack.short_description,
      bullets: [
        pack.includes[0] || 'Application preparation organizer',
        pack.includes[1] || 'Document checklist',
      ],
      price: String(pack.price_usd),
      href: `/shop/${pack.slug}`,
      cover: '/shop/covers/immigration-prep-pack.svg',
      published: true,
    }))

  return <FilesRailScroller products={products} />
}
