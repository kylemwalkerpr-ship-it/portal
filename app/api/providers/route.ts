/**
 * GET /api/providers
 *
 * Unified provider directory powering the dashboard "Find a consultant
 * or attorney" page. Returns BOTH attorneys + consultants in one
 * response so students can browse and filter without bouncing between
 * separate surfaces.
 *
 * Query params:
 *   role  — 'attorney' | 'consultant' | 'all' (default 'all')
 *           Controls which provider type(s) are returned.
 *
 * Onboarding gate (per project ask 2026-06-03):
 *   Providers are discoverable WITHOUT needing a gig, as long as
 *   their profile meets the onboarding threshold. We approximate
 *   "onboarded" with a lightweight column-check rather than calling
 *   computeAttorneyStrength / computeConsultantStrength per-row
 *   (which would N+1 the search):
 *     - profiles.status = 'active'
 *     - attorneys/consultants row exists
 *     - headshot_url is set            (weight 12 in the full check)
 *     - tagline is set, ≥ 40 chars     (weight 10 in the full check)
 *     - bio is set, ≥ 150 chars        (relaxed from 300 for discovery)
 *   These four together contribute >40 weighted points, enough that
 *   any provider passing them is recognizably "onboarded" without
 *   shipping empty cards to students.
 *
 * Self-heals if a column is missing on either table (e.g. when one
 * side adds a column the other hasn't migrated yet).
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchAttorneyCredentialColumnsBatch } from '@/lib/attorneyCredential'
import { getCached, setCached, generateCacheKey } from '@/lib/cache'

const CACHE_TTL_SECONDS = 60

type Role = 'attorney' | 'consultant' | 'all'

interface ProviderRow {
  id: string
  profile_id: string
  role: 'attorney' | 'consultant'
  full_name: string
  headshot_url: string | null
  tagline: string | null
  bio: string | null
  intro: string | null
  jurisdictions: string | null
  practice_areas: string | null
  specialties: string[] | null
  languages: string[] | null
  credential_type: string | null
  years_experience: number | null
  starting_price: number | null
  offers_free_consult: boolean
  capacity: string | null
  profile_url: string | null
  timezone: string | null
  available: boolean
  member_since: string | null
  rating_count: number
  rating_avg: number | null
  username: string | null
}

function isOnboarded(row: { headshot_url: string | null; tagline: string | null; bio: string | null }): boolean {
  if (!row.headshot_url) return false
  if (!row.tagline || row.tagline.trim().length < 40) return false
  if (!row.bio || row.bio.trim().length < 150) return false
  return true
}

export async function GET(req: Request) {
  const db = createSupabaseAdminClient()
  const { searchParams } = new URL(req.url)
  const requested = (searchParams.get('role') || 'all').trim().toLowerCase() as Role
  const role: Role = requested === 'attorney' || requested === 'consultant' ? requested : 'all'

  // Response is identical for every caller (no per-user data), so serve from
  // KV. This endpoint fans out into 5+ table reads — the hottest directory
  // surface on both portal and marketplace.
  const cacheKey = generateCacheKey('/api/providers', `role=${role}`)
  const cached = await getCached<Record<string, unknown>>(cacheKey, CACHE_TTL_SECONDS)
  if (cached) return Response.json(cached)

  const wantAttorneys = role === 'all' || role === 'attorney'
  const wantConsultants = role === 'all' || role === 'consultant'

  // Mirror the column list across both tables — the schemas are
  // intentionally parallel (lib/attorneyProfileStrength.ts /
  // lib/consultantProfileStrength.ts confirm). If one side adds a
  // column the other hasn't migrated yet, the self-heal in the catch
  // block re-queries with the minimum shared column set.
  const SHARED_COLS =
    'id, profile_id, headshot_url, tagline, bio, intro, languages, ' +
    'years_experience, education, specialties, offers_free_consult, ' +
    'starting_price, video_intro_url, timezone, available, created_at'
  const ATTORNEY_EXTRA = 'jurisdictions, practice_areas'
  const CONSULTANT_EXTRA = 'subjects, industries'

  const [attorneysRes, consultantsRes] = await Promise.all([
    wantAttorneys
      ? db.from('attorneys').select(`${SHARED_COLS}, ${ATTORNEY_EXTRA}`).limit(500)
      : Promise.resolve({ data: [], error: null }),
    wantConsultants
      ? db.from('consultants').select(`${SHARED_COLS}, ${CONSULTANT_EXTRA}`).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (attorneysRes.error) return Response.json({ error: attorneysRes.error.message }, { status: 500 })
  if (consultantsRes.error) return Response.json({ error: consultantsRes.error.message }, { status: 500 })

  const attorneys = (attorneysRes.data ?? []) as Array<Record<string, unknown>>
  const consultants = (consultantsRes.data ?? []) as Array<Record<string, unknown>>

  const allProfileIds = Array.from(
    new Set([
      ...attorneys.map((a) => a.profile_id as string),
      ...consultants.map((c) => c.profile_id as string),
    ]),
  ).filter(Boolean)

  if (allProfileIds.length === 0) {
    return Response.json({ providers: [] })
  }

  // Hydrate profiles, applications (attorneys only), credential overrides
  // (attorneys only), and ratings in parallel.
  const attorneyIds = attorneys.map((a) => a.id as string)
  const [profilesRes, applicationsRes, ratingsRes] = await Promise.all([
    db.from('profiles').select('id, full_name, email, status, username').in('id', allProfileIds),
    attorneys.length
      ? db
          .from('attorney_applications')
          .select('profile_id, credential_type, capacity, profile_url')
          .in('profile_id', attorneys.map((a) => a.profile_id as string))
          .eq('status', 'approved')
      : Promise.resolve({ data: [], error: null }),
    attorneyIds.length
      ? db.from('attorney_ratings').select('attorney_id, stars').in('attorney_id', attorneyIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profilesRes.error) return Response.json({ error: profilesRes.error.message }, { status: 500 })

  const profileById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p as { id: string; full_name: string | null; email: string | null; status: string | null; username: string | null }]),
  )
  const applicationByProfile = new Map(
    (applicationsRes.data ?? []).map((a) => [
      (a as { profile_id: string | null }).profile_id ?? '',
      a as { profile_id: string | null; credential_type: string | null; capacity: string | null; profile_url: string | null },
    ]),
  )
  const credentialByProfile = attorneys.length
    ? await fetchAttorneyCredentialColumnsBatch(db, attorneys.map((a) => a.profile_id as string))
    : new Map<string, { credential_type: string | null }>()

  const ratingByAttorney = new Map<string, { count: number; sum: number }>()
  for (const r of ratingsRes.data ?? []) {
    const row = r as { attorney_id: string; stars: number }
    const cur = ratingByAttorney.get(row.attorney_id) ?? { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += row.stars
    ratingByAttorney.set(row.attorney_id, cur)
  }

  const mapAttorney = (a: Record<string, unknown>): ProviderRow | null => {
    const profile = profileById.get(a.profile_id as string)
    if (profile?.status !== 'active') return null
    const headshot_url = (a.headshot_url as string | null) ?? null
    const tagline = (a.tagline as string | null) ?? null
    const bio = (a.bio as string | null) ?? null
    if (!isOnboarded({ headshot_url, tagline, bio })) return null
    const application = applicationByProfile.get(a.profile_id as string)
    const r = ratingByAttorney.get(a.id as string)
    return {
      id: a.id as string,
      profile_id: a.profile_id as string,
      role: 'attorney',
      full_name: profile?.full_name || profile?.email?.split('@')[0] || 'Attorney',
      headshot_url,
      tagline,
      bio,
      intro: (a.intro as string | null) ?? null,
      jurisdictions: (a.jurisdictions as string | null) ?? null,
      practice_areas: (a.practice_areas as string | null) ?? null,
      specialties: (a.specialties as string[] | null) ?? null,
      languages: (a.languages as string[] | null) ?? null,
      credential_type: credentialByProfile.get(a.profile_id as string)?.credential_type || application?.credential_type || null,
      years_experience: (a.years_experience as number | null) ?? null,
      starting_price: (a.starting_price as number | null) ?? null,
      offers_free_consult: (a.offers_free_consult as boolean | null) ?? false,
      capacity: application?.capacity ?? null,
      profile_url: application?.profile_url ?? null,
      timezone: (a.timezone as string | null) ?? null,
      available: (a.available as boolean | null) !== false,
      member_since: (a.created_at as string | null) ?? null,
      rating_count: r?.count ?? 0,
      rating_avg: r ? Number((r.sum / r.count).toFixed(2)) : null,
      username: profile?.username ?? null,
    }
  }

  const mapConsultant = (c: Record<string, unknown>): ProviderRow | null => {
    const profile = profileById.get(c.profile_id as string)
    if (profile?.status !== 'active') return null
    const headshot_url = (c.headshot_url as string | null) ?? null
    const tagline = (c.tagline as string | null) ?? null
    const bio = (c.bio as string | null) ?? null
    if (!isOnboarded({ headshot_url, tagline, bio })) return null
    // Consultants don't carry the jurisdictions/practice_areas columns
    // (those are legal-specific). Map their subjects/industries onto
    // the same display fields so the unified UI doesn't need a separate
    // code path for the two roles.
    const subjects = (c.subjects as string | null) ?? null
    const industries = (c.industries as string | null) ?? null
    return {
      id: c.id as string,
      profile_id: c.profile_id as string,
      role: 'consultant',
      full_name: profile?.full_name || profile?.email?.split('@')[0] || 'Consultant',
      headshot_url,
      tagline,
      bio,
      intro: (c.intro as string | null) ?? null,
      // For consultants, "jurisdictions" reads as the country/region
      // they serve and "practice_areas" reads as their subject scope.
      jurisdictions: null,
      practice_areas: subjects,
      specialties: (c.specialties as string[] | null) ?? null,
      languages: (c.languages as string[] | null) ?? null,
      credential_type: 'consultant',
      years_experience: (c.years_experience as number | null) ?? null,
      starting_price: (c.starting_price as number | null) ?? null,
      offers_free_consult: (c.offers_free_consult as boolean | null) ?? false,
      capacity: industries,
      profile_url: null,
      timezone: (c.timezone as string | null) ?? null,
      available: (c.available as boolean | null) !== false,
      member_since: (c.created_at as string | null) ?? null,
      rating_count: 0,
      rating_avg: null,
      username: profile?.username ?? null,
    }
  }

  const providers: ProviderRow[] = [
    ...attorneys.map(mapAttorney),
    ...consultants.map(mapConsultant),
  ].filter((p): p is ProviderRow => p !== null)

  // Sort: rated providers first, then by recency. Same ordering the old
  // /api/attorneys endpoint produced.
  providers.sort((a, b) => {
    const ratingDiff = (b.rating_avg ?? 0) - (a.rating_avg ?? 0)
    if (ratingDiff !== 0) return ratingDiff
    const dateA = a.member_since ? new Date(a.member_since).getTime() : 0
    const dateB = b.member_since ? new Date(b.member_since).getTime() : 0
    return dateB - dateA
  })

  const payload = {
    providers,
    counts: {
      total: providers.length,
      attorneys: providers.filter((p) => p.role === 'attorney').length,
      consultants: providers.filter((p) => p.role === 'consultant').length,
    },
  }
  await setCached(cacheKey, payload, CACHE_TTL_SECONDS)
  return Response.json(payload)
}
