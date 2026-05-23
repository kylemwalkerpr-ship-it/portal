/**
 * Consultant profile-strength scorer — mirrors the attorney version but
 * skips bar/credential checks (consultants don't carry a bar number) and
 * weights the regulator field (RCIC, OISC) onto the credential-type
 * placement instead.
 *
 * Used by:
 *  - GET /api/consultant/profile/strength → dashboard banner
 *  - POST /api/gigs/[id]/publish          → publish gate (when role is consultant)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ConsultantCheck {
  id: string
  label: string
  weight: number
  done: boolean
  hint?: string
}

export interface ConsultantStrengthResult {
  score: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  checks: ConsultantCheck[]
  completed: number
  total: number
  username: string | null
  available: boolean
}

const hasText = (v: unknown, min = 0): boolean =>
  typeof v === 'string' && v.trim().length > min
const hasArr = (v: unknown): boolean => Array.isArray(v) && v.length > 0

export async function computeConsultantStrength(
  db: SupabaseClient,
  profileId: string,
): Promise<ConsultantStrengthResult> {
  const { data: consultant } = await db
    .from('consultants')
    .select(
      'id, headshot_url, tagline, intro, bio, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, jurisdictions, practice_areas, available',
    )
    .eq('profile_id', profileId)
    .maybeSingle()

  const c: any = consultant || {}

  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email, username')
    .eq('id', profileId)
    .single()

  const username = (profile?.username as string | null) ?? null

  const checks: ConsultantCheck[] = [
    { id: 'name',           label: 'Full name on profile',                weight: 4,  done: hasText(profile?.full_name) },
    { id: 'username',       label: 'SEO-friendly profile handle',         weight: 12, done: hasText(username, 2), hint: 'Used in your public profile URL — keep it short, lowercase, and keyword-rich (e.g. study-permit-consultant-tor).' },
    { id: 'headshot',       label: 'Professional headshot',               weight: 12, done: hasText(c.headshot_url), hint: 'Profiles with a photo win 6× more engagements.' },
    { id: 'tagline',        label: 'Compelling tagline (≥40 chars)',      weight: 10, done: hasText(c.tagline, 40) },
    { id: 'intro',          label: 'Intro / byline (≥100 chars)',         weight: 8,  done: hasText(c.intro, 100) },
    { id: 'bio',            label: 'Long bio (≥300 chars)',               weight: 12, done: hasText(c.bio, 300), hint: 'Long bios convert higher — students want context on how you work.' },
    { id: 'years',          label: 'Years of experience set',             weight: 4,  done: Number(c.years_experience || 0) > 0 },
    { id: 'starting_price', label: 'Starting price set',                  weight: 6,  done: Number(c.starting_price || 0) > 0 },
    { id: 'jurisdictions',  label: 'Jurisdictions listed',                weight: 8,  done: hasText(c.jurisdictions) },
    { id: 'practice_areas', label: 'Service areas listed',                weight: 8,  done: hasText(c.practice_areas) },
    { id: 'specialties',    label: 'Specialties (3+ tags)',               weight: 6,  done: hasArr(c.specialties) && (c.specialties as any[]).length >= 3 },
    { id: 'languages',      label: 'Languages listed',                    weight: 3,  done: hasArr(c.languages) },
    { id: 'education',      label: 'Education / training on file',        weight: 3,  done: hasText(c.education) },
    { id: 'timezone',       label: 'Timezone set',                        weight: 2,  done: hasText(c.timezone) },
    { id: 'video',          label: 'Video introduction',                  weight: 4,  done: hasText(c.video_intro_url), hint: 'Optional but high-impact — students watch before booking.' },
    { id: 'free_consult',   label: 'Free consultation toggle decided',    weight: 2,  done: typeof c.offers_free_consult === 'boolean' },
    { id: 'available',      label: 'Availability set to accepting work',  weight: 2,  done: c.available !== false },
  ]

  const totalWeight = checks.reduce((s, ck) => s + ck.weight, 0)
  const earned = checks.filter((ck) => ck.done).reduce((s, ck) => s + ck.weight, 0)
  const score = Math.round((earned / totalWeight) * 100)
  const tier: ConsultantStrengthResult['tier'] =
    score >= 90 ? 'platinum' : score >= 70 ? 'gold' : score >= 40 ? 'silver' : 'bronze'

  return {
    score,
    tier,
    checks,
    completed: checks.filter((ck) => ck.done).length,
    total: checks.length,
    username,
    available: c.available !== false,
  }
}

export const CONSULTANT_PUBLISH_THRESHOLD = 75
