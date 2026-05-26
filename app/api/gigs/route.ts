import { ok, fail } from '@/lib/apiEnvelope'
import { buildSlug } from '@/lib/fiverr'
import { requirePortalUser, getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()

  // Public list endpoint — no auth required for browsing active gigs
  if (!auth || !['attorney', 'consultant'].includes(auth.role)) {
    const { data: rows, error, count } = await db
      .from('gigs')
      .select('*, tiers:gig_tiers(*)', { count: 'exact' })
      .eq('status', 'active')
      .order('published_at', { ascending: false })
      .range(0, 99)

    if (error) return fail(error.message, 500)
    return ok({ gigs: rows ?? [], total: count ?? 0 })
  }

  // Provider-specific endpoint — authed providers managing their own gigs
  // Resolve dynamic gig limit for this provider (level-aware via DB function)
  const resolvedLimit = await (async () => {
    try {
      const { data } = await db.rpc('get_provider_gig_limit', {
        p_provider_id:   auth.profileId,
        p_provider_type: auth.role,
      })
      return typeof data === 'number' ? data : 5
    } catch { return 5 }
  })()

  if (url.searchParams.get('countOnly') === 'true') {
    const { count, error } = await db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', auth.profileId)
      .eq('provider_type', auth.role)
      .neq('status', 'deleted')

    if (error) return fail(error.message, 500)
    return ok({ used: count ?? 0, count: count ?? 0, limit: resolvedLimit })
  }

  // Fetch gigs with tiers — avoid joining new tables (gig_promotion_campaigns,
  // gig_metrics) via PostgREST until schema cache is confirmed refreshed.
  const { data: rows, error } = await db
    .from('gigs')
    .select(`
      id, slug, title, pitch, tagline, description, requirements, faq,
      gallery_images, video_url, seo_title, seo_description,
      category, subcategory, tags, status,
      gig_status_reason, suspended_at, archived_at, deleted_at,
      featured_until, boost_until, created_at,
      tiers:gig_tiers(tier, title, price, delivery_days, revisions, features, is_active, description)
    `)
    .eq('provider_id', auth.profileId)
    .eq('provider_type', auth.role)
    .order('created_at', { ascending: false })

  // Self-heal: if a column is missing (e.g. tagline before gigs_columns_patch.sql),
  // retry with a minimal column list so the page still loads.
  let rowsResolved: any = rows
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const retry = await db
      .from('gigs')
      .select(`
        id, slug, title, pitch, category, subcategory, tags, status,
        gig_status_reason, suspended_at, archived_at, deleted_at,
        featured_until, boost_until, created_at,
        tiers:gig_tiers(tier, title, price, delivery_days, revisions, features, is_active, description)
      `)
      .eq('provider_id', auth.profileId)
      .eq('provider_type', auth.role)
      .order('created_at', { ascending: false })
    if (retry.error) return fail(retry.error.message, 500)
    rowsResolved = retry.data
  } else if (error) {
    return fail(error.message, 500)
  }

  // Fetch metrics separately to avoid FK-join dependency on PostgREST cache
  const gigIds = (rowsResolved ?? []).map((r: any) => r.id)
  let metricsMap: Record<string, any> = {}
  if (gigIds.length > 0) {
    const { data: metricsRows } = await db
      .from('gig_metrics')
      .select('gig_id, impressions, clicks, saves')
      .in('gig_id', gigIds)
    for (const m of metricsRows ?? []) metricsMap[m.gig_id] = m
  }

  const allRows = rowsResolved ?? []

  // Build byStatus counts
  const byStatus: Record<string, number> = { draft: 0, active: 0, suspended: 0, archived: 0, deleted: 0 }
  for (const row of allRows) {
    const s = String(row.status || '')
    if (s in byStatus) byStatus[s]++
  }

  // count = non-deleted
  const count = allRows.filter((r: any) => r.status !== 'deleted').length

  const gigs = allRows.map((row: any) => {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      pitch: row.pitch,
      tagline: row.tagline ?? null,
      description: row.description ?? '',
      requirements: row.requirements ?? '',
      faq: Array.isArray(row.faq) ? row.faq : [],
      gallery_images: Array.isArray(row.gallery_images) ? row.gallery_images.slice(0, 3) : [],
      video_url: row.video_url ?? '',
      seo_title: row.seo_title ?? '',
      seo_description: row.seo_description ?? '',
      category: row.category,
      subcategory: row.subcategory,
      tags: row.tags,
      status: row.status,
      gig_status_reason: row.gig_status_reason,
      suspended_at: row.suspended_at,
      archived_at: row.archived_at,
      deleted_at: row.deleted_at,
      content_score: 0,
      featured_until: row.featured_until,
      boost_until: row.boost_until,
      tiers: Array.isArray(row.tiers) ? row.tiers : (row.tiers ? [row.tiers] : []),
      metrics: metricsMap[row.id] ?? null,
      promotion: null, // Not yet wired: gig_promotion_campaigns FK join pending PostgREST schema cache refresh
    }
  })

  return ok({ gigs, count, limit: resolvedLimit, byStatus })
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant'].includes(auth.role)) return fail('Forbidden.', 403)

  const db = auth.db

  // Dynamic limit — respects seller level and custom admin overrides
  const postLimit = await (async () => {
    try {
      const { data } = await db.rpc('get_provider_gig_limit', {
        p_provider_id:   auth.profileId,
        p_provider_type: auth.role,
      })
      return typeof data === 'number' ? data : 5
    } catch { return 5 }
  })()

  const { count } = await db
    .from('gigs')
    .select('id', { count: 'exact', head: true })
    .eq('provider_id', auth.profileId)
    .eq('provider_type', auth.role)
    .neq('status', 'deleted')
  if ((count ?? 0) >= postLimit) return fail(`You've reached your ${postLimit}-service limit. Delete or archive an existing service to create another. Grow to a higher seller level to unlock more slots.`, 409)

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Untitled service'
  const slug = `${buildSlug(title)}-${crypto.randomUUID().slice(0, 8)}`
  const status = 'draft' // new gigs always start as draft; use /publish to activate
  const category = String(body.category || body.subcategory || '').trim() || null
  const subcategory = String(body.subcategory || '').trim() || null
  const rawJurisdiction = String(body.jurisdiction || '').trim().toLowerCase()
  const jurisdiction = ['us', 'uk', 'ca'].includes(rawJurisdiction) ? rawJurisdiction : null
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 3) : []

  const insertPayload: Record<string, any> = {
    provider_id: auth.profileId,
    provider_type: auth.role,
    title,
    category,
    subcategory,
    jurisdiction,
    tags: Array.isArray(body.tags) ? body.tags.slice(0, 5) : [],
    pitch: body.pitch || body.tagline || '',
    tagline: body.tagline || body.pitch || '',
    description: body.description || '',
    requirements: body.requirements || '',
    faq: Array.isArray(body.faq) ? body.faq.slice(0, 10) : [],
    gallery_images: Array.isArray(body.gallery_images) ? body.gallery_images.slice(0, 3) : [],
    video_url: body.video_url || null,
    status,
    seo_title: body.seo_title || title,
    seo_description: body.seo_description || body.pitch || body.tagline || '',
    slug,
  }

  let { data: gig, error } = await db
    .from('gigs')
    .insert(insertPayload)
    .select('*')
    .single()

  // Self-heal: tagline (or any other) column missing — retry without it.
  // Run supabase/gigs_columns_patch.sql to restore full fidelity.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const match = error.message.match(/column "?([\w_]+)"? of relation/i) || error.message.match(/column "?([\w_]+)"? does not exist/i)
    const badCol = match?.[1]
    if (badCol && badCol in insertPayload) {
      delete insertPayload[badCol]
      const retry = await db.from('gigs').insert(insertPayload).select('*').single()
      gig = retry.data as any
      error = retry.error as any
    }
  }

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

  const { error: tierError } = await db.from('gig_tiers').insert(tierRows)
  if (tierError) return fail(tierError.message, 500)

  return ok({ gig }, { status: 201 })
}
