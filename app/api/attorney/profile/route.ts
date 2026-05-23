import { requireAttorney } from '@/lib/attorneyAuth'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const ENRICHED_FIELDS = [
  'tagline',
  'intro',
  'bio',
  'languages',
  'years_experience',
  'education',
  'specialties',
  'offers_free_consult',
  'starting_price',
  'video_intro_url',
  'timezone',
  'jurisdictions',
  'practice_areas',
  'available',
] as const

type EditablePayload = Partial<Record<(typeof ENRICHED_FIELDS)[number], unknown>>

function clean(value: unknown, max = 4000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function cleanArray(value: unknown, maxItems = 30, maxItemLen = 80): string[] | null {
  if (!Array.isArray(value)) return null
  const out = value
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim().slice(0, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems)
  return out
}

export async function GET() {
  const userId = await getClerkUserId()
  if (!userId) return Response.json({ error: 'Unauthenticated.' }, { status: 401 })

  const db = createSupabaseAdminClient()

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, email, full_name, role, status, username, intake_last_step')
    .eq('clerk_user_id', userId)
    .single()

  if (profileErr || !profile) return Response.json({ error: 'Profile not found.' }, { status: 404 })
  if (profile.role !== 'attorney') return Response.json({ error: 'Not an attorney account.' }, { status: 403 })

  const [attorneyRes, applicationRes, rating] = await Promise.all([
    db
      .from('attorneys')
      .select('id, jurisdictions, practice_areas, bio, available, application_id, headshot_url, headshot_path, tagline, intro, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone, created_at')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    db
      .from('attorney_applications')
      .select('id, credential_type, jurisdictions, bar_number, practice_areas, malpractice_insurance, profile_url, capacity, notes, phone, status, created_at, decided_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    attorneyRatingAggregate(db, profile.id),
  ])

  return Response.json({
    profile: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      status: profile.status,
      username: (profile as any).username ?? null,
      intake_last_step: (profile as any).intake_last_step ?? 0,
    },
    attorney: attorneyRes.data ?? null,
    application: applicationRes.data ?? null,
    rating,
  })
}

async function attorneyRatingAggregate(db: ReturnType<typeof createSupabaseAdminClient>, profileId: string) {
  const { data: attorney } = await db.from('attorneys').select('id').eq('profile_id', profileId).maybeSingle()
  if (!attorney) return { count: 0, avg: null }
  const { data: rows } = await db.from('attorney_ratings').select('stars').eq('attorney_id', attorney.id)
  if (!rows || rows.length === 0) return { count: 0, avg: null }
  const avg = rows.reduce((s, r) => s + Number(r.stars), 0) / rows.length
  return { count: rows.length, avg: Number(avg.toFixed(2)) }
}

export async function PATCH(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  let body: EditablePayload
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if ('tagline' in body) update.tagline = clean(body.tagline, 160)
  if ('intro' in body) update.intro = clean(body.intro, 600)
  if ('bio' in body) update.bio = clean(body.bio, 4000)
  if ('languages' in body) update.languages = cleanArray(body.languages)
  if ('education' in body) update.education = clean(body.education, 1200)
  if ('specialties' in body) update.specialties = cleanArray(body.specialties)
  if ('jurisdictions' in body) update.jurisdictions = clean(body.jurisdictions, 500)
  if ('practice_areas' in body) update.practice_areas = clean(body.practice_areas, 500)
  if ('video_intro_url' in body) update.video_intro_url = clean(body.video_intro_url, 500)
  if ('timezone' in body) update.timezone = clean(body.timezone, 80)
  if ('offers_free_consult' in body) update.offers_free_consult = Boolean(body.offers_free_consult)
  if ('available' in body) update.available = Boolean(body.available)

  if ('years_experience' in body) {
    const n = Number(body.years_experience)
    update.years_experience = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  if ('starting_price' in body) {
    const n = Number(body.starting_price)
    update.starting_price = Number.isFinite(n) && n > 0 ? n : null
  }

  // Username lives on profiles, not attorneys — handle it separately.
  // Slug rules: 3–32 chars, [a-z0-9_-], must start+end with [a-z0-9].
  let usernameWrite: string | null | undefined = undefined
  if ('username' in body) {
    const raw = typeof (body as any).username === 'string' ? (body as any).username.trim().toLowerCase() : ''
    if (raw === '') {
      usernameWrite = null
    } else if (!/^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/.test(raw)) {
      return Response.json(
        {
          error:
            'Username must be 3–32 chars, lowercase letters, numbers, dashes or underscores; cannot start or end with - or _.',
        },
        { status: 400 },
      )
    } else {
      usernameWrite = raw
    }
  }

  // bar_number + credential_type live on attorney_applications (the source of
  // truth for credential vetting). Attorneys edit these from the intake
  // wizard. Write to the most recent approved application.
  let applicationWrite: { bar_number?: string | null; credential_type?: string | null } = {}
  if ('bar_number' in body) applicationWrite.bar_number = clean((body as any).bar_number, 120)
  if ('credential_type' in body) applicationWrite.credential_type = clean((body as any).credential_type, 120)
  const wantsAppWrite = Object.keys(applicationWrite).length > 0

  // intake_last_step lives on profiles — saved after every wizard step so
  // re-opening the wizard resumes on the correct step.
  let lastStepWrite: number | undefined
  if ('intake_last_step' in body) {
    const n = Number((body as any).intake_last_step)
    if (Number.isFinite(n) && n >= 0 && n <= 50) lastStepWrite = Math.floor(n)
  }

  if (
    Object.keys(update).length === 0 &&
    usernameWrite === undefined &&
    !wantsAppWrite &&
    lastStepWrite === undefined
  ) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  if (usernameWrite !== undefined || lastStepWrite !== undefined) {
    if (usernameWrite !== undefined && usernameWrite !== null) {
      const { data: clash } = await ctx.db
        .from('profiles')
        .select('id')
        .eq('username', usernameWrite)
        .neq('id', ctx.profileId)
        .maybeSingle()
      if (clash) {
        return Response.json({ error: 'That handle is taken — try another.' }, { status: 409 })
      }
    }
    const profUpdate: Record<string, unknown> = {}
    if (usernameWrite !== undefined) profUpdate.username = usernameWrite
    if (lastStepWrite !== undefined) profUpdate.intake_last_step = lastStepWrite
    const { error: profErr } = await ctx.db
      .from('profiles')
      .update(profUpdate)
      .eq('id', ctx.profileId)
    if (profErr) return Response.json({ error: profErr.message }, { status: 500 })
  }

  if (wantsAppWrite) {
    const { data: app } = await ctx.db
      .from('attorney_applications')
      .select('id')
      .eq('profile_id', ctx.profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (app?.id) {
      const { error: appErr } = await ctx.db
        .from('attorney_applications')
        .update(applicationWrite)
        .eq('id', app.id)
      if (appErr) return Response.json({ error: appErr.message }, { status: 500 })
    }
  }

  let attorney: any = null
  if (Object.keys(update).length > 0) {
    const { data, error: updErr } = await ctx.db
      .from('attorneys')
      .update(update)
      .eq('id', ctx.attorneyId)
      .select('id, jurisdictions, practice_areas, bio, available, headshot_url, headshot_path, tagline, intro, languages, years_experience, education, specialties, offers_free_consult, starting_price, video_intro_url, timezone')
      .single()
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
    attorney = data
  }

  return Response.json({ attorney, username: usernameWrite ?? undefined })
}
