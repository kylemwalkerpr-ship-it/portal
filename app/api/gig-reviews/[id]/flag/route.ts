import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return fail('Invalid review id.', 400)
  const body = await req.json().catch(() => ({}))
  const { data: review } = await auth.db.from('gig_reviews').select('id').eq('id', id).maybeSingle()
  if (!review) return fail('Review not found.', 404)
  // A user report only queues the review for an admin. It must not change the
  // review's public status, or any signed-in account could hide any review.
  // Admin moderation (api/admin/gigs/moderate) decides whether to remove it.
  await auth.db.from('moderation_queue').insert({
    target_table: 'gig_reviews',
    target_id: id,
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
  })
  return ok({ flagged: true })
}
