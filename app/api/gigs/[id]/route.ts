import { ok, fail } from '@/lib/apiEnvelope'
import { buildSlug } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

async function loadGig(auth: any, id: string) {
  return auth.db.from('gigs').select('*, tiers:gig_tiers(*)').eq('id', id).single()
}

function owns(auth: any, gig: any) {
  return auth.role === 'admin' || (gig.provider_id === auth.profileId && gig.provider_type === auth.role)
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: gig, error } = await loadGig(auth, id)
  if (error || !gig) return fail(error?.message || 'Gig not found.', 404)
  if (!owns(auth, gig) && gig.status !== 'active') return fail('Forbidden.', 403)
  return ok({ gig })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!owns(auth, existing)) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['title', 'category', 'pitch', 'description', 'seo_title', 'seo_description', 'video_url']) {
    if (key in body) payload[key] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  }
  if ('tags' in body) payload.tags = Array.isArray(body.tags) ? body.tags.map(String).slice(0, 5) : []
  if ('faq' in body) payload.faq = Array.isArray(body.faq) ? body.faq.slice(0, 10) : []
  if ('gallery_images' in body) payload.gallery_images = Array.isArray(body.gallery_images) ? body.gallery_images.slice(0, 5) : []
  if ('slug' in body) payload.slug = buildSlug(String(body.slug || existing.title))

  const { data: gig, error } = await auth.db.from('gigs').update(payload).eq('id', id).select('*, tiers:gig_tiers(*)').single()
  if (error || !gig) return fail(error?.message || 'Could not update gig.', 500)
  return ok({ gig })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: existing } = await loadGig(auth, id)
  if (!existing) return fail('Gig not found.', 404)
  if (!owns(auth, existing)) return fail('Forbidden.', 403)
  const { data: gig, error } = await auth.db.from('gigs').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error || !gig) return fail(error?.message || 'Could not archive gig.', 500)
  return ok({ gig })
}
