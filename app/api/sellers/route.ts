import { ok, fail } from '@/lib/apiEnvelope'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchAttorneyCredentialColumnsBatch } from '@/lib/attorneyCredential'

export async function GET() {
  const db = createSupabaseAdminClient()

  // Get all attorneys
  const { data: attorneys, error: attorneyError } = await db
    .from('attorneys')
    .select('id, profile_id, headshot_url, tagline, bio, intro, jurisdictions, practice_areas, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')

  // Get all consultants
  const { data: consultants, error: consultantError } = await db
    .from('consultants')
    .select('id, profile_id, headshot_url, tagline, bio, intro, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')

  if (attorneyError || consultantError) {
    return fail('Failed to load sellers', 500)
  }

  const allProfileIds = [
    ...(attorneys || []).map((a: any) => a.profile_id),
    ...(consultants || []).map((c: any) => c.profile_id),
  ]

  // Get all profiles
  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, email, status, created_at')
    .in('id', allProfileIds)

  const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))

  // Get attorney applications
  const attorneyProfileIds = (attorneys || []).map((a: any) => a.profile_id)
  const { data: attorneyApps } = await db
    .from('attorney_applications')
    .select('profile_id, credential_type, capacity, profile_url')
    .in('profile_id', attorneyProfileIds)
    .eq('status', 'approved')

  const appByProfile = new Map((attorneyApps || []).map((a: any) => [a.profile_id, a]))
  // Editable credential off the attorneys row wins over the application copy.
  const credentialByProfile = await fetchAttorneyCredentialColumnsBatch(db, attorneyProfileIds)

  // Get ratings for all providers
  const attorneyIds = (attorneys || []).map((a: any) => a.id)
  const consultantIds = (consultants || []).map((c: any) => c.id)

  const [{ data: attorneyRatings }, { data: consultantRatings }] = await Promise.all([
    db.from('attorney_ratings').select('attorney_id, stars').in('attorney_id', attorneyIds),
    db.from('consultant_ratings').select('consultant_id, stars').in('consultant_id', consultantIds),
  ])

  const ratingByAttorney = new Map<string, { count: number; sum: number }>()
  for (const r of attorneyRatings || []) {
    const cur = ratingByAttorney.get(r.attorney_id) ?? { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += r.stars
    ratingByAttorney.set(r.attorney_id, cur)
  }

  const ratingByConsultant = new Map<string, { count: number; sum: number }>()
  for (const r of consultantRatings || []) {
    const cur = ratingByConsultant.get(r.consultant_id) ?? { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += r.stars
    ratingByConsultant.set(r.consultant_id, cur)
  }

  // Get gig stats for all providers
  const { data: gigs } = await db
    .from('gigs')
    .select('provider_id, avg_rating, review_count, order_count')
    .eq('status', 'active')

  const gigStatsByProfile = new Map<string, { totalGigs: number; totalOrders: number }>()
  for (const gig of gigs || []) {
    const cur = gigStatsByProfile.get(gig.provider_id) ?? { totalGigs: 0, totalOrders: 0 }
    cur.totalGigs += 1
    cur.totalOrders += gig.order_count || 0
    gigStatsByProfile.set(gig.provider_id, cur)
  }

  // Build seller list
  const sellers = []

  for (const attorney of attorneys || []) {
    const profile = profileById.get(attorney.profile_id)
    if (!profile || profile.status !== 'active') continue

    const app = appByProfile.get(attorney.profile_id)
    const r = ratingByAttorney.get(attorney.id)
    const gigStats = gigStatsByProfile.get(attorney.profile_id)

    const ratingCount = r?.count ?? 0
    const ratingAvg = ratingCount > 0 ? Number((r.sum / ratingCount).toFixed(2)) : null

    // Calculate seller level
    let level: 'new' | 'level_1' | 'level_2' | 'top_rated' = 'new'
    if (ratingCount >= 10 && ratingAvg && ratingAvg >= 4.7 && (gigStats?.totalOrders || 0) >= 20) {
      level = 'top_rated'
    } else if (ratingCount >= 5 && ratingAvg && ratingAvg >= 4.5 && (gigStats?.totalOrders || 0) >= 10) {
      level = 'level_2'
    } else if (ratingCount >= 1 && ratingAvg && ratingAvg >= 4.0) {
      level = 'level_1'
    }

    sellers.push({
      id: attorney.id,
      role: 'attorney',
      full_name: profile.full_name || profile.email?.split('@')[0] || 'Attorney',
      headshot_url: attorney.headshot_url,
      tagline: attorney.tagline,
      bio: attorney.bio,
      intro: attorney.intro,
      jurisdictions: attorney.jurisdictions,
      practice_areas: attorney.practice_areas,
      specialties: attorney.specialties,
      languages: attorney.languages,
      credential_type: credentialByProfile.get(attorney.profile_id)?.credential_type || app?.credential_type || null,
      years_experience: attorney.years_experience,
      starting_price: attorney.starting_price,
      offers_free_consult: attorney.offers_free_consult,
      capacity: app?.capacity,
      profile_url: app?.profile_url,
      timezone: attorney.timezone,
      available: attorney.available !== false,
      member_since: profile.created_at,
      rating_count: ratingCount,
      rating_avg: ratingAvg,
      is_online: attorney.available !== false,
      total_orders: gigStats?.totalOrders || 0,
      total_gigs: gigStats?.totalGigs || 0,
      verified: profile.status === 'active',
      level,
    })
  }

  for (const consultant of consultants || []) {
    const profile = profileById.get(consultant.profile_id)
    if (!profile || profile.status !== 'active') continue

    const r = ratingByConsultant.get(consultant.id)
    const gigStats = gigStatsByProfile.get(consultant.profile_id)

    const ratingCount = r?.count ?? 0
    const ratingAvg = ratingCount > 0 ? Number((r.sum / ratingCount).toFixed(2)) : null

    // Calculate seller level
    let level: 'new' | 'level_1' | 'level_2' | 'top_rated' = 'new'
    if (ratingCount >= 10 && ratingAvg && ratingAvg >= 4.7 && (gigStats?.totalOrders || 0) >= 20) {
      level = 'top_rated'
    } else if (ratingCount >= 5 && ratingAvg && ratingAvg >= 4.5 && (gigStats?.totalOrders || 0) >= 10) {
      level = 'level_2'
    } else if (ratingCount >= 1 && ratingAvg && ratingAvg >= 4.0) {
      level = 'level_1'
    }

    sellers.push({
      id: consultant.id,
      role: 'consultant',
      full_name: profile.full_name || profile.email?.split('@')[0] || 'Consultant',
      headshot_url: consultant.headshot_url,
      tagline: consultant.tagline,
      bio: consultant.bio,
      intro: consultant.intro,
      specialties: consultant.specialties,
      languages: consultant.languages,
      years_experience: consultant.years_experience,
      starting_price: consultant.starting_price,
      offers_free_consult: consultant.offers_free_consult,
      timezone: consultant.timezone,
      available: consultant.available !== false,
      member_since: profile.created_at,
      rating_count: ratingCount,
      rating_avg: ratingAvg,
      is_online: consultant.available !== false,
      total_orders: gigStats?.totalOrders || 0,
      total_gigs: gigStats?.totalGigs || 0,
      verified: profile.status === 'active',
      level,
    })
  }

  // Sort by rating and orders
  sellers.sort((a, b) => {
    const aScore = (a.rating_avg || 0) * 10 + (a.total_orders || 0)
    const bScore = (b.rating_avg || 0) * 10 + (b.total_orders || 0)
    return bScore - aScore
  })

  return ok({ sellers })
}
