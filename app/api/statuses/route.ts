/**
 * GET /api/statuses — active inquiry-status broadcasts visible to the caller.
 *
 * Returns up to 100 statuses with `expires_at > now()` ordered by created_at desc.
 * Each row is annotated with a `viewed` boolean indicating whether the current
 * portal user has already opened the brief (read from `inquiry_status_views`).
 *
 * Used by the WhatsApp-style marketplace status feed.
 */
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const nowIso = new Date().toISOString()

  const { data: rows, error } = await auth.db
    .from('inquiry_statuses')
    .select('id, person_id, inquiry_id, payload, created_at, expires_at')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  const list = rows ?? []
  if (!list.length) return Response.json({ statuses: [] })

  const personIds = Array.from(new Set(list.map((r) => r.person_id).filter(Boolean)))
  const statusIds = list.map((r) => r.id)

  const [{ data: people }, { data: views }] = await Promise.all([
    auth.db.from('profiles').select('id, full_name').in('id', personIds),
    auth.db
      .from('inquiry_status_views')
      .select('status_id')
      .eq('viewer_id', auth.profileId)
      .in('status_id', statusIds),
  ])

  const nameById = new Map((people ?? []).map((p: any) => [p.id, p.full_name as string | null]))
  const viewedSet = new Set((views ?? []).map((v: any) => v.status_id as string))

  const statuses = list.map((r: any) => ({
    id: r.id as string,
    person_id: r.person_id as string,
    person_name: (nameById.get(r.person_id) || '') as string,
    inquiry_id: (r.inquiry_id || null) as string | null,
    payload: r.payload || null,
    created_at: r.created_at as string,
    expires_at: r.expires_at as string,
    viewed: viewedSet.has(r.id),
  }))

  return Response.json({ statuses })
}
