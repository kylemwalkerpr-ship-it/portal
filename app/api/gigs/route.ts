import { ok, fail } from '@/lib/apiEnvelope'
import { buildUniqueSlug } from '@/lib/fiverr'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { requirePortalUser, getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { isCategoryAllowedForRole, isSubcategoryAllowedForRole } from '@/lib/categories'

export async function GET(req: Request) {
  const url = new URL(req.url)

  // CPU-budget ordering (CF 1102): anonymous visitors (no Clerk session
  // cookie) go straight to KV before any auth parsing or DB client creation.
  const cookieHeader = req.headers.get('cookie') || ''
  const hasSessionCookie =
    cookieHeader.includes('__session') ||
    /(?:^|;\s*)__client_uat=(?!0(?:;|$))/.test(cookieHeader)
  if (!hasSessionCookie) {
    const { getCached } = await import('@/lib/cache')
    const { generateVersionedCacheKey } = await import('@/lib/cache')
    const cacheKey = await generateVersionedCacheKey('gigs', '/api/gigs', 'public')
    const cached = await getCached<Record<string, unknown>>(cacheKey, 60)
    if (cached) return ok(cached)
  }

  const auth = await getOptionalPortalUser()
  const db = auth ? auth.db : createSupabaseAdminClient()

  // Public list endpoint — no auth required for browsing active gigs.
  // The response is identical for every public caller, so serve from KV.
  if (!auth || !['attorney', 'consultant'].includes(auth.role)) {
    const { getCached, setCached, generateVersionedCacheKey } = await import('@/lib/cache')
    const cacheKey = await generateVersionedCacheKey('gigs', '/api/gigs', 'public')
    const cached = await getCached<Record<string, unknown>>(cacheKey, 60)
    if (cached) return ok(cached)

    const { data: rows, error, count } = await db
      .from('gigs')
      .select('*, tiers:gig_tiers(*)', { count: 'exact' })
      .eq('status', 'active')
      .order('published_at', { ascending: false })
      .range(0, 99)

    if (error) return fail(error.message, 500)
    const payload = { gigs: rows ?? [], total: count ?? 0 }
    await setCached(cacheKey, payload, 60)
    return ok(payload)
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
      category, subcategory, jurisdiction, tags, status,
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
        id, slug, title, pitch, category, subcategory, jurisdiction, tags, status,
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
      jurisdiction: row.jurisdiction ?? null,
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
  const slug = await buildUniqueSlug(db, title)
  const status = 'draft' // new gigs always start as draft; use /publish to activate
  const category = String(body.category || body.subcategory || '').trim() || null
  const subcategory = String(body.subcategory || '').trim() || null

  // Category gate: legal categories require Bar vetting on attorneys /
  // attorney_applications, which consultants do not have.
  if (auth.role === 'consultant') {
    if (category && !isCategoryAllowedForRole(category, 'consultant') && !isSubcategoryAllowedForRole(category, 'consultant')) {
      return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
    }
    if (subcategory && !isSubcategoryAllowedForRole(subcategory, 'consultant')) {
      return fail('This category is restricted to attorneys. Choose a non-legal category from your gig builder.', 403)
    }
  }

  const rawJurisdiction = String(body.jurisdiction || '').trim().toLowerCase()
  const jurisdiction = ['us', 'uk', 'ca', 'au'].includes(rawJurisdiction) ? rawJurisdiction : null
  const tiers = Array.isArray(body.tiers) ? body.tiers.slice(0, 3) : []

  // gallery_images can arrive as strings (older builder code, third-party
  // imports), {url} objects, or mixed. normalizeGallery coerces every
  // entry into the canonical {url, name?, path?, size?} shape so every
  // marketplace renderer's gig.gallery_images[0]?.url access path
  // resolves correctly. cover_image_url mirrors the first entry so any
  // consumer that prefers that column (sellers/[id]/gigs, gig detail OG)
  // gets the right image without a second lookup.
  const normalizedGallery = normalizeGallery(body.gallery_images).slice(0, 3)
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
    gallery_images: normalizedGallery,
    cover_image_url: resolveCoverUrl({ gallery_images: normalizedGallery }),
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

  // Self-heal: any missing column — retry without it. Match both the
  // standard SQL "column ... does not exist" and PostgREST's
  // "Could not find the 'X' column of 'gigs' in the schema cache".
  // Run supabase/gigs_columns_patch.sql to restore full fidelity.
  while (error && /(does not exist|in the schema cache)/i.test(error.message || '')) {
    const msg = error.message
    const m =
      msg.match(/column "?([\w_]+)"? of relation/i) ||
      msg.match(/column "?([\w_]+)"? does not exist/i) ||
      msg.match(/Could not find the '([\w_]+)' column/i)
    const badCol = m?.[1]
    if (!badCol || !(badCol in insertPayload)) break
    delete insertPayload[badCol]
    const retry = await db.from('gigs').insert(insertPayload).select('*').single()
    gig = retry.data as any
    error = retry.error as any
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
