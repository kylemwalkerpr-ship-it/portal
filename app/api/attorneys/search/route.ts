/**
 * GET /api/attorneys/search
 * Paginated, filterable, sortable attorney directory for the student-facing
 * "Find an attorney" page. Replaces the prior route that loaded every
 * attorney into memory on every page view.
 *
 * Query params:
 *   q                 — search across name, tagline, bio, jurisdictions, practice areas, specialties
 *   jurisdiction      — substring match against jurisdictions column
 *   practice_area     — substring match against practice_areas column
 *   language          — substring match against languages[] (array column)
 *   credential        — attorney | consultant | paralegal | other
 *   available_only    — true to hide unavailable attorneys
 *   free_consult_only — true to filter attorneys offering free consults
 *   min_price         — floor on starting_price (cents OR dollars — same as DB)
 *   max_price         — ceiling on starting_price
 *   min_rating        — floor on avg rating (computed in JS)
 *   sort              — rating | newest | experience | price_low | price_high | name
 *   page, page_size   — 1-indexed, default 24, max 60
 *
 * Self-heals if any newer column is missing.
 */
import { createSupabaseAdminClient } from '@/lib/supabase'
import { fetchAttorneyCredentialColumnsBatch } from '@/lib/attorneyCredential'

const SORT_COLUMN_MAP: Record<string, { col: string; asc: boolean }> = {
  rating:      { col: 'created_at',      asc: false }, // sorted by rating in JS post-hydration
  newest:      { col: 'created_at',      asc: false },
  experience:  { col: 'years_experience', asc: false },
  price_low:   { col: 'starting_price',  asc: true },
  price_high:  { col: 'starting_price',  asc: false },
  name:        { col: 'created_at',      asc: false }, // sorted by profile name in JS
}

