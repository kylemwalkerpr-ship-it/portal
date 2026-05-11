import { ok, fail } from '@/lib/apiEnvelope'
import { buildSlug } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) return fail('Forbidden.', 403)

  const url = new URL(req.url)
  if (url.searchParams.get('countOnly') === 'true') {
    const { count, error } = await auth.db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', auth.profileId)
      .eq('provider_type', auth.role)
      .in('status', ['draft', 'active', 'paused'])

    if (error) return fail(error.message, 500)
    return ok({ used: count ?? 0, count: count ?? 0, limit: 5 })
  }

  return fail('Unsupported gigs query.', 400)
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) return fail('Forbidden.', 403)

  const { count } = await auth.db
    .from('gigs')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', auth.profileId)
    .eq('provider_type', auth.role)
    .in('status', ['draft', 'active', 'paused'])
  if ((count ?? 0) >= 5) return fail("You've reached your 5-gig limit. Archive one to create another.", 409)

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Untitled service'
  const slug = `${buildSlug(title)}-${crypto.randomUUID().slice(0, 8)}`

  const { data: gig, error } = await auth.db
    .from('gigs')
    .insert({
      provider_id: auth.profileId,
      provider_type: auth.role,
      title,
      category: body.category || null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 5) : [],
      pitch: body.pitch || '',
      status: 'draft',
      seo_title: body.seo_title || title,
      seo_description: body.seo_description || body.pitch || '',
      slug,
    })
    .select('*')
    .single()

  if (error || !gig) return fail(error?.message || 'Could not create gig.', 500)

  await auth.db.from('gig_tiers').insert({
    gig_id: gig.id,
    tier: 'basic',
    title: 'Basic',
    description: '',
    price: 100,
    delivery_days: 1,
    revisions: 1,
    features: [],
  })

  return ok({ gig }, { status: 201 })
}
