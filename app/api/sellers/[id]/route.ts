import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = createSupabaseAdminClient()

  // Resolve the seller by ANY of these ids in parallel:
  //   - attorneys.id        (legacy directory links)
  //   - consultants.id      (consultant cards)
  //   - profiles.id         (gig.provider_id and other profile-keyed call sites)
  // This makes /api/sellers/:id robust to whichever id the caller has on hand —
  // a Fiverr-scale prerequisite, since gigs / orders / messages all reference
  // different id surfaces.
  const [byAttorneyId, byConsultantId, byAttorneyProfileId, byConsultantProfileId] = await Promise.all([
    db.from('attorneys').select('*').eq('id', id).maybeSingle(),
    db.from('consultants').select('*').eq('id', id).maybeSingle(),
    db.from('attorneys').select('*').eq('profile_id', id).maybeSingle(),
    db.from('consultants').select('*').eq('profile_id', id).maybeSingle(),
  ])

  const attorney  = byAttorneyId.data  || byAttorneyProfileId.data
  const consultant = byConsultantId.data || byConsultantProfileId.data
  const provider = attorney || consultant
  if (!provider) {
    return fail('Seller not found', 404)
  }

  const profileId = provider.profile_id
  const role = attorney ? 'attorney' : 'consultant'
  // canonical seller id for the response = the attorney/consultant row id
  const canonicalId = provider.id

  // Get profile data
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, full_name, email, status, created_at')
    .eq('id', profileId)
    .single()

  if (profileError || !profile) {
    return fail('Profile not found', 404)
  }

  // Get application data for credential type
  let application = null
  if (role === 'attorney') {
    const { data: appData } = await db
      .from('attorney_applications')
      .select('credential_type, capacity, profile_url')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    application = appData
  }

  // Get ratings
  const ratingsTable = role === 'attorney' ? 'attorney_ratings' : 'consultant_ratings'
  const providerIdField = role === 'attorney' ? 'attorney_id' : 'consultant_id'

  const { data: ratings } = await db
    .from(ratingsTable)
    .select('stars')
    .eq(providerIdField, canonicalId)

  const ratingCount = ratings?.length || 0
  const ratingAvg = ratingCount > 0
    ? Number((ratings.reduce((sum: number, r: any) => sum + r.stars, 0) / ratingCount).toFixed(2))
    : null

  // Get gig stats (avg_rating / review_count / order_count are optional —
  // fall back to a minimal SELECT if any column is missing on the gigs table)
  let gigs: any[] = []
  let gigsRes = await db
    .from('gigs')
    .select('id, avg_rating, review_count, order_count')
    .eq('provider_id', profileId)
    .eq('status', 'active')
  if (gigsRes.error && /column .* does not exist/i.test(gigsRes.error.message || '')) {
    const fallback = await db
      .from('gigs')
      .select('id')
      .eq('provider_id', profileId)
      .eq('status', 'active')
    gigs = fallback.data ?? []
  } else {
    gigs = gigsRes.data ?? []
  }
  const totalGigs = gigs.length
  const totalOrders = gigs.reduce((sum: number, g: any) => sum + (g.order_count || 0), 0)

  // Calculate seller level
  let level: 'new' | 'level_1' | 'level_2' | 'top_rated' = 'new'
  if (ratingCount >= 10 && ratingAvg && ratingAvg >= 4.7 && totalOrders >= 20) {
    level = 'top_rated'
  } else if (ratingCount >= 5 && ratingAvg && ratingAvg >= 4.5 && totalOrders >= 10) {
    level = 'level_2'
  } else if (ratingCount >= 1 && ratingAvg && ratingAvg >= 4.0) {
    level = 'level_1'
  }

  // Determine if online (simplified - in production, use last_active timestamp)
  const is_online = provider.available !== false

  // Calculate response time (simplified - in production, track actual response times)
  const responseTime = '1 hour'

  const seller = {
    id: canonicalId,
    profile_id: profileId,
    role,
    full_name: profile.full_name || profile.email?.split('@')[0] || 'Seller',
    headshot_url: provider.headshot_url,
    tagline: provider.tagline,
    bio: provider.bio,
    intro: provider.intro,
    jurisdictions: provider.jurisdictions,
    practice_areas: provider.practice_areas,
    specialties: provider.specialties,
    languages: provider.languages,
    credential_type: application?.credential_type,
    years_experience: provider.years_experience,
    starting_price: provider.starting_price,
    offers_free_consult: provider.offers_free_consult,
    capacity: application?.capacity,
    profile_url: application?.profile_url,
    timezone: provider.timezone,
    available: provider.available !== false,
    member_since: profile.created_at,
    rating_count: ratingCount,
    rating_avg: ratingAvg,
    response_time: responseTime,
    is_online,
    total_orders: totalOrders,
    total_gigs: totalGigs,
    verified: profile.status === 'active',
    level,
  }

  return ok({ seller })
}