export async function GET(req: Request) {
  const db = createSupabaseAdminClient()

  const { searchParams } = new URL(req.url)
  const q             = searchParams.get('q')?.trim() || ''
  const jurisdiction  = searchParams.get('jurisdiction')?.trim() || ''
  const practiceArea  = searchParams.get('practice_area')?.trim() || ''
  const language      = searchParams.get('language')?.trim() || ''
  const credential    = searchParams.get('credential')?.trim() || ''
  const availableOnly = searchParams.get('available_only') === 'true'
  const freeOnly      = searchParams.get('free_consult_only') === 'true'
  const minPrice      = Number(searchParams.get('min_price') || 0)
  const maxPrice      = Number(searchParams.get('max_price') || 0)
  const minRating     = Number(searchParams.get('min_rating') || 0)
  const sortKey       = SORT_COLUMN_MAP[searchParams.get('sort') || ''] ? searchParams.get('sort')! : 'rating'
  const page          = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize      = Math.min(60, Math.max(1, Number(searchParams.get('page_size') || 24)))

  const sortCfg = SORT_COLUMN_MAP[sortKey]

  // Step 1 — fetch attorneys with as many filters as we can push to the DB.
  // Some filters (rating, name) must be applied post-hydration because the
  // values aren't on the attorneys table — we fetch a generous window then
  // narrow + paginate in JS for those cases.
  const inMemorySort = sortKey === 'rating' || sortKey === 'name'
  const FULL_COLS =
    'id, profile_id, jurisdictions, practice_areas, bio, available, headshot_url, ' +
    'tagline, intro, languages, years_experience, education, specialties, ' +
    'offers_free_consult, starting_price, video_intro_url, timezone, created_at'

  const build = (cols: string) => {
    let qb = db.from('attorneys').select(cols, { count: 'exact' }).order(sortCfg.col, { ascending: sortCfg.asc })
    if (jurisdiction)   qb = qb.ilike('jurisdictions', `%${jurisdiction}%`)
    if (practiceArea)   qb = qb.ilike('practice_areas', `%${practiceArea}%`)
    if (language)       qb = qb.contains('languages', [language])
    if (availableOnly)  qb = qb.eq('available', true)
    if (freeOnly)       qb = qb.eq('offers_free_consult', true)
    if (minPrice > 0)   qb = qb.gte('starting_price', minPrice)
    if (maxPrice > 0)   qb = qb.lte('starting_price', maxPrice)
    if (q) {
      // FTS on natural language columns (tagline, bio) — indexed via GIN.
      // Jurisdictions/practice_areas are short taxonomy lists handled by the
      // post-fetch filter below — no need for DB-side ilike on those.
      const safeQ = q.replace(/[^a-zA-Z0-9\s'"-]/g, ' ').trim().slice(0, 60)
      if (safeQ && safeQ.length >= 2) {
        qb = qb.or(`tagline.fts.${safeQ},bio.fts.${safeQ}`)
      }
    }
    return qb
  }

  let qb = build(FULL_COLS)
  if (!inMemorySort && minRating <= 0 && !credential) {
    qb = qb.range((page - 1) * pageSize, page * pageSize - 1)
  } else {
    qb = qb.limit(500) // cap — covers a healthy directory; we filter+paginate below
  }

  let { data: rows, error, count } = await qb

  // Self-heal if a column is missing (e.g. starting_price not yet on the table)
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const fb = await db.from('attorneys').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(500)
    rows = fb.data as any
    error = fb.error as any
    count = fb.count as any
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  const attorneys = rows ?? []

  // Step 2 — hydrate profile / application / ratings for this slice
  const profileIds = attorneys.map((a: any) => a.profile_id)
  const attorneyIds = attorneys.map((a: any) => a.id)

  const [{ data: profiles }, { data: applications }, { data: ratings }] = await Promise.all([
    profileIds.length ? db.from('profiles').select('id, full_name, email, status').in('id', profileIds) : Promise.resolve({ data: [] }),
    profileIds.length ? db.from('attorney_applications').select('profile_id, credential_type, capacity, profile_url').in('profile_id', profileIds).eq('status', 'approved') : Promise.resolve({ data: [] }),
    attorneyIds.length ? db.from('attorney_ratings').select('attorney_id, stars').in('attorney_id', attorneyIds) : Promise.resolve({ data: [] }),
  ])

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]))
  const applicationByProfile = new Map((applications ?? []).map((a: any) => [a.profile_id ?? '', a]))
  // Editable credential off the attorneys row wins over the application copy.
  const credentialByProfile = await fetchAttorneyCredentialColumnsBatch(db, profileIds)
  const ratingByAttorney = new Map<string, { count: number; sum: number }>()
  for (const r of ratings ?? []) {
    const cur = ratingByAttorney.get((r as any).attorney_id) ?? { count: 0, sum: 0 }
    cur.count += 1
    cur.sum += (r as any).stars
    ratingByAttorney.set((r as any).attorney_id, cur)
  }

  let hydrated = attorneys
    .filter((a: any) => (profileById.get(a.profile_id) as any)?.status === 'active')
    .map((a: any) => {
      const profile: any = profileById.get(a.profile_id)
      const application: any = applicationByProfile.get(a.profile_id)
      const r = ratingByAttorney.get(a.id)
      return {
        id:                a.id,
        profile_id:        a.profile_id,
        full_name:         profile?.full_name || profile?.email?.split('@')[0] || 'Attorney',
        headshot_url:      a.headshot_url,
        tagline:           a.tagline,
        bio:               a.bio,
        intro:             a.intro,
        jurisdictions:     a.jurisdictions,
        practice_areas:    a.practice_areas,
        specialties:       a.specialties,
        languages:         a.languages,
        credential_type:   credentialByProfile.get(a.profile_id)?.credential_type || application?.credential_type || null,
        years_experience:  a.years_experience,
        starting_price:    a.starting_price,
        offers_free_consult: a.offers_free_consult ?? false,
        capacity:          application?.capacity || null,
        profile_url:       application?.profile_url || null,
        timezone:          a.timezone,
        available:         a.available !== false,
        member_since:      a.created_at,
        rating_count:      r?.count ?? 0,
        rating_avg:        r ? Number((r.sum / r.count).toFixed(2)) : null,
      }
    })

  // Step 3 — JS-side filters (rating, credential, full-text on name/specialties)
  if (credential)       hydrated = hydrated.filter(a => (a.credential_type || '').toLowerCase() === credential.toLowerCase())
  if (minRating > 0)    hydrated = hydrated.filter(a => (a.rating_avg ?? 0) >= minRating)
  if (q) {
    const qLower = q.toLowerCase()
    // Already filtered tagline/bio in SQL; refine by name + specialties + languages
    hydrated = hydrated.filter(a =>
      (a.full_name || '').toLowerCase().includes(qLower) ||
      (a.tagline || '').toLowerCase().includes(qLower) ||
      (a.bio || '').toLowerCase().includes(qLower) ||
      (a.jurisdictions || '').toLowerCase().includes(qLower) ||
      (a.practice_areas || '').toLowerCase().includes(qLower) ||
      (a.specialties || []).some((s: string) => String(s).toLowerCase().includes(qLower)) ||
      (a.languages || []).some((l: string) => String(l).toLowerCase().includes(qLower))
    )
  }

  // Step 4 — JS-side sort for rating + name
  if (sortKey === 'rating') {
    hydrated.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0))
  } else if (sortKey === 'name') {
    hydrated.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }

  const total = inMemorySort || minRating > 0 || credential ? hydrated.length : (count ?? hydrated.length)
  const paged = inMemorySort || minRating > 0 || credential
    ? hydrated.slice((page - 1) * pageSize, page * pageSize)
    : hydrated

  // Step 5 — facets (so the filter UI knows what values exist).
  // Lightweight: derive from the *current* result set so it adapts to filters.
  const facets = {
    jurisdictions: collectTopTokens(hydrated.map(a => a.jurisdictions).filter(Boolean) as string[]),
    practice_areas: collectTopTokens(hydrated.map(a => a.practice_areas).filter(Boolean) as string[]),
    languages: collectTopValues(hydrated.flatMap(a => a.languages || [])),
    credentials: collectTopValues(hydrated.map(a => a.credential_type).filter(Boolean) as string[]),
  }

  return Response.json({
    attorneys: paged,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    has_more: page * pageSize < total,
    facets,
  })
}

// Helpers: derive most-common comma-separated tokens (e.g. "California, NY")
function collectTopTokens(values: string[], cap = 12): string[] {
  const counts = new Map<string, number>()
  for (const v of values) {
    for (const part of String(v).split(/[,;|/]+/)) {
      const trimmed = part.trim()
      if (!trimmed) continue
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1)
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, cap).map(([k]) => k)
}
function collectTopValues(values: string[], cap = 12): string[] {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, cap).map(([k]) => k)
}
