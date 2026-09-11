import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const products = read('lib/immigration-shop-products.ts')
const fileShopCatalog = read('lib/files-shop-catalog.ts')
const shopPage = read('app/shop/page.tsx')
const shopUi = read('app/shop/FilesShop.tsx')
const productPage = read('app/shop/[slug]/page.tsx')
const sitemap = read('app/sitemap.ts')
const legacyIndex = read('app/marketplace/templates/page.tsx')
const legacyDetail = read('app/marketplace/templates/[slug]/page.tsx')
const landing = read('app/marketplace/PublicMarketplaceLanding.tsx')
const adminTemplates = read('components/design/admin-templates.tsx')
const adminShop = read('components/design/admin-shop-catalog.tsx')

const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
const filters = read('components/marketplace/FilterSidebar.tsx')
const featured = read('components/marketplace/FeaturedBriefsGrid.tsx')
const categoryLayout = read('app/marketplace/categories/[categoryId]/layout.tsx')
const categoryPage = read('app/marketplace/categories/[categoryId]/page.tsx')

describe('recovered Cloudflare shop additions', () => {
  const recoveredProducts = [
    ['us-f1-student-visa-ds160-i20-pack', 'https://payhip.com/b/UuQMj'],
    ['us-f1-interview-home-ties-pack', 'https://payhip.com/b/9Fxb4'],
    ['us-b1b2-visitor-visa-ds160-invitation-pack', 'https://payhip.com/b/baRtH'],
    ['us-opt-i765-application-prep-pack', 'https://payhip.com/b/g7efi'],
    ['us-stem-opt-i765-i983-companion-pack', 'https://payhip.com/b/1LXUs'],
    ['us-i134-financial-support-companion-pack', 'https://payhip.com/b/b3pSu'],
    ['canada-study-permit-complete-pack', 'https://payhip.com/b/oOzae'],
    ['canada-proof-of-funds-sponsor-pack', 'https://payhip.com/b/u0S1v'],
    ['canada-study-plan-letter-of-explanation-pack', 'https://payhip.com/b/8Yo4F'],
    ['canada-trv-visitor-visa-pack', 'https://payhip.com/b/IMFsj'],
    ['canada-work-permit-outside-canada-pack', 'https://payhip.com/b/ZsyvP'],
    ['canada-pgwp-application-pack', 'https://payhip.com/b/jTfbO'],
    ['canada-family-information-travel-history-pack', 'https://payhip.com/b/6gsAa'],
    ['us-canada-refusal-reapplication-response-pack', 'https://payhip.com/b/e9Usb'],
    ['universal-client-intake-document-review-kit', 'https://payhip.com/b/kcRoK'],
    ['premium-usa-canada-study-work-mega-bundle', 'https://payhip.com/b/Ap382'],
  ] as const

  test('source-controls all 16 recovered products with their exact Payhip destinations', () => {
    expect(recoveredProducts).toHaveLength(16)
    for (const [slug, payhipUrl] of recoveredProducts) {
      expect(products).toContain(`slug: '${slug}'`)
      expect(products).toContain(`payhip_url: '${payhipUrl}'`)
    }
  })

  test('keeps the established 20-product + 16-pack card contract while layering audited commercial state', () => {
    expect(fileShopCatalog).toContain('const BASE_FILE_SHOP_PRODUCTS: FileShopProduct[]')
    expect(fileShopCatalog).toContain('const AUDITED_BASE_FILE_SHOP_PRODUCTS: FileShopProduct[] = BASE_FILE_SHOP_PRODUCTS.map')
    expect(fileShopCatalog).toContain('...AUDITED_BASE_FILE_SHOP_PRODUCTS')
    expect(fileShopCatalog).toContain('...IMMIGRATION_FILE_SHOP_PRODUCTS')
    expect(fileShopCatalog).toContain('getPayhipBatches24ProductByLegacyCardId')
    expect(fileShopCatalog).toContain('getPayhipBatches24Product(batch1Pack.slug)')
    expect(fileShopCatalog).toContain('href: `/shop/${batch1Pack.slug}`')
    expect(fileShopCatalog).toContain("cover: audited?.imageUrl ?? batch1Commercial?.cover.imageUrl ?? '/shop/covers/immigration-prep-pack.svg'")
    expect(fileShopCatalog).toContain('applyPayhipBatch1Commercial')
    expect(fileShopCatalog).toContain('getPayhipBatch1Commercial')
    expect(shopPage).toContain('numberOfItems: products.length')
    expect(shopUi).toContain('Search visa packs, workbooks, planners…')
    expect(shopUi).toContain('ys-shop-featured-rail')
    expect(shopUi).toContain('ys-shop-grid')
  })

  test('keeps Batch 1 immigration detail pages Payhip-only while branding audited checkout URLs', () => {
    expect(productPage).toContain('const payhipUrl = commercial')
    expect(productPage).toContain('https://shop.yousafeconsultancy.com/b/${commercial.payhipId}')
    expect(productPage).toContain(': product.payhip_url')
    expect(productPage).toContain('href={payhipUrl}')
    expect(productPage).toContain('Buy on Payhip')
    expect(productPage).toContain('Official government sources')
    expect(productPage).toContain("href=\"/categories/immigration\"")
    expect(productPage).not.toContain('/marketplace/cart')
    expect(productPage).not.toContain('Add to Cart')
  })

  test('keeps /shop canonical, adds audited products to sitemap, and redirects historical template URLs', () => {
    expect(sitemap).toContain('IMMIGRATION_SHOP_PRODUCTS')
    expect(sitemap).toContain('PAYHIP_BATCHES_2_4_PRODUCTS')
    expect(sitemap).toContain('auditedPayhipSlugs.has(product.slug)')
    expect(sitemap).toContain('url: `${base}/shop/${product.slug}`')
    expect(sitemap).not.toContain('TEMPLATE_PACKS')
    expect(sitemap).not.toContain('/marketplace/templates/${pack.slug}')
    expect(legacyIndex).toContain("permanentRedirect('https://market.yousafeconsultancy.com/shop')")
    expect(legacyIndex).not.toContain('notFound()')
    expect(legacyDetail).toContain('permanentRedirect(`https://market.yousafeconsultancy.com/shop/${encodeURIComponent(slug)}`)')
    expect(legacyDetail).not.toContain('dynamicParams = false')
    expect(legacyDetail).not.toContain('notFound()')
  })

  test('surfaces the complete source-controlled catalogue in admin without making Payhip links DB-editable', () => {
    expect(adminTemplates).toContain("import AdminShopCatalogue from './admin-shop-catalog'")
    expect(adminTemplates).toContain('<AdminShopCatalogue />')
    expect(adminShop).toContain('Complete 36-product catalogue')
    expect(adminShop).toContain('FILE_SHOP_PRODUCTS.filter')
    expect(adminShop).toContain('source-controlled and read-only here')
  })
})

describe('Marketplace design regression protection during shop reconciliation', () => {
  test('keeps the current discovery/category architecture intact', () => {
    expect(discovery).toContain('const buildBrowserQuery = React.useCallback')
    expect(filters).toContain('ys-filter-desktop-row')
    expect(featured).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(categoryLayout).toContain('className={styles.cardRail}')
    expect(categoryPage).toContain('<CategoryRecommendedGigsCarousel')
  })

  test('adds the recovered 36-product promotion without replacing the existing Marketplace landing', () => {
    expect(landing).toContain("import { ImmigrationPackRail } from '@/components/marketplace/ImmigrationPackRail'")
    expect(landing).toContain('36 instant downloads')
    expect(landing).toContain('Preparation packs and practical files, now in one shop')
    expect(landing).toContain('aria-label="Immigration preparation packs"')
    expect(landing).toContain('<ImmigrationPackRail />')
    expect(landing).toContain('<FeaturedBriefsGrid')
    expect(landing).toContain('<HeroCaseFileSlideshow')
  })
})