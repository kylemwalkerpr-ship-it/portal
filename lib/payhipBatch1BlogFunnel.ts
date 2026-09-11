import {
  PAYHIP_BATCH1_COMMERCIAL,
  type PayhipBatch1CommercialProduct,
} from '@/lib/payhipBatch1Commercial'

const APEX_BASE = 'https://yousafeconsultancy.com/blog'
const MARKET_BASE = 'https://market.yousafeconsultancy.com/shop'
const PAYHIP_BASE = 'https://payhip.com/b'

export interface PayhipBlogLinkTarget {
  label: string
  href: string
  purpose: 'apex-guide' | 'marketplace-detail' | 'product' | 'authority' | 'cross-sell'
}

export interface PayhipBlogPublishPackage {
  productSlug: string
  payhipBlogSlug: string
  title: string
  excerpt: string
  body: string
  links: PayhipBlogLinkTarget[]
  /**
   * Paste this visible-URL footer into Payhip even if rich-text link creation is
   * temporarily unavailable. It prevents the post from becoming an SEO silo.
   * When publishing normally, use the Payhip editor toolbar to link the labels
   * in `links` and keep this footer as a crawlable/readable fallback.
   */
  visibleLinkFooter: string
}

function exactProductUrl(product: PayhipBatch1CommercialProduct): string {
  return `${PAYHIP_BASE}/${product.payhipId}`
}

function apexUrl(product: PayhipBatch1CommercialProduct): string {
  return `${APEX_BASE}/${product.apex.slug}`
}

function marketUrl(product: PayhipBatch1CommercialProduct): string {
  return `${MARKET_BASE}/${product.slug}`
}

export function getPayhipBatch1BlogPublishPackage(
  product: PayhipBatch1CommercialProduct,
): PayhipBlogPublishPackage {
  const links: PayhipBlogLinkTarget[] = [
    {
      label: product.apex.title,
      href: apexUrl(product),
      purpose: 'apex-guide',
    },
    {
      label: `View ${product.slug.replace(/-/g, ' ')} in the YouSafe Marketplace`,
      href: marketUrl(product),
      purpose: 'marketplace-detail',
    },
    {
      label: 'Buy the exact preparation workbook on Payhip',
      href: exactProductUrl(product),
      purpose: 'product',
    },
    ...product.apex.authorityLinks.map((link) => ({
      label: link.label,
      href: link.href,
      purpose: 'authority' as const,
    })),
  ]

  for (const slug of product.crossSellSlugs) {
    const crossSell = PAYHIP_BATCH1_COMMERCIAL.find((candidate) => candidate.slug === slug)
    if (!crossSell) continue
    links.push({
      label: `Related workbook: ${crossSell.apex.title}`,
      href: marketUrl(crossSell),
      purpose: 'cross-sell',
    })
  }

  const visibleLinkFooter = [
    'Continue with YouSafe:',
    `Detailed guide: ${apexUrl(product)}`,
    `Marketplace details: ${marketUrl(product)}`,
    `Exact Payhip product: ${exactProductUrl(product)}`,
    ...product.apex.authorityLinks.map((link) => `${link.label}: ${link.href}`),
    ...links
      .filter((link) => link.purpose === 'cross-sell')
      .map((link) => `${link.label}: ${link.href}`),
  ].join('\n')

  return {
    productSlug: product.slug,
    payhipBlogSlug: product.payhipBlog.slug,
    title: product.payhipBlog.title,
    excerpt: product.payhipBlog.excerpt,
    body: `${product.payhipBlog.bodyMarkdown}\n\n${visibleLinkFooter}`,
    links,
    visibleLinkFooter,
  }
}

export const PAYHIP_BATCH1_BLOG_PUBLISH_PACKAGES: readonly PayhipBlogPublishPackage[] =
  PAYHIP_BATCH1_COMMERCIAL.map(getPayhipBatch1BlogPublishPackage)
