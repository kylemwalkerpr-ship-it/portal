import { ok, fail } from '@/lib/apiEnvelope'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const ACTIVE_QUEUE_STATUSES = [
  'created',
  'new',
  'queued',
  'pending',
  'active',
  'in_progress',
  'working',
  'review',
  'under_review',
  'delivered',
  'awaiting_approval',
  'revision',
  'revision_requested',
]

const EXCLUDED_REPUTATION_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refunded',
  'rejected',
  'failed',
  'void',
  'deleted',
])

const HISTORY_PAGE_SIZE = 1000
const MAX_REPUTATION_HISTORY_ROWS = 5000

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await getOptionalPortalUser()
  // This endpoint returns aggregate public reputation only. Use the service
  // role so public and authenticated buyers see the same evidence-backed
  // signals even when row-level order policies are stricter for clients.
  const db = createSupabaseAdminClient()
  const { slug } = await context.params

  const { data: gig, error } = await db
    .from('gigs')
    .select('id, slug, title, provider_id, provider_type, status, avg_rating, review_count, order_count, provider:profiles!gigs_provider_id_fkey(id, full_name, email, username)')
    .eq('slug', slug)
    .single()

  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)

  const isOwner = !!auth && gig.provider_id === auth.profileId && gig.provider_type === auth.role
  const isAdmin = !!auth && auth.role === 'admin'
  if (gig.status !== 'active' && !isOwner && !isAdmin) return fail('Gig not found.', 404)

  const providerSellerTable = gig.provider_type === 'consultant' ? 'consultants' : 'attorneys'

  const [providerGigsRes, providerHeadshotRes, sellerLevelRes, activeQueueRes] = await Promise.all([
    db
      .from('gigs')
      .select('id, order_count')
      .eq('provider_id', gig.provider_id)
      .eq('status', 'active'),
    db
      .from(providerSellerTable)
      .select('headshot_url')
      .eq('profile_id', gig.provider_id)
      .maybeSingle(),
    db
      .from('seller_level_snapshots')
      .select('level, rating, completed_orders, on_time_delivery_rate, response_rate, cancellation_rate, computed_at')
      .eq('provider_profile_id', gig.provider_id)
      .eq('provider_type', gig.provider_type)
      .maybeSingle(),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('gig_id', gig.id)
      .in('status', ACTIVE_QUEUE_STATUSES),
  ])

  const providerGigs = providerGigsRes.data || []
  const providerGigIds = providerGigs.map((row: any) => row.id).filter(Boolean)
  const providerOrderCount = providerGigs.reduce((sum: number, row: any) => sum + Number(row.order_count || 0), 0)
  const sellerLevel = sellerLevelRes.data || null
  const providerHeadshot = (providerHeadshotRes.data as { headshot_url?: string | null } | null)?.headshot_url || null

  // Repeat-client evidence is derived from existing orders. Paginate instead
  // of silently accepting Supabase's default row cap. If history grows beyond
  // our bounded read budget, omit repeat-client proof rather than publish a
  // misleading partial count. The exact active queue count above remains safe.
  const clientOrderCounts = new Map<string, number>()
  let historyComplete = true
  let fetchedRows = 0

  if (providerGigIds.length > 0) {
    while (fetchedRows < MAX_REPUTATION_HISTORY_ROWS) {
      const from = fetchedRows
      const to = Math.min(from + HISTORY_PAGE_SIZE - 1, MAX_REPUTATION_HISTORY_ROWS - 1)
      const { data: rows, error: historyError } = await db
        .from('orders')
        .select('client_id, status')
        .in('gig_id', providerGigIds)
        .range(from, to)

      if (historyError) {
        historyComplete = false
        break
      }

      const page = Array.isArray(rows) ? rows : []
      for (const row of page as Array<{ client_id?: string | null; status?: string | null }>) {
        const status = String(row.status || '').toLowerCase()
        if (EXCLUDED_REPUTATION_STATUSES.has(status) || !row.client_id) continue
        clientOrderCounts.set(row.client_id, (clientOrderCounts.get(row.client_id) || 0) + 1)
      }

      fetchedRows += page.length
      if (page.length < HISTORY_PAGE_SIZE) break
      if (fetchedRows >= MAX_REPUTATION_HISTORY_ROWS) historyComplete = false
    }
  }

  let repeatClientCount = 0
  let repeatOrderCount = 0
  if (historyComplete) {
    for (const count of clientOrderCounts.values()) {
      if (count < 2) continue
      repeatClientCount += 1
      repeatOrderCount += count - 1
    }
  }

  return ok({
    gig: {
      id: gig.id,
      title: gig.title,
      provider_id: gig.provider_id,
      provider_type: gig.provider_type,
      provider: gig.provider,
      provider_headshot_url: providerHeadshot,
      avg_rating: Number(gig.avg_rating || 0),
      review_count: Number(gig.review_count || 0),
      order_count: Number(gig.order_count || 0),
      provider_order_count: providerOrderCount,
      seller_level: sellerLevel?.level || null,
      seller_level_rating: sellerLevel?.rating ?? null,
      seller_completed_orders: sellerLevel?.completed_orders ?? null,
      seller_on_time_delivery_rate: sellerLevel?.on_time_delivery_rate ?? null,
      seller_response_rate: sellerLevel?.response_rate ?? null,
      seller_cancellation_rate: sellerLevel?.cancellation_rate ?? null,
      seller_level_computed_at: sellerLevel?.computed_at || null,
      active_queue_count: Number(activeQueueRes.count || 0),
      repeat_client_count: historyComplete ? repeatClientCount : null,
      repeat_order_count: historyComplete ? repeatOrderCount : null,
      repeat_history_complete: historyComplete,
    },
  })
}
