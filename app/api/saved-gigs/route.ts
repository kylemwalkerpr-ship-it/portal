import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(_req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Forbidden.', 403)

  const { data, error } = await auth.db
    .from('saved_gigs')
    .select('id, gig_id, collection_id, created_at, gig:gigs(id, slug, title, pitch, avg_rating, review_count)')
    .eq('client_profile_id', auth.profileId)
    .order('created_at', { ascending: false })

  if (error) return fail(error.message, 500)
  return ok({ saved: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const gig_id = typeof body.gig_id === 'string' ? body.gig_id.trim() : ''
  if (!gig_id) return fail('gig_id is required.', 400)

  const collection_id = typeof body.collection_id === 'string' ? body.collection_id.trim() || null : null

  const { data, error } = await auth.db
    .from('saved_gigs')
    .insert({ client_profile_id: auth.profileId, gig_id, collection_id })
    .select('id, gig_id, collection_id, created_at')
    .single()

  if (error) {
    // Postgres unique violation code
    if (error.code === '23505') return fail('Already saved', 409)
    return fail(error.message, 500)
  }

  return ok({ saved: data }, { status: 201 })
}
