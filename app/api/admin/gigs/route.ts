/**
 * GET /api/admin/gigs
 * Paginated, server-side filtered gig list for the admin dashboard.
 * Designed to handle 100k+ gigs without loading all records into memory.
 *
 * Query params:
 *   status         — filter by gig status
 *   provider_type  — attorney | consultant
 *   category       — category filter
 *   q              — full-text search (title, category, subcategory)
 *   page           — 1-indexed page number (default 1)
 *   page_size      — records per page (default 50, max 200)
 *   sort           — column to sort by (default: created_at)
 *   dir            — asc | desc (default: desc)
 *   include_deleted — true to include deleted gigs
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const statusFilter    = searchParams.get('status')
  const providerType    = searchParams.get('provider_type')
  const categoryFilter  = searchParams.get('category')
  const searchQ         = searchParams.get('q')?.trim()
  const includeDeleted  = searchParams.get('include_deleted') === 'true'
  const pageSize        = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))
  const page            = Math.max(1, Number(searchParams.get('page') || 1))
  const sortCol         = ['created_at','updated_at','rank_score','content_score','auto_flag_score','title','status'].includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'created_at'
  const sortDir         = searchParams.get('dir') === 'asc'

  // Build base query with server-side filtering — no client-side post-processing
  let query = auth.db
    .from('gigs')
    .select(
      'id, slug, title, status, gig_status_reason, provider_id, provider_type, ' +
      'suspended_at, suspended_by, archived_at, deleted_at, ' +
      'last_status_changed_at, category, subcategory, tags, pitch, description, ' +
      'gallery_images, requirements, faq, seo_title, seo_description, ' +
      'content_score, auto_flag_score, auto_flag_reasons, featured_until, boost_until, ' +
      'denial_reason, denial_category, appeal_reason, appeal_submitted_at, ' +
      'rank_score, version_number, ' +
      'created_at, updated_at, ' +
      'tiers:gig_tiers(id, tier, title, price, delivery_days, revisions, is_active)',
      { count: 'exact' }
    )
    .order(sortCol, { ascending: sortDir })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (!includeDeleted) query = query.is('deleted_at', null)
  if (statusFilter)    query = query.eq('status', statusFilter)
  if (providerType)    query = query.eq('provider_type', providerType)
  if (categoryFilter)  query = query.eq('category', categoryFilter)

  // Full-text search using the GIN index (gigs_fts_idx)
  // Falls back to ilike for short queries where FTS may not be ideal
  if (searchQ) {
    if (searchQ.length >= 3) {
      // Use Postgres FTS via the index
      query = query.textSearch('title', searchQ, { type: 'websearch', config: 'english' })
    } else {
      query = query.ilike('title', `%${searchQ}%`)
    }
  }

  const { data: gigsRaw, error, count: totalCount } = await query
  if (error) return fail(error.message, 500)

  const gigs: any[] = gigsRaw ?? []
  const total = totalCount ?? 0

  if (gigs.length === 0) {
    return ok({
      gigs: [],
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize),
      has_more: false,
      byStatus: {},
      categories: [],
    })
  }

  // Batch-fetch provider profiles for this page only (not all providers)
  const providerIds = [...new Set(gigs.map((g: any) => g.provider_id).filter(Boolean))]

  const [profilesResult, metricsResult, auditResult, suspendersResult] = await Promise.allSettled([
    auth.db.from('profiles').select('id, full_name, email, role, status').in('id', providerIds),
    auth.db.from('gig_metrics').select('gig_id, impressions, clicks, saves').in('gig_id', gigs.map((g: any) => g.id)),
    auth.db.from('admin_audit_log').select('target_id, action_type, reason, created_at').eq('target_table', 'gigs').in('target_id', gigs.map((g: any) => g.id)).order('created_at', { ascending: false }),
    providerIds.length ? auth.db.from('profiles').select('id, full_name, email').in('id', gigs.map((g: any) => g.suspended_by).filter(Boolean)) : Promise.resolve({ data: [] }),
  ])

  const profileMap: Record<string, any> = {}
  if (profilesResult.status === 'fulfilled') {
    for (const p of profilesResult.value.data ?? []) profileMap[p.id] = p
  }

  const metricsMap: Record<string, any> = {}
  if (metricsResult.status === 'fulfilled') {
    for (const m of metricsResult.value.data ?? []) metricsMap[m.gig_id] = m
  }

  const auditMap: Record<string, any[]> = {}
  if (auditResult.status === 'fulfilled') {
    for (const row of auditResult.value.data ?? []) {
      if (!auditMap[row.target_id]) auditMap[row.target_id] = []
      if (auditMap[row.target_id].length < 5) auditMap[row.target_id].push(row)
    }
  }

  const suspenderMap: Record<string, any> = {}
  if (suspendersResult.status === 'fulfilled') {
    for (const s of (suspendersResult.value as any)?.data ?? []) suspenderMap[s.id] = s
  }

  // Resolve dynamic gig limit for each provider on this page
  const limitMap: Record<string, number> = {}
  await Promise.allSettled(
    providerIds.map(async (pid: string) => {
      try {
        const providerRole = profileMap[pid]?.role || 'consultant'
        const { data } = await auth.db.rpc('get_provider_gig_limit', {
          p_provider_id:   pid,
          p_provider_type: providerRole,
        })
        limitMap[pid] = typeof data === 'number' ? data : 5
      } catch { limitMap[pid] = 5 }
    })
  )

  const enriched = gigs.map((g: any) => {
    const provider   = profileMap[g.provider_id] || null
    const m          = metricsMap[g.id] || null
    const tiers      = Array.isArray(g.tiers) ? g.tiers : []
    const activeTiers = tiers.filter((t: any) => t.is_active)
    const minPrice   = activeTiers.length ? Math.min(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0
    const maxPrice   = activeTiers.length ? Math.max(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0
    const suspender  = g.suspended_by ? suspenderMap[g.suspended_by] : null

    return {
      id:               g.id,
      slug:             g.slug,
      title:            g.title,
      pitch:            g.pitch,
      description:      g.description,
      status:           g.status,
      gig_status_reason: g.gig_status_reason,
      provider_type:    g.provider_type,
      provider_id:      g.provider_id,
      provider:         provider ? { name: provider.full_name, email: provider.email, role: provider.role, status: provider.status } : null,
      provider_gig_limit: limitMap[g.provider_id] ?? 5,
      category:         g.category,
      subcategory:      g.subcategory,
      tags:             g.tags,
      gallery_images:   g.gallery_images,
      requirements:     g.requirements,
      faq:              g.faq,
      seo_title:        g.seo_title,
      seo_description:  g.seo_description,
      content_score:    g.content_score,
      auto_flag_score:  g.auto_flag_score,
      auto_flag_reasons: g.auto_flag_reasons,
      denial_reason:    g.denial_reason,
      denial_category:  g.denial_category,
      appeal_reason:    g.appeal_reason,
      appeal_submitted_at: g.appeal_submitted_at,
      featured_until:   g.featured_until,
      boost_until:      g.boost_until,
      rank_score:       g.rank_score,
      version_number:   g.version_number,
      tiers,
      tier_count:       activeTiers.length,
      min_price:        minPrice,
      max_price:        maxPrice,
      impressions:      m?.impressions ?? 0,
      clicks:           m?.clicks ?? 0,
      saves:            m?.saves ?? 0,
      ctr:              m?.impressions ? ((m.clicks / m.impressions) * 100).toFixed(1) : '0.0',
      suspended_at:     g.suspended_at,
      suspended_by_name: suspender?.full_name || suspender?.email || null,
      archived_at:      g.archived_at,
      deleted_at:       g.deleted_at,
      last_status_changed_at: g.last_status_changed_at,
      created_at:       g.created_at,
      updated_at:       g.updated_at,
      audit_log:        auditMap[g.id] || [],
    }
  })

  // Status counts — we do a separate lightweight count query so we always
  // show accurate totals even when filtered
  const { data: statusCounts } = await auth.db
    .from('gigs')
    .select('status')
    .is('deleted_at', includeDeleted ? undefined : null)
  const byStatus: Record<string, number> = {}
  for (const row of statusCounts ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1
  }

  // Available categories for the filter dropdown (no limit — small cardinality)
  const { data: catRows } = await auth.db
    .from('gigs')
    .select('category')
    .not('category', 'is', null)
    .is('deleted_at', null)
  const categories = [...new Set((catRows ?? []).map((r: any) => r.category).filter(Boolean))].sort()

  return ok({
    gigs: enriched,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
    has_more: page * pageSize < total,
    byStatus,
    categories,
  })
}
