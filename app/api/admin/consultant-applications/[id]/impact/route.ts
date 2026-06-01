/**
 * GET /api/admin/consultant-applications/[id]/impact
 * Lifecycle-impact panel for an approved consultant: gig counts by status,
 * order counts + GMV (cents), review counts + average rating.
 * Filters gigs by provider_type='consultant' to avoid bleeding into the
 * attorney lane in shared schemas.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, adminProfileId: profile.id }
}

const ZERO = {
  gigs: { active: 0, paused: 0, archived: 0 },
  orders: { count: 0, total_amount_cents: 0 },
  reviews: { count: 0, avg_rating: 0 },
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db } = auth
  const { id } = await context.params

  const { data: application } = await db
    .from('consultant_applications')
    .select('id, profile_id')
    .eq('id', id)
    .maybeSingle()
  if (!application || !application.profile_id) {
    return Response.json({ impact: ZERO })
  }
  const providerId = application.profile_id as string

  // Gigs — scope to the consultant lane via provider_type when present.
  let gigsQuery = db.from('gigs').select('id, status').eq('provider_id', providerId)
  // Try to scope by provider_type — fall back if the column does not exist.
  const gigsResScoped = await gigsQuery.eq('provider_type', 'consultant')
  let gigRows: Array<{ id: string; status: string }>
  if (gigsResScoped.error && /column .* does not exist/i.test(gigsResScoped.error.message || '')) {
    const fallback = await db.from('gigs').select('id, status').eq('provider_id', providerId)
    gigRows = (fallback.data as Array<{ id: string; status: string }> | null) ?? []
  } else {
    gigRows = (gigsResScoped.data as Array<{ id: string; status: string }> | null) ?? []
  }
  const gigs = { active: 0, paused: 0, archived: 0 }
  const gigIds: string[] = []
  for (const g of gigRows) {
    gigIds.push(g.id)
    if (g.status === 'active') gigs.active++
    else if (g.status === 'paused') gigs.paused++
    else if (g.status === 'archived') gigs.archived++
  }

  // Orders — consultant_id column for consultant lane.
  const ordersRes = await db
    .from('orders')
    .select('total_amount, total_cents, amount')
    .eq('consultant_id', providerId)
  let orderCount = 0
  let orderCents = 0
  for (const o of (ordersRes.data as Array<Record<string, unknown>> | null) ?? []) {
    orderCount++
    const cents = Number(o.total_cents ?? 0)
    const dollars = Number(o.total_amount ?? o.amount ?? 0)
    if (cents > 0) orderCents += Math.round(cents)
    else if (dollars > 0) orderCents += Math.round(dollars * 100)
  }

  // Reviews — join via gig_id.
  let reviewCount = 0
  let ratingSum = 0
  if (gigIds.length) {
    const reviewsRes = await db
      .from('gig_reviews')
      .select('rating')
      .in('gig_id', gigIds)
    for (const r of (reviewsRes.data as Array<{ rating: number | null }> | null) ?? []) {
      if (typeof r.rating === 'number') {
        reviewCount++
        ratingSum += r.rating
      }
    }
  }

  return Response.json({
    impact: {
      gigs,
      orders: { count: orderCount, total_amount_cents: orderCents },
      reviews: { count: reviewCount, avg_rating: reviewCount ? Math.round((ratingSum / reviewCount) * 10) / 10 : 0 },
    },
  })
}
