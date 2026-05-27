/**
 * Shared attorney profile-strength scorer.
 *
 * Used by:
 *  - GET /api/attorney/profile/strength → returns the score + checklist for
 *    the dashboard banner.
 *  - POST /api/gigs/[id]/publish → enforces the ≥75% threshold before a gig
 *    can be moved to `active` status.
 *
 * One source of truth keeps the dashboard banner honest: if the banner says
 * 78%, the publish gate sees 78%.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface StrengthCheck {
  id: string
  label: string
  weight: number
  done: boolean
  hint?: string
}

export interface StrengthResult {
  score: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  checks: StrengthCheck[]
  completed: number
  total: number
  ratings: { count: number; avg: number } | null
  credential_type: string | null
  bar_number: string | null
  username: string | null
  available: boolean
}

const hasText = (v: unknown, min = 0): boolean =>
  typeof v === 'string' && v.trim().length > min
const hasArr = (v: unknown): boolean => Array.isArray(v) && v.length > 0

export async function computeAttorneyStrength(
  db: SupabaseClient,
  profileId: string,
): Promise<StrengthResult> {
  // Match the row-selection used by /api/attorney/profile GET +
  // requireAttorney — most recent attorney row by created_at. Keeps
  // checklist, editor, and PATCH consistent when duplicates exist.
  const { data: attorney } = await db
    .from('attorneys')
    .select(
      'id, headshot_url, tagline, intro, bio, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, jurisdictions, practice_areas, available',
    )
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const a: any = attorney || {}
  const attorneyId = a.id as string | undefined

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email, username')
    .eq('id', profileId)
    .single()

  const { data: appRow } = await db
    .from('attorney_applications')
    .select('credential_type, bar_number, malpractice_insurance')
    .eq('profile_id', profileId)
    .eq('status', 'approved')
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const ratingsRes = attorneyId
    ? await db.from('attorney_ratings').select('stars').eq('attorney_id', attorneyId)
    : { data: [] as any[] }
  const ratings = (ratingsRes.data || []) as any[]

  const username = (profile?.username as string | null) ?? null

  const checks: StrengthCheck[] = [
    { id: 'name',           label: 'Full name on profile',                weight: 4,  done: hasText(profile?.full_name) },
    { id: 'username',       label: 'SEO-friendly profile handle',         weight: 10, done: hasText(username, 2), hint: 'Used in your public profile URL — keep it short, lowercase, and keyword-rich (e.g. immigration-attorney-ny).' },
    { id: 'headshot',       label: 'Professional profile photo',          weight: 10, done: hasText(a.headshot_url), hint: 'Profiles with a photo win 6× more engagements.' },
    { id: 'tagline',        label: 'Compelling tagline (≥40 chars)',      weight: 8,  done: hasText(a.tagline, 40) },
    { id: 'intro',          label: 'Intro / byline (≥100 chars)',         weight: 8,  done: hasText(a.intro, 100) },
    { id: 'bio',            label: 'Long bio (≥300 chars)',               weight: 10, done: hasText(a.bio, 300), hint: 'Long bios convert higher than short ones — students want context.' },
    { id: 'years',          label: 'Years of experience set',             weight: 4,  done: Number(a.years_experience || 0) > 0 },
    { id: 'starting_price', label: 'Starting price set',                  weight: 5,  done: Number(a.starting_price || 0) > 0 },
    { id: 'jurisdictions',  label: 'Jurisdictions listed',                weight: 7,  done: hasText(a.jurisdictions) },
    { id: 'practice_areas', label: 'Practice areas listed',               weight: 7,  done: hasText(a.practice_areas) },
    { id: 'specialties',    label: 'Specialties (3+ tags)',               weight: 5,  done: hasArr(a.specialties) && (a.specialties as any[]).length >= 3 },
    { id: 'languages',      label: 'Languages listed',                    weight: 3,  done: hasArr(a.languages) },
    { id: 'education',      label: 'Education on file',                   weight: 4,  done: hasText(a.education) },
    { id: 'timezone',       label: 'Timezone set',                        weight: 2,  done: hasText(a.timezone) },
    { id: 'video',          label: 'Video introduction',                  weight: 4,  done: hasText(a.video_intro_url), hint: 'Optional but high-impact — students watch before booking.' },
    { id: 'bar',            label: 'Bar / registration number',           weight: 6,  done: hasText(appRow?.bar_number), hint: 'Required for verified listing.' },
    { id: 'credential',     label: 'Credential type recorded',            weight: 3,  done: hasText(appRow?.credential_type) },
    { id: 'free_consult',   label: 'Free consultation toggle decided',    weight: 2,  done: typeof a.offers_free_consult === 'boolean' },
    { id: 'available',      label: 'Availability set to accepting work',  weight: 2,  done: a.available !== false },
  ]

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const earned = checks.filter((c) => c.done).reduce((s, c) => s + c.weight, 0)
  const score = Math.round((earned / totalWeight) * 100)
  const tier: StrengthResult['tier'] =
    score >= 90 ? 'platinum' : score >= 70 ? 'gold' : score >= 40 ? 'silver' : 'bronze'

  const ratingsAgg =
    ratings.length > 0
      ? {
          count: ratings.length,
          avg: Number(
            (ratings.reduce((s, r: any) => s + Number(r.stars || 0), 0) / ratings.length).toFixed(2),
          ),
        }
      : null

  return {
    score,
    tier,
    checks,
    completed: checks.filter((c) => c.done).length,
    total: checks.length,
    ratings: ratingsAgg,
    credential_type: (appRow?.credential_type as string | null) ?? null,
    bar_number: (appRow?.bar_number as string | null) ?? null,
    username,
    available: a.available !== false,
  }
}

/** Hard threshold below which gigs cannot be published. */
export const PROFILE_PUBLISH_THRESHOLD = 75
