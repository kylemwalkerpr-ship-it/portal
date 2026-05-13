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
  const status = body.status === 'active' ? 'active' : 'draft'
  const category = String(body.category || body.subcategory || '').trim() || null
  const subcategory = String(body.subcategory || '').trim() || null
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 3) : []

  const { data: gig, error } = await auth.db
    .from('gigs')
    .insert({
      provider_id: auth.profileId,
      provider_type: auth.role,
      title,
      category,
      subcategory,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 5) : [],
      pitch: body.pitch || '',
      description: body.description || '',
      requirements: body.requirements || '',
      faq: Array.isArray(body.faq) ? body.faq.slice(0, 10) : [],
      gallery_images: Array.isArray(body.gallery_images) ? body.gallery_images.slice(0, 5) : [],
      video_url: body.video_url || null,
      status,
      published_at: status === 'active' ? new Date().toISOString() : null,
      seo_title: body.seo_title || title,
      seo_description: body.seo_description || body.pitch || '',
      slug,
    })
    .select('*')
    .single()

  if (error || !gig) return fail(error?.message || 'Could not create gig.', 500)

  const tierRows = (tiers.length ? tiers : [{ tier: 'basic', title: 'Basic', price: 100, delivery_days: 1, revisions: 1, features: [], is_active: true }])
    .map((tier: any, index: number) => ({
      gig_id: gig.id,
      tier: ['basic', 'standard', 'premium'].includes(tier.tier) ? tier.tier : ['basic', 'standard', 'premium'][index],
      title: String(tier.title || tier.tier || 'Package').slice(0, 80),
      description: String(tier.description || ''),
      price: Math.max(100, Number(tier.price || 100)),
      delivery_days: Math.max(1, Number(tier.delivery_days || 1)),
      revisions: Math.max(0, Number(tier.revisions || 0)),
      features: Array.isArray(tier.features) ? tier.features.map(String).slice(0, 12) : [],
      is_active: tier.is_active !== false,
    }))

  const { error: tierError } = await auth.db.from('gig_tiers').insert(tierRows)
  if (tierError) return fail(tierError.message, 500)

  return ok({ gig }, { status: 201 })
}
