import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchAttorneyCredentialColumnsBatch } from '@/lib/attorneyCredential'

type AttorneyRow = {
  id: string
  profile_id: string
  jurisdictions: string | null
  practice_areas: string | null
  bio: string | null
  available: boolean | null
  headshot_url: string | null
  tagline: string | null
  intro: string | null
  languages: string[] | null
  years_experience: number | null
  education: string | null
  specialties: string[] | null
  offers_free_consult: boolean | null
  starting_price: number | null
  video_intro_url: string | null
  timezone: string | null
  created_at: string | null
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

export async function GET() {
  const db = createSupabaseAdminClient()

  const { data: attorneys, error: attorneyErr } = await db
    .from('attorneys')
    .select('id, profile_id, jurisdictions, practice_areas, bio, available, headshot_url, tagline, intro, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, created_at')
    .returns<AttorneyRow[]>()

  if (attorneyErr) return Response.json({ error: attorneyErr.message }, { status: 500 })
  if (!attorneys || attorneys.length === 0) return Response.json({ attorneys: [] })

  const profileIds = attorneys.map((a) => a.profile_id)
  const attorneyIds = attorneys.map((a) => a.id)

  const [{ data: profiles }, { data: applications }, { data: ratings }] = await Promise.all([
    db.from('profiles').select('id, full_name, email, status').in('id', profileIds).returns<ProfileRow[]>(),
    db
      .from('attorney_applications')
      .select('profile_id, credential_type, capacity, profile_url')
      .in('profile_id', profileIds)
      .eq('status', 'approved')
      .returns<ApplicationRow[]>(),
    db.from('attorney_ratings').select('attorney_id, stars').in('attorney_id', attorneyIds).returns<{ attorney_id: string; stars: number }[]>(),
  ])

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))
  const applicationByProfile = new Map((applications ?? []).map((a) => [a.profile_id ?? '', a]))
  // Editable credential lives on the attorneys row; prefer it over the
  // application's vetting copy so public cards reflect profile edits.
  const credentialByProfile = await fetchAttorneyCredentialColumnsBatch(db, profileIds)

  const ratingByAttorney = new Map<string, { count: number; sum: number }>()
  for (const r of ratings ?? []) {
    const cur = ratingByAttorney.get(r.attorney_id) ?? { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += r.stars
    ratingByAttorney.set(r.attorney_id, cur)
  }

  const result = attorneys
    .filter((a) => profileById.get(a.profile_id)?.status === 'active')
    .map((a) => {
      const profile = profileById.get(a.profile_id)
      const application = applicationByProfile.get(a.profile_id)
      const r = ratingByAttorney.get(a.id)
      return {
        id: a.id,
        full_name: profile?.full_name || profile?.email?.split('@')[0] || 'Attorney',
        headshot_url: a.headshot_url,
        tagline: a.tagline,
        bio: a.bio,
        intro: a.intro,
        jurisdictions: a.jurisdictions,
        practice_areas: a.practice_areas,
        specialties: a.specialties,
        languages: a.languages,
        credential_type: credentialByProfile.get(a.profile_id)?.credential_type || application?.credential_type || null,
        years_experience: a.years_experience,
        starting_price: a.starting_price,
        offers_free_consult: a.offers_free_consult ?? false,
        capacity: application?.capacity || null,
        profile_url: application?.profile_url || null,
        timezone: a.timezone,
        available: a.available !== false,
        member_since: a.created_at,
        rating_count: r?.count ?? 0,
        rating_avg: r ? Number((r.sum / r.count).toFixed(2)) : null,
      }
    })

  return Response.json({ attorneys: result })
}
