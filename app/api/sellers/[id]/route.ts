import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveAttorneyCredential } from '@/lib/attorneyCredential'

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

  // ── Seller branch (attorney / consultant) ────────────────────────────
  if (provider) {
    const profileId = provider.profile_id
    const role = attorney ? 'attorney' : 'consultant'
    const canonicalId = provider.id

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, full_name, email, status, created_at')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) {
      return fail('Profile not found', 404)
    }

    let application = null
    let credentialType: string | null = null
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
      // Editable credential off the attorneys row wins over the application.
      const credential = await resolveAttorneyCredential(db, profileId)
      credentialType = credential.credential_type || (appData?.credential_type ?? null)
    }

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

    let level: 'new' | 'level_1' | 'level_2' | 'top_rated' = 'new'
    if (ratingCount >= 10 && ratingAvg && ratingAvg >= 4.7 && totalOrders >= 20) {
      level = 'top_rated'
    } else if (ratingCount >= 5 && ratingAvg && ratingAvg >= 4.5 && totalOrders >= 10) {
      level = 'level_2'
    } else if (ratingCount >= 1 && ratingAvg && ratingAvg >= 4.0) {
      level = 'level_1'
    }

    const is_online = provider.available !== false
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
      subjects: provider.subjects ?? null,
      industries: provider.industries ?? null,
      specialties: provider.specialties,
      languages: provider.languages,
      credential_type: credentialType ?? application?.credential_type,
      years_experience: provider.years_experience,
      starting_price: provider.starting_price,
      offers_free_consult: provider.offers_free_consult,
      consult_booking_url: provider.consult_booking_url ?? null,
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

  // ── Profile fall-through ─────────────────────────────────────────────
  // Previously this branch required role IN ('client', 'student') and
  // 404'd everyone else — producing the "Profile not found" empty
  // state in the message preview drawer whenever the counterpart was
  // an unprovisioned attorney/consultant (a profiles row exists but
  // no attorneys/consultants row yet), an admin, support agent, or
  // anyone created via an older sign-up path that wrote a different
  // role string. Widen to ANY profile row, then label it by role.
  const { data: anyProfile, error: anyProfileError } = await db
    .from('profiles')
    .select('id, full_name, email, avatar_url, country, role, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (anyProfileError || !anyProfile) {
    return fail('Seller not found', 404)
  }

  // Inquiry count is only meaningful for client/student profiles —
  // skip the query for staff/admin/etc. to keep the response cheap.
  const isBuyer = ['client', 'student'].includes(String(anyProfile.role || ''))
  let inquiryCount = 0
  if (isBuyer) {
    const { count } = await db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('client_profile_id', anyProfile.id)
    inquiryCount = count ?? 0
  }

  // The drawer only renders three branches (client / attorney /
  // consultant). Collapse anything that isn't a known seller role to
  // 'client' on the wire so the chip still renders.
  const wireRole = isBuyer ? 'client' : (String(anyProfile.role || '').trim() || 'client')

  const clientSeller = {
    id: anyProfile.id,
    profile_id: anyProfile.id,
    role: wireRole,
    full_name: anyProfile.full_name || anyProfile.email?.split('@')[0] || 'User',
    headshot_url: anyProfile.avatar_url,
    tagline: null,
    bio: null,
    intro: null,
    jurisdictions: null,
    practice_areas: null,
    subjects: null,
    industries: null,
    specialties: null,
    languages: null,
    credential_type: null,
    years_experience: null,
    starting_price: null,
    offers_free_consult: null,
    consult_booking_url: null,
    capacity: null,
    profile_url: null,
    timezone: null,
    available: false,
    member_since: anyProfile.created_at,
    rating_count: 0,
    rating_avg: null,
    response_time: null,
    is_online: false,
    total_orders: 0,
    total_gigs: 0,
    verified: anyProfile.status === 'active',
    level: 'new' as const,
    inquiry_count: inquiryCount,
  }

  return ok({ seller: clientSeller })
}
