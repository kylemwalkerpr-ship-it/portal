import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}

export async function POST(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const postAbortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', postAbortHandler)

  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', postAbortHandler)
  }
}
