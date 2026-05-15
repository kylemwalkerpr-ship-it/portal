/**
 * GET /api/messages/unread
 * Returns the unread conversation count for the signed-in profile, used by
 * the inbox badge in every navbar.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profileId } = auth

  try {
    const { data } = await db.rpc('conversation_unread_count', { p_profile_id: profileId })
    const count = typeof data === 'number' ? data : Number(data || 0)
    return Response.json({ unread: count })
  } catch {
    return Response.json({ unread: 0 })
  }
}
