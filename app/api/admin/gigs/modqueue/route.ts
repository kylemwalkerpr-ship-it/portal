import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

const GIG_SELECT =
  'id, slug, title, status, gig_status_reason, provider_id, provider_type, ' +
  'category, subcategory, tags, pitch, tagline, description, gallery_images, ' +
  'requirements, faq, seo_title, content_score, rank_score, ' +
  'auto_flag_score, auto_flag_reasons, auto_flagged_at, ' +
  'denial_reason, denial_category, appeal_reason, appeal_submitted_at, ' +
  'suspended_at, suspended_by, archived_at, ' +
  'published_at, created_at, updated_at, ' +
  'tiers:gig_tiers(id, tier, title, price, delivery_days, revisions, is_active)'

async function enrichGigs(db: any, gigs: any[]) {
  if (!gigs.length) return []

  const providerIds = [...new Set(gigs.map((g: any) => g.provider_id).filter(Boolean))]
  const gigIds = gigs.map((g: any) => g.id)

  const [{ data: profiles }, { data: metrics }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, role, status').in('id', providerIds),
    db.from('gig_metrics').select('gig_id, impressions, clicks, click_through_rate, saves').in('gig_id', gigIds),
  ])

  const profileMap: Record<string, any> = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  const metricsMap: Record<string, any> = {}
  for (const m of metrics ?? []) metricsMap[m.gig_id] = m

  return gigs.map((g: any) => {
    const provider = profileMap[g.provider_id] || null
    const m = metricsMap[g.id] || null
    const tiers = Array.isArray(g.tiers) ? g.tiers : []
    const activeTiers = tiers.filter((t: any) => t.is_active)
    return {
      ...g,
      provider: provider
        ? { name: provider.full_name, email: provider.email, role: provider.role, status: provider.status }
        : null,
      metrics: {
        impressions: m?.impressions ?? 0,
        clicks: m?.clicks ?? 0,
        saves: m?.saves ?? 0,
        ctr: m?.click_through_rate ?? 0,
      },
      tiers,
      tier_count: activeTiers.length,
      min_price: activeTiers.length ? Math.min(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0,
      max_price: activeTiers.length ? Math.max(...activeTiers.map((t: any) => Number(t.price) || 0)) : 0,
    }
  })
}

export async function GET(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const warnings: string[] = []

  // pending_review gigs
  let pendingReview: any[] = []
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select(GIG_SELECT)
      .eq('status', 'pending_review')
      .order('created_at', { ascending: true })
    if (error) warnings.push(`pending_review fetch: ${error.message}`)
    else pendingReview = await enrichGigs(auth.db, data ?? [])
  } catch (e: any) {
    warnings.push(`pending_review: ${e?.message}`)
  }

  // appeal_pending gigs
  let appeals: any[] = []
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select(GIG_SELECT)
      .eq('status', 'appeal_pending')
      .order('appeal_submitted_at', { ascending: true })
    if (error) warnings.push(`appeal_pending fetch: ${error.message}`)
    else appeals = await enrichGigs(auth.db, data ?? [])
  } catch (e: any) {
    warnings.push(`appeals: ${e?.message}`)
  }

  // auto_flagged active gigs (score > 30)
  let autoFlagged: any[] = []
  try {
    const { data, error } = await auth.db
      .from('gigs')
      .select(GIG_SELECT)
      .eq('status', 'active')
      .gt('auto_flag_score', 30)
      .order('auto_flag_score', { ascending: false })
    if (error) warnings.push(`auto_flagged fetch: ${error.message}`)
    else autoFlagged = await enrichGigs(auth.db, data ?? [])
  } catch (e: any) {
    warnings.push(`auto_flagged: ${e?.message}`)
  }

  // open moderation_queue rows
  let moderationQueue: any[] = []
  try {
    const { data, error } = await auth.db
      .from('moderation_queue')
      .select(
        'id, target_table, target_id, reason, status, flag_type, priority, ' +
        'assigned_to, resolved_at, resolved_by, notes, created_at'
      )
      .eq('status', 'open')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) warnings.push(`moderation_queue fetch: ${error.message}`)
    else moderationQueue = data ?? []
  } catch (e: any) {
    warnings.push(`moderation_queue: ${e?.message}`)
  }

  return ok({
    pending_review: pendingReview,
    appeals,
    auto_flagged: autoFlagged,
    moderation_queue: moderationQueue,
    counts: {
      pending_review: pendingReview.length,
      appeals: appeals.length,
      auto_flagged: autoFlagged.length,
      queue: moderationQueue.length,
    },
    ...(warnings.length ? { data_warnings: warnings } : {}),
  })
}
