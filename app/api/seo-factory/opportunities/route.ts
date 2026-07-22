import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadFactoryOpportunities } from '@/lib/seoFactory/opportunities'

/**
 * GET /api/seo-factory/opportunities
 * Ranked GSC opportunities for the factory (live if possible, else snapshot).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 50),
    )
    const { source, siteUrl, opportunities } = await loadFactoryOpportunities(limit)

    return NextResponse.json({
      source,
      siteUrl,
      count: opportunities.length,
      opportunities,
    })
  } catch (err) {
    console.error('[seo-factory/opportunities]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    )
  }
}
