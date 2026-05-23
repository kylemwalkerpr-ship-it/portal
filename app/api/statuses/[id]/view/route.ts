/**
 * POST /api/statuses/[id]/view — record that the current viewer has opened an
 * inquiry status broadcast. Idempotent (primary key (status_id, viewer_id)).
 *
 * Used by the WhatsApp-style status ring in MarketplaceFeed and Avatar.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: 'Invalid status id.' }, { status: 400 })
  }

  // upsert ignoring conflicts so repeat views are no-ops.
  const { error } = await auth.db
    .from('inquiry_status_views')
    .upsert(
      { status_id: id, viewer_id: auth.profileId },
      { onConflict: 'status_id,viewer_id', ignoreDuplicates: true },
    )

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
