/**
 * POST /api/content-studio/shop-seo/generate
 *
 * Takes a product slug from the shop queue and generates a draft blog article
 * (page.tsx content) following the existing Apex blog style. The draft content
 * is returned for review; shipping is a separate step.
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getShopProduct, updateQueueStatus, productBlogSlug, formatPrice } from '@/lib/shopSeo'
import { generateShopBlogPageTsx } from '@/lib/shopSeoGenerator'

export async function POST(req: Request) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => ({}))
    const { slug } = body as { slug?: string }

    if (!slug) {
      return NextResponse.json({ error: { message: 'slug is required' } }, { status: 400 })
    }

    const product = getShopProduct(slug)
    if (!product) {
      return NextResponse.json({ error: { message: `Product not found: ${slug}` } }, { status: 404 })
    }

    // Mark as drafting
    updateQueueStatus(slug, 'drafting')

    // Generate the blog page.tsx content
    const pageTsx = generateShopBlogPageTsx(product)

    // Mark as drafted
    updateQueueStatus(slug, 'drafted')

    return NextResponse.json({
      slug: productBlogSlug(slug),
      product: {
        title: product.productTitle,
        price: formatPrice(product.price),
      },
      pageTsx,
    })
  } catch (err) {
    console.error('[content-studio/shop-seo/generate]', err)
    return NextResponse.json({ error: { message: 'Generation failed' } }, { status: 500 })
  }
}