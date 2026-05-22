import { createSupabaseAdminClient } from '@/lib/supabase'

// Public profile detail for one consultant.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const db = createSupabaseAdminClient()

  const { data: consultant, error: consultantErr } = await db
    .from('consultants')
    .select('id, profile_id, headshot_url, tagline, bio, intro, specialties, languages, years_experience, starting_price, offers_free_consult, timezone, available, created_at')
    .eq('id', id)
    .single()

  if (consultantErr || !consultant) {
    return Response.json({ error: 'Consultant not found.' }, { status: 404 })
  }

  const [{ data: profile }, { data: ratingsRows }, { data: gigs }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, status').eq('id', consultant.profile_id).single(),
    db
      .from('consultant_ratings')
      .select('id, stars, comment, created_at')
      .eq('consultant_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('gigs')
      .select('id, slug, title, starting_price, avg_rating, gallery_images')
      .eq('provider_id', consultant.profile_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
  ])

  if (!profile || profile.status !== 'active') {
    return Response.json({ error: 'Consultant is not currently available.' }, { status: 404 })
  }

  const ratingCount = ratingsRows?.length ?? 0
  const ratingSum = (ratingsRows ?? []).reduce((s: number, r: any) => s + (r.stars || 0), 0)
  const ratingAvg = ratingCount > 0 ? Number((ratingSum / ratingCount).toFixed(2)) : null

  return Response.json({
    consultant: {
      id: consultant.id,
      profile_id: consultant.profile_id,
      full_name: profile?.full_name || profile?.email?.split('@')[0] || 'Consultant',
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
      member_since: consultant.created_at,
      rating_count: ratingCount,
      rating_avg: ratingAvg,
      gigs: gigs ?? [],
    },
  })
}
