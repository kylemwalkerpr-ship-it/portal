import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'
import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { getCategoryFilterTerms } from '@/lib/categories'
import { normalizeGallery, resolveCoverUrl } from '@/lib/galleryImages'
import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const CACHE_TTL_SECONDS = 60

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

  let query = db
    .from('gigs')
    .select('*, tiers:gig_tiers(*), provider:profiles!gigs_provider_id_fkey(id, full_name, email, username)', { count: 'exact' })
    .eq('status', 'active')

  if (q.length >= 2) {
    // FTS across title, pitch, description — each has a dedicated GIN index.
    // Use plainto_tsquery (PostgREST `plfts`): to_tsquery (`.fts.`) parses `-`
    // as the NOT operator, so a user query like "F-1 denial" or "h-1b visa"
    // raised "syntax error in tsquery" → 500. plfts treats the input as plain
    // text (safe for any user input). Only PostgREST filter-structural chars
    // (`, ( ) " ' \`) are stripped so the .or() filter itself stays parseable.
    const safeQ = q.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (safeQ) {
      query = query.or(`title.plfts.${safeQ},pitch.plfts.${safeQ},description.plfts.${safeQ}`)
    }
  }
  if (categories.length > 0) {
    const terms = Array.from(new Set(categories.flatMap(category => getCategoryFilterTerms(category))))
    if (terms.length > 0) query = query.in('category', terms)
  }
  const validProviderTypes = providerTypes.filter(type => ['attorney', 'consultant'].includes(type))
  if (validProviderTypes.length === 1) query = query.eq('provider_type', validProviderTypes[0])
  else if (validProviderTypes.length > 1) query = query.in('provider_type', validProviderTypes)
  if (['us', 'uk', 'ca', 'au'].includes(country)) query = query.eq('jurisdiction', country)
  if (minRating) query = query.gte('avg_rating', parseFloat(minRating))

  if (sort === 'best_rated') query = query.gte('review_count', 3).order('avg_rating', { ascending: false })
  else if (sort === 'most_orders') query = query.order('order_count', { ascending: false })
  else if (sort === 'newest') query = query.order('published_at', { ascending: false })
  else if (sort === 'featured') query = query.not('featured_until', 'is', null).order('featured_until', { ascending: false })
  else if (sort === 'trending') query = query.order('rank_score', { ascending: false }).order('order_count', { ascending: false })
  else query = query.order('rank_score', { ascending: false }).order('published_at', { ascending: false })

  const { data: gigs, error, count } = await query.range(offset, offset + limit - 1)
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

  const shaped = (gigs ?? [])
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

  if (sort === 'price_asc') shaped.sort((a: any, b: any) => Number(a.starting_price || 0) - Number(b.starting_price || 0))
  if (sort === 'price_desc') shaped.sort((a: any, b: any) => Number(b.starting_price || 0) - Number(a.starting_price || 0))

  const payload = {
    gigs: shaped,
    total: count || 0,
    page,
    limit,
    hasMore: offset + shaped.length < (count || 0),
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
