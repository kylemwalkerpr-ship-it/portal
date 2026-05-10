import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'


type AttorneyRow = {
  id: string
  profile_id: string
  jurisdictions: string | null
  practice_areas: string | null
  bio: string | null
  available: boolean | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  status: string | null
}

type ApplicationRow = {
  profile_id: string | null
  credential_type: string | null
  capacity: string | null
  profile_url: string | null
}

type RatingAgg = {
  attorney_id: string
  count: number
  avg: number
}

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  const db = createSupabaseAdminClient()

  // Restrict to active client / consultant / admin viewers; we don't expose this
  // directory to attorneys themselves or to declined applicants.
  const { data: viewer } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', userId)
    .single()
  if (!viewer) return Response.json({ error: 'Profile not found.' }, { status: 404 })

  const { data: attorneys, error: attorneyErr } = await db
    .from('attorneys')
    .select('id, profile_id, jurisdictions, practice_areas, bio, available')
    .returns<AttorneyRow[]>()

  if (attorneyErr) return Response.json({ error: attorneyErr.message }, { status: 500 })
  if (!attorneys || attorneys.length === 0) return Response.json({ attorneys: [] })

  const profileIds = attorneys.map((a) => a.profile_id)
  const attorneyIds = attorneys.map((a) => a.id)

  const [{ data: profiles }, { data: applications }, { data: ratings }] = await Promise.all([
    db
      .from('profiles')
      .select('id, full_name, email, status')
      .in('id', profileIds)
      .returns<ProfileRow[]>(),
    db
      .from('attorney_applications')
      .select('profile_id, credential_type, capacity, profile_url')
      .in('profile_id', profileIds)
      .eq('status', 'approved')
      .returns<ApplicationRow[]>(),
    db
      .from('attorney_ratings')
      .select('attorney_id, stars')
      .in('attorney_id', attorneyIds)
      .returns<{ attorney_id: string; stars: number }[]>(),
  ])

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const applicationByProfile = new Map((applications ?? []).map((a) => [a.profile_id ?? '', a]))

  const ratingByAttorney = new Map<string, RatingAgg>()
  for (const r of ratings ?? []) {
    const current = ratingByAttorney.get(r.attorney_id) ?? { attorney_id: r.attorney_id, count: 0, avg: 0 }
    current.avg = (current.avg * current.count + r.stars) / (current.count + 1)
    current.count += 1
    ratingByAttorney.set(r.attorney_id, current)
  }

  const result = attorneys
    .filter((a) => {
      const profile = profileById.get(a.profile_id)
      return profile?.status === 'active'
    })
    .map((a) => {
      const profile = profileById.get(a.profile_id)
      const application = applicationByProfile.get(a.profile_id)
      const rating = ratingByAttorney.get(a.id)
      return {
        id: a.id,
        full_name: profile?.full_name || profile?.email?.split('@')[0] || 'Attorney',
        bio: a.bio,
        jurisdictions: a.jurisdictions || null,
        practice_areas: a.practice_areas || null,
        credential_type: application?.credential_type || null,
        capacity: application?.capacity || null,
        profile_url: application?.profile_url || null,
        available: a.available !== false,
        rating_count: rating?.count ?? 0,
        rating_avg: rating ? Number(rating.avg.toFixed(2)) : null,
      }
    })

  return Response.json({ attorneys: result })
}
