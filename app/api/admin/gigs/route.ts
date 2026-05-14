import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  let query = auth.db
    .from('gigs')
    .select(
      'id, slug, title, status, gig_status_reason, provider_id, provider_type, ' +
      'suspended_at, suspended_by, deleted_at, category, subcategory, ' +
      'avg_rating, review_count, order_count, created_at, updated_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data: gigs, error } = await query

  if (error) return fail(error.message, 500)

  return ok({ gigs: gigs ?? [], total: (gigs ?? []).length })
}
