/**
 * GET /api/admin/analytics/search-console?days=28
 *
 * Property-wide Google Search Console performance for the admin dashboard's
 * Search tab: clicks / impressions / CTR / avg position (with prior-period
 * deltas), a daily series, and top queries + pages.
 *
 * Organic-search clicks are the dominant traffic channel for the consultancy
 * SEO estate, so this doubles as the site-traffic view. Network-bound (a few
 * GSC fetches), negligible CPU — no 1102 exposure.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'
import { fetchSiteSearchAnalytics } from '@/lib/gscAnalytics'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const url = new URL(req.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 28, 7), 90)

  try {
    const data = await fetchSiteSearchAnalytics(days)
    return ok(data)
  } catch (e: any) {
    return ok({
      configured: false,
      range: { startDate: '', endDate: '', days },
      totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      totalsPrev: null,
      daily: [],
      topQueries: [],
      topPages: [],
      warnings: [String(e?.message || 'search-console fetch failed')],
    })
  }
}
