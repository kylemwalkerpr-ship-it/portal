/**
 * GET  /api/content-studio/shop-seo/queue — list all 20 products + status
 * POST /api/content-studio/shop-seo/queue — reset queue or update status
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { getQueue, getQueueStats, getAllShopProducts, updateQueueStatus, resetQueue } from '@/lib/shopSeo'

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const queue = getQueue()
    const stats = getQueueStats()
    const products = getAllShopProducts()

    // Merge product detail into queue items
    const merged = queue.map((q) => {
      const product = products.find((p) => p.slug === q.slug)
      return { ...q, product }
    })

    return NextResponse.json({ queue: merged, stats })
  } catch (err) {
    console.error('[content-studio/shop-seo/queue GET]', err)
    return NextResponse.json({ error: { message: 'Failed to load queue' } }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json().catch(() => ({}))
    const { action, slug, status } = body as { action?: string; slug?: string; status?: string }

    if (action === 'reset') {
      const queue = resetQueue()
      return NextResponse.json({ queue, stats: getQueueStats() })
    }

    if (action === 'update' && slug) {
      if (!status || !['queued', 'drafting', 'drafted', 'shipped'].includes(status)) {
        return NextResponse.json({ error: { message: 'Invalid status' } }, { status: 400 })
      }
      const item = updateQueueStatus(slug, status as 'queued' | 'drafting' | 'drafted' | 'shipped')
      return NextResponse.json({ item })
    }

    return NextResponse.json({ error: { message: 'Unknown action' } }, { status: 400 })
  } catch (err) {
    console.error('[content-studio/shop-seo/queue POST]', err)
    return NextResponse.json({ error: { message: 'Failed to update queue' } }, { status: 500 })
  }
}