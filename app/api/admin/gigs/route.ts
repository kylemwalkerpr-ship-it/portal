import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const statusFilter   = searchParams.get('status')
  const providerType   = searchParams.get('provider_type')
  const categoryFilter = searchParams.get('category')
  const searchQ        = searchParams.get('q')?.toLowerCase()
  const includeDeleted = searchParams.get('include_deleted') === 'true'

  // Fetch gigs with tiers
  let query = auth.db
    .from('gigs')
    .select(
      'id, slug, title, status, gig_status_reason, provider_id, provider_type, ' +
      'suspended_at, suspended_by, archived_at, deleted_at, deleted_by, ' +
      'last_status_changed_at, category, subcategory, tags, pitch, description, ' +
      'gallery_images, requirements, faq, seo_title, seo_description, ' +
      'content_score, featured_until, boost_until, ' +
      'created_at, updated_at, ' +
      'tiers:gig_tiers(id, tier, title, price, delivery_days, revisions, is_active)'
    )
    .order('created_at', { ascending: false })

  if (!includeDeleted) query = query.is('deleted_at', null)
  if (statusFilter)   query = query.eq('status', statusFilter)
  if (providerType)   query = query.eq('provider_type', providerType)
  if (categoryFilter) query = query.eq('category', categoryFilter)

  const { data: gigsRaw, error } = await query
  if (error) return fail(error.message, 500)

  const gigs = gigsRaw ?? []
  if (gigs.length === 0) return ok({ gigs: [], total: 0, byStatus: {}, categories: [] })

  // Fetch provider profiles
  const providerIds = [...new Set(gigs.map((g: any) => g.provider_id).filter(Boolean))]
  const { data: profiles } = await auth.db
    .from('profiles')
    .select('id, full_name, email, role, status')
    .in('id', providerIds)
  const profileMap: Record<string, any> = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  // Fetch metrics
  const gigIds = gigs.map((g: any) => g.id)
  const { data: metrics } = await auth.db
    .from('gig_metrics')
    .select('gig_id, impressions, clicks, saves')
    .in('gig_id', gigIds)
  const metricsMap: Record<string, any> = {}
  for (const m of metrics ?? []) metricsMap[m.gig_id] = m

  // Fetch most-recent audit entries per gig (moderation history)
  const { data: auditRows } = await auth.db
    .from('admin_audit_log')
    .select('target_id, action_type, reason, created_at')
    .eq('target_table', 'gigs')
    .in('target_id', gigIds)
    .order('created_at', { ascending: false })
  const auditMap: Record<string, any[]> = {}
  for (const row of auditRows ?? []) {
    if (!auditMap[row.target_id]) auditMap[row.target_id] = []
    if (auditMap[row.target_id].length < 5) auditMap[row.target_id].push(row)
  }

  // Fetch suspender name when applicable
  const suspenderIds = [...new Set(gigs.map((g: any) => g.suspended_by).filter(Boolean))]
  const { data: suspenders } = suspenderIds.length
    ? await auth.db.from('profiles').select('id, full_name, email').in('id', suspenderIds)
    : { data: [] }
  const suspenderMap: Record<string, any> = {}
  for (const s of suspenders ?? []) suspenderMap[s.id] = s

  // Build enriched gig list
  let enriched: any[] = gigs.map((g: any) => {
    const provider  = profileMap[g.provider_id] || null
    const m         = metricsMap[g.id] || null
    const tiers     = Array.isArray(g.tiers) ? g.tiers : []
    const activeTiers = tiers.filter((t: any) => t.is_active)
    const minPrice  = activeTiers.length ? Math.min(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0
    const maxPrice  = activeTiers.length ? Math.max(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0
    const suspender = g.suspended_by ? suspenderMap[g.suspended_by] : null
    return {
      id:            g.id,
      slug:          g.slug,
      title:         g.title,
      pitch:         g.pitch,
      description:   g.description,
      status:        g.status,
      gig_status_reason: g.gig_status_reason,
      provider_type: g.provider_type,
      provider_id:   g.provider_id,
      provider:      provider ? { name: provider.full_name, email: provider.email, role: provider.role, status: provider.status } : null,
      category:      g.category,
      subcategory:   g.subcategory,
      tags:          g.tags,
      gallery_images: g.gallery_images,
      requirements:  g.requirements,
      faq:           g.faq,
      seo_title:     g.seo_title,
      seo_description: g.seo_description,
      content_score: g.content_score,
      featured_until: g.featured_until,
      boost_until:   g.boost_until,
      tiers,
      tier_count:    activeTiers.length,
      min_price:     minPrice,
      max_price:     maxPrice,
      impressions:   m?.impressions ?? 0,
      clicks:        m?.clicks ?? 0,
      saves:         m?.saves ?? 0,
      ctr:           m?.impressions ? ((m.clicks / m.impressions) * 100).toFixed(1) : '0.0',
      suspended_at:  g.suspended_at,
      suspended_by_name: suspender?.full_name || suspender?.email || null,
      archived_at:   g.archived_at,
      deleted_at:    g.deleted_at,
      last_status_changed_at: g.last_status_changed_at,
      created_at:    g.created_at,
      updated_at:    g.updated_at,
      audit_log:     auditMap[g.id] || [],
    }
  })

  // Client-side search filter
  if (searchQ) {
    enriched = enriched.filter(g =>
      g.title?.toLowerCase().includes(searchQ) ||
      g.slug?.toLowerCase().includes(searchQ) ||
      g.category?.toLowerCase().includes(searchQ) ||
      g.provider?.name?.toLowerCase().includes(searchQ) ||
      g.provider?.email?.toLowerCase().includes(searchQ)
    )
  }

  // Build summary counts
  const byStatus: Record<string, number> = {}
  for (const g of enriched) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1
  }

  const categories = [...new Set(enriched.map(g => g.category).filter(Boolean))].sort()

  return ok({ gigs: enriched, total: enriched.length, byStatus, categories })
}
