import { createSupabaseAdminClient } from '@/lib/supabase'
import { resolveAttorneyCredential } from '@/lib/attorneyCredential'

// Public profile detail for one attorney. Returns the full enriched profile,
// the latest reviews (anonymised), and a one-line "responds within X" stat.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const db = createSupabaseAdminClient()

  const { data: attorney, error: attErr } = await db
    .from('attorneys')
    .select('id, profile_id, jurisdictions, practice_areas, bio, available, headshot_url, tagline, intro, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, created_at')
    .eq('id', id)
    .single()

  if (attErr || !attorney) return Response.json({ error: 'Attorney not found.' }, { status: 404 })

  const [{ data: profile }, { data: application }, { data: ratingsRows }, completedOrders, { data: gigs }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, status').eq('id', attorney.profile_id).single(),
    db
      .from('attorney_applications')
      .select('credential_type, capacity, profile_url')
      .eq('profile_id', attorney.profile_id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('attorney_ratings')
      .select('id, stars, comment, created_at, rater_profile_id')
      .eq('attorney_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('consultant_id', attorney.profile_id)
      .in('status', ['completed', 'released']),
    db
      .from('provider_gigs')
      .select('*, tiers:provider_gig_tiers(*)')
      .eq('provider_role', 'attorney')
      .eq('provider_profile_id', attorney.profile_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ])

  if (!profile || profile.status !== 'active') {
    return Response.json({ error: 'Attorney is not currently available.' }, { status: 404 })
  }

  // Anonymise rater names (first name + last initial).
  const raterIds = Array.from(new Set((ratingsRows ?? []).map((r) => r.rater_profile_id).filter(Boolean)))
  const raterNameById = new Map<string, string>()
  if (raterIds.length > 0) {
    const { data: raters } = await db.from('profiles').select('id, full_name').in('id', raterIds)
    for (const r of raters ?? []) {
      const name = r.full_name || ''
      const parts = name.trim().split(/\s+/)
      const first = parts[0] || 'Anonymous'
      const initial = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : ''
      raterNameById.set(r.id, `${first} ${initial}`.trim())
    }
  }

  const ratings = (ratingsRows ?? []).map((r) => ({
    id: r.id,
    stars: r.stars,
    comment: r.comment,
    created_at: r.created_at,
    rater_name: raterNameById.get(r.rater_profile_id || '') || 'Anonymous',
  }))

  const ratingCount = ratings.length
  const ratingAvg = ratingCount === 0 ? null : Number((ratings.reduce((s, r) => s + Number(r.stars), 0) / ratingCount).toFixed(2))

  // Editable credential off the attorneys row wins over the application copy.
  const credential = await resolveAttorneyCredential(db, attorney.profile_id)

  return Response.json({
    attorney: {
      id: attorney.id,
      full_name: profile.full_name || profile.email?.split('@')[0] || 'Attorney',
      headshot_url: attorney.headshot_url,
      tagline: attorney.tagline,
      intro: attorney.intro,
      bio: attorney.bio,
      jurisdictions: attorney.jurisdictions,
      practice_areas: attorney.practice_areas,
      specialties: attorney.specialties,
      languages: attorney.languages,
      education: attorney.education,
      credential_type: credential.credential_type || application?.credential_type || null,
      years_experience: attorney.years_experience,
      starting_price: attorney.starting_price,
      offers_free_consult: attorney.offers_free_consult ?? false,
      capacity: application?.capacity || null,
      profile_url: application?.profile_url || null,
      video_intro_url: attorney.video_intro_url,
      timezone: attorney.timezone,
      available: attorney.available !== false,
      member_since: attorney.created_at,
      rating_count: ratingCount,
      rating_avg: ratingAvg,
      completed_engagements: completedOrders?.count ?? 0,
    },
    ratings,
    gigs: gigs ?? [],
  })
}


