import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  await auth.db.from('gig_reviews').update({ status: 'flagged' }).eq('id', id)
  await auth.db.from('moderation_queue').insert({
    target_table: 'gig_reviews',
    target_id: id,
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
  })
  return ok({ flagged: true })
}
