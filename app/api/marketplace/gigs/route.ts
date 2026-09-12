import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { buildCategoryOrFilter } from '@/lib/categories'
import { jurisdictionCountryOrFilter } from '@/lib/jurisdictionFilter'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { marketplaceGigSortOrder } from '@/lib/marketplaceGigSort'

const CACHE_TTL_SECONDS = 60
const NO_MATCH_GIG_ID = '00000000-0000-0000-0000-000000000000'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const url = new URL(req.url)

  // CPU-budget ordering (CF 1102): for anonymous traffic, hit the KV cache
  // BEFORE any Clerk cookie parsing or Supabase client creation. The cheap
  // session-cookie sniff routes visitors without a session straight to KV.
  const cookieHeader = req.headers.get('cookie') || ''
  const hasSessionCookie =
    cookieHeader.includes('__session') ||
    /(?:^|;\s*)__client_uat=(?!0(?:;|$))/.test(cookieHeader)
  let auth: Awaited<ReturnType<typeof getOptionalPortalUser>> = null
  let cacheKey: string | null = null
  if (!hasSessionCookie) {
    cacheKey = await generateVersionedCacheKey('gigs', '/api/marketplace/gigs', url.searchParams.toString())
    const cached = await getCached<Record<string, unknown>>(cacheKey, CACHE_TTL_SECONDS)
    if (cached) return ok(cached)
  } else {
    // Has a session cookie — resolve it (responses may include is_saved).
    auth = await getOptionalPortalUser()
    if (!auth) {
      cacheKey = await generateVersionedCacheKey('gigs', '/api/marketplace/gigs', url.searchParams.toString())
      const cached = await getCached<Record<string, unknown>>(cacheKey, CACHE_TTL_SECONDS)
      if (cached) return ok(cached)
    }
  }

  // Use authenticated db when available, otherwise create a shared admin client
  const db = auth ? auth.db : createSupabaseAdminClient()
  const q = (url.searchParams.get('q') || '').trim()
  const categories = url.searchParams.getAll('category').filter(Boolean)
  const providerTypes = url.searchParams.getAll('provider_type').filter(Boolean)
  const country = (url.searchParams.get('country') || '').toLowerCase()
  const sort = url.searchParams.get('sort') || 'relevance'
  const minPrice = url.searchParams.get('min_price')
  const maxPrice = url.searchParams.get('max_price')
  const minRating = url.searchParams.get('min_rating')
  const deliveryDays = url.searchParams.getAll('delivery_days').filter(Boolean)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(60, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = (page - 1) * limit

  // Search candidates come from the weighted DB search document when the
  // migration is available. Title + deliberate intent tags are A-weighted;
  // exact tag matches receive a small relevance bump in the RPC. We keep the
  // existing rank_score / quality sort as a secondary signal and never feed
  // raw search volume directly into gig ranking.
  const safeQ = q.length >= 2
    ? q.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    : ''
  let searchCandidateIds: string[] | null = null
  const searchRankById = new Map<string, number>()
  if (safeQ) {
    const searchDb = createSupabaseAdminClient()
    const matches = await searchDb.rpc('marketplace_search_matches', { p_query: safeQ, p_limit: 500 })
    if (!matches.error && Array.isArray(matches.data)) {
      searchCandidateIds = matches.data.map((row: any) => String(row.gig_id)).filter(Boolean)
      for (const row of matches.data) {
        if (row?.gig_id) searchRankById.set(String(row.gig_id), Number(row.text_rank || 0))
      }
    }
  }

  let query = db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email, username)', { count: 'exact' })
    .eq('status', 'active')

  if (safeQ) {
    if (searchCandidateIds) {
      query = searchCandidateIds.length > 0
        ? query.in('id', searchCandidateIds)
        : query.eq('id', NO_MATCH_GIG_ID)
    } else {
      // Deploy-order fallback while the migration/function cache catches up.
      // This preserves the pre-existing title/pitch/description behaviour;
      // tag search becomes available as soon as the migration workflow lands.
      query = query.or(`title.plfts.${safeQ},pitch.plfts.${safeQ},description.plfts.${safeQ}`)
    }
  }
  if (categories.length > 0) {
    // Category shelves are strict ranking/discovery surfaces. Uncategorized
    // legacy gigs remain available in the unfiltered Marketplace, but must not
    // be injected into every category and inflate unrelated service counts.
    const categoryOr = buildCategoryOrFilter(categories)
    if (categoryOr) query = query.or(categoryOr)
  }
  const validProviderTypes = providerTypes.filter(type => ['attorney', 'consultant'].includes(type))
  if (validProviderTypes.length === 1) query = query.eq('provider_type', validProviderTypes[0])
  else if (validProviderTypes.length > 1) query = query.in('provider_type', validProviderTypes)
  // OR-filter (not a plain `eq`) so NULL/invalid-jurisdiction gigs surface
  // under every country tab — same bucketing rule as the landing page.
  // A plain `eq` hid those rows from the drawer/discovery country tabs.
  if (['us', 'uk', 'ca', 'au'].includes(country)) query = query.or(jurisdictionCountryOrFilter(country))
  if (minRating) query = query.gte('avg_rating', parseFloat(minRating))

  if (sort === 'best_rated') query = query.gte('review_count', 3)
  // 'featured' filters the slice; the sort ORDER is applied below.
  if (sort === 'featured') query = query.not('featured_until', 'is', null)

  // Deterministic total-order pagination: every sort adds the stable `id`
  // tie-breaker so range(offset, …) never duplicates or omits a gig across
  // pages (see marketplaceGigSortOrder).
  for (const o of marketplaceGigSortOrder(sort)) {
    query = query.order(o.column, { ascending: o.ascending })
  }

  // For relevance searches the candidate set is capped at 500 by the search
  // RPC. Fetch that bounded set, blend text/tag relevance with the existing
  // quality signal, then paginate. Other sort modes keep the established DB
  // pagination semantics because the user explicitly chose that ordering.
  const relevanceSearch = Boolean(safeQ && searchCandidateIds && sort === 'relevance')
  const result = relevanceSearch
    ? await query.limit(500)
    : await query.range(offset, offset + limit - 1)
  const gigs = result.data
  const error = result.error
  const count = result.count
  if (error) return fail(error.message, 500)

  // Fetch saved gig IDs for client users to populate is_saved
  const savedGigIds = new Set<string>()
  if (auth && auth.role === 'client' && (gigs ?? []).length > 0) {
    const gigIds = (gigs ?? []).map((g: any) => g.id)
    const { data: saved } = await db
      .from('saved_gigs')
      .select('gig_id')
      .eq('client_profile_id', auth.profileId)
      .in('gig_id', gigIds)
    if (saved) saved.forEach((s: any) => savedGigIds.add(s.gig_id))
  }

  // Batch-resolve seller headshots (attorneys/consultants tables). profiles.avatar_url
  // is rarely the source of truth for verified sellers; without this join GigCard
  // fell through to initials even when headshot_url was set.
  const headshotByProfileId = new Map<string, string>()
  const providerIds = Array.from(new Set((gigs ?? []).map((g: any) => g.provider_id).filter(Boolean)))
  if (providerIds.length > 0) {
    const [attyHs, consHs] = await Promise.all([
      db.from('attorneys').select('profile_id, headshot_url').in('profile_id', providerIds),
      db.from('consultants').select('profile_id, headshot_url').in('profile_id', providerIds),
    ])
    for (const row of (attyHs.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
    for (const row of (consHs.data ?? []) as Array<{ profile_id: string; headshot_url: string | null }>) {
      if (row.headshot_url) headshotByProfileId.set(row.profile_id, row.headshot_url)
    }
  }

  let shaped = (gigs ?? [])
    .map((gig: any) => {
      const activeTiers = (gig.tiers || []).filter((t: any) => t.is_active)
      const cheapest = activeTiers.sort((a: any, b: any) => Number(a.price) - Number(b.price))[0]
      const gallery = normalizeGallery(gig.gallery_images)
      return {
        ...gig,
        // Coerce gallery_images so consumers can safely read [0]?.url
        // regardless of whether the row was written as strings (old
        // builder bug) or {url} objects (current shape). Also surface a
        // top-level cover_image_url so card components can grab the
        // resolved cover without re-implementing the lookup.
        gallery_images: gallery,
        cover_image_url: resolveCoverUrl(gig),
        provider_headshot_url: headshotByProfileId.get(gig.provider_id) || null,
        starting_price: cheapest?.price ?? null,
        delivery_days: cheapest?.delivery_days ?? null,
        new_badge: Number(gig.order_count || 0) < 5 && Number(gig.review_count || 0) < 3,
        is_saved: savedGigIds.has(gig.id),
      }
    })
    .filter((gig: any) => {
      // Apply client-side filters for complex conditions
      if (minPrice && gig.starting_price && Number(gig.starting_price) < Number(minPrice) * 100) return false
      if (maxPrice && gig.starting_price && Number(gig.starting_price) > Number(maxPrice) * 100) return false
      if (deliveryDays.length > 0 && gig.delivery_days) {
        const days = Number(gig.delivery_days)
        const matchesDelivery = deliveryDays.some(value => {
          const filterDays = Number(value)
          if (filterDays === 1) return days <= 1
          if (filterDays === 3) return days <= 3
          if (filterDays === 7) return days <= 7
          if (filterDays === 14) return days >= 14
          return true
        })
        if (!matchesDelivery) return false
      }
      return true
    })

  if (relevanceSearch) {
    shaped.sort((a: any, b: any) => {
      const textDelta = (searchRankById.get(b.id) || 0) - (searchRankById.get(a.id) || 0)
      if (Math.abs(textDelta) > 0.000001) return textDelta
      const qualityDelta = Number(b.rank_score || 0) - Number(a.rank_score || 0)
      if (qualityDelta !== 0) return qualityDelta
      return String(a.id).localeCompare(String(b.id))
    })
  }
  if (sort === 'price_asc') shaped.sort((a: any, b: any) => Number(a.starting_price || 0) - Number(b.starting_price || 0))
  if (sort === 'price_desc') shaped.sort((a: any, b: any) => Number(b.starting_price || 0) - Number(a.starting_price || 0))

  const total = relevanceSearch ? shaped.length : (count || 0)
  const pageGigs = relevanceSearch ? shaped.slice(offset, offset + limit) : shaped
  const payload = {
    gigs: pageGigs,
    total,
    page,
    limit,
    hasMore: offset + pageGigs.length < total,
  }
  if (cacheKey) await setCached(cacheKey, payload, CACHE_TTL_SECONDS)
  return ok(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}