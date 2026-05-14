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
      .neq('status', 'deleted')

    if (error) return fail(error.message, 500)
    return ok({ used: count ?? 0, count: count ?? 0, limit: 5 })
  }

  // Full gig list with metrics and promotion
  const { data: rows, error } = await auth.db
    .from('gigs')
    .select(`
      id, slug, title, pitch, tagline, category, subcategory, tags, status,
      gig_status_reason, suspended_at, archived_at, deleted_at,
      content_score, featured_until, boost_until, created_at,
      tiers:gig_tiers(tier, title, price_cents, delivery_days, revisions),
      metrics:gig_metrics(impressions, clicks, saves),
      promotion:gig_promotion_campaigns(campaign_type, status, ends_at, impressions, clicks)
    `)
    .eq('provider_id', auth.profileId)
    .eq('provider_type', auth.role)
    .order('created_at', { ascending: false })

  if (error) return fail(error.message, 500)

  const allRows = rows ?? []

  // Build byStatus counts
  const byStatus: Record<string, number> = { draft: 0, active: 0, suspended: 0, archived: 0, deleted: 0 }
  for (const row of allRows) {
    const s = String(row.status || '')
    if (s in byStatus) byStatus[s]++
  }

  // count = non-deleted
  const count = allRows.filter((r: any) => r.status !== 'deleted').length

  // Shape each gig — pick first active promotion if any
  const gigs = allRows.map((row: any) => {
    const promotions = Array.isArray(row.promotion) ? row.promotion : (row.promotion ? [row.promotion] : [])
    const activePromo = promotions.find((p: any) => p.status === 'active') ?? null
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      pitch: row.pitch,
      tagline: row.tagline,
      category: row.category,
      subcategory: row.subcategory,
      tags: row.tags,
      status: row.status,
      gig_status_reason: row.gig_status_reason,
      suspended_at: row.suspended_at,
      archived_at: row.archived_at,
      deleted_at: row.deleted_at,
      content_score: row.content_score,
      featured_until: row.featured_until,
      boost_until: row.boost_until,
      tiers: Array.isArray(row.tiers) ? row.tiers : (row.tiers ? [row.tiers] : []),
      metrics: Array.isArray(row.metrics) ? (row.metrics[0] ?? null) : (row.metrics ?? null),
      promotion: activePromo,
    }
  })

  return ok({ gigs, count, limit: 5, byStatus })
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
