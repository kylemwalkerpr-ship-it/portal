/**
 * GET /api/attorney/profile/strength
 * Returns a profile-strength score (0-100) + a checklist of completeness items.
 * Used by the My Profile page to show a Fiverr-style "build your profile"
 * progress meter.
 */
import { requireAttorney } from '@/lib/attorneyAuth'

type Check = { id: string; label: string; weight: number; done: boolean; hint?: string }

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const [attorneyRes, applicationRes, ratingsRes, profileRes] = await Promise.all([
    ctx.db
      .from('attorneys')
      .select('headshot_url, tagline, intro, bio, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, jurisdictions, practice_areas, available')
      .eq('id', ctx.attorneyId)
      .single(),
    ctx.db
      .from('attorney_applications')
      .select('credential_type, bar_number, malpractice_insurance')
      .eq('profile_id', ctx.profileId)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    ctx.db.from('attorney_ratings').select('stars').eq('attorney_id', ctx.attorneyId),
    ctx.db.from('profiles').select('full_name, email').eq('id', ctx.profileId).single(),
  ])

  const a: any = attorneyRes.data || {}
  const app: any = applicationRes.data || {}
  const ratings: any[] = ratingsRes.data || []
  const profile: any = profileRes.data || {}

  const hasText = (v: any, min = 0) => typeof v === 'string' && v.trim().length > min
  const hasArr = (v: any) => Array.isArray(v) && v.length > 0

  const checks: Check[] = [
    { id: 'name',           label: 'Full name on profile',                weight: 5,  done: hasText(profile.full_name) },
    { id: 'headshot',       label: 'Professional headshot',               weight: 12, done: hasText(a.headshot_url), hint: 'Profiles with a photo win 6× more engagements.' },
    { id: 'tagline',        label: 'Compelling tagline (≥40 chars)',      weight: 10, done: hasText(a.tagline, 40) },
    { id: 'intro',          label: 'Intro / byline (≥100 chars)',         weight: 10, done: hasText(a.intro, 100) },
    { id: 'bio',            label: 'Long bio (≥300 chars)',               weight: 12, done: hasText(a.bio, 300), hint: 'Long bios convert higher than short ones — students want context.' },
    { id: 'years',          label: 'Years of experience set',             weight: 4,  done: Number(a.years_experience || 0) > 0 },
    { id: 'starting_price', label: 'Starting price set',                  weight: 6,  done: Number(a.starting_price || 0) > 0 },
    { id: 'jurisdictions',  label: 'Jurisdictions listed',                weight: 8,  done: hasText(a.jurisdictions) },
    { id: 'practice_areas', label: 'Practice areas listed',               weight: 8,  done: hasText(a.practice_areas) },
    { id: 'specialties',    label: 'Specialties (3+ tags)',               weight: 6,  done: hasArr(a.specialties) && a.specialties.length >= 3 },
    { id: 'languages',      label: 'Languages listed',                    weight: 4,  done: hasArr(a.languages) },
    { id: 'education',      label: 'Education on file',                   weight: 4,  done: hasText(a.education) },
    { id: 'timezone',       label: 'Timezone set',                        weight: 2,  done: hasText(a.timezone) },
    { id: 'video',          label: 'Video introduction',                  weight: 5,  done: hasText(a.video_intro_url), hint: 'Optional but high-impact — students watch before booking.' },
    { id: 'free_consult',   label: 'Free consultation toggle decided',    weight: 2,  done: typeof a.offers_free_consult === 'boolean' },
    { id: 'available',      label: 'Availability set to accepting work',  weight: 2,  done: a.available !== false },
  ]

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const earned = checks.filter(c => c.done).reduce((s, c) => s + c.weight, 0)
  const score = Math.round((earned / totalWeight) * 100)

  // Tier: bronze < 40, silver 40-69, gold 70-89, platinum 90+
  const tier = score >= 90 ? 'platinum' : score >= 70 ? 'gold' : score >= 40 ? 'silver' : 'bronze'

  return Response.json({
    score,
    tier,
    checks,
    completed: checks.filter(c => c.done).length,
    total: checks.length,
    rating: ratings.length ? { count: ratings.length, avg: Number((ratings.reduce((s, r: any) => s + Number(r.stars || 0), 0) / ratings.length).toFixed(2)) } : null,
    credential_type: app.credential_type || null,
    available: a.available !== false,
  })
}
