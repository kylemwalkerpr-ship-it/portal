import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { isAttorneyCredentialPublic, resolveAttorneyCredential } from '@/lib/attorneyCredential'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = createSupabaseAdminClient()

  const [byAttorneyId, byConsultantId, byAttorneyProfileId, byConsultantProfileId] = await Promise.all([
    db.from('attorneys').select('*').eq('id', id).maybeSingle(),
    db.from('consultants').select('*').eq('id', id).maybeSingle(),
    db.from('attorneys').select('*').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('consultants').select('*').eq('profile_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const attorney = byAttorneyId.data || byAttorneyProfileId.data
  const consultant = byConsultantId.data || byConsultantProfileId.data
  const provider = attorney || consultant

  if (provider) {
    const profileId = provider.profile_id
    const role = attorney ? 'attorney' : 'consultant'
    const canonicalId = provider.id

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('id, full_name, email, status, created_at')
      .eq('id', profileId)
      .single()

    if (profileError || !profile) return fail('Profile not found', 404)

    let application: any = null
    let credentialType: string | null = null
    let credentialNumber: string | null = null
    let credentialJurisdiction: string | null = null

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
      const credential = await resolveAttorneyCredential(db, profileId)
      credentialType = credential.credential_type || (appData?.credential_type ?? null)
      if (credential.bar_number && isAttorneyCredentialPublic(credential)) {
        credentialNumber = credential.bar_number
        credentialJurisdiction = credential.bar_state || null
      }
    } else {
      const providerChoice = consultant.show_registration_number !== false
      const effectiveVisibility = consultant.admin_show_registration_number_override ?? providerChoice
      if (effectiveVisibility && consultant.registration_number) {
        credentialNumber = String(consultant.registration_number)
      }
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
    const gigsRes = await db
      .from('gigs')
      .select('id, avg_rating, review_count, order_count')
      .eq('provider_id', profileId)
      .eq('status', 'active')
    if (gigsRes.error && /column .* does not exist/i.test(gigsRes.error.message || '')) {
      const fallback = await db.from('gigs').select('id').eq('provider_id', profileId).eq('status', 'active')
      gigs = fallback.data ?? []
    } else {
      gigs = gigsRes.data ?? []
    }
    const totalGigs = gigs.length
    const totalOrders = gigs.reduce((sum: number, g: any) => sum + (g.order_count || 0), 0)

    let level: 'new' | 'level_1' | 'level_2' | 'top_rated' = 'new'
    if (ratingCount >= 10 && ratingAvg && ratingAvg >= 4.7 && totalOrders >= 20) level = 'top_rated'
    else if (ratingCount >= 5 && ratingAvg && ratingAvg >= 4.5 && totalOrders >= 10) level = 'level_2'
    else if (ratingCount >= 1 && ratingAvg && ratingAvg >= 4.0) level = 'level_1'

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
      credential_type: credentialType ?? application?.credential_type ?? null,
      // This is the only public API field that carries the identifier. It is
      // consumed exclusively by the provider About/bio card and is already
      // filtered through provider choice + admin override.
      credential_number: credentialNumber,
      credential_jurisdiction: credentialJurisdiction,
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
      response_time: '1 hour',
      is_online: provider.available !== false,
      total_orders: totalOrders,
      total_gigs: totalGigs,
      verified: profile.status === 'active',
      level,
    }

    return ok({ seller })
  }

  const { data: anyProfile, error: anyProfileError } = await db
    .from('profiles')
    .select('id, full_name, email, avatar_url, country, role, status, created_at')
    .eq('id', id)
    .maybeSingle()

  if (anyProfileError || !anyProfile) return fail('Seller not found', 404)

  const isBuyer = ['client', 'student'].includes(String(anyProfile.role || ''))
  let inquiryCount = 0
  if (isBuyer) {
    const { count } = await db
      .from('inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('client_profile_id', anyProfile.id)
    inquiryCount = count ?? 0
  }

  const wireRole = isBuyer ? 'client' : (String(anyProfile.role || '').trim() || 'client')
  return ok({
    seller: {
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
      credential_number: null,
      credential_jurisdiction: null,
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
    },
  })
}
