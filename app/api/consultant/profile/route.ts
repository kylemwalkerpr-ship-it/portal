import { getCurrentConsultant } from '@/lib/consultant'

const RICH_TEXT: Record<string, number> = {
  bio: 4000,
  tagline: 160,
  intro: 600,
  education: 1200,
  jurisdictions: 500,
  practice_areas: 500,
  video_intro_url: 500,
  timezone: 80,
}

const RICH_ARRAY: Record<string, { max: number; itemMax: number }> = {
  specialties: { max: 30, itemMax: 80 },
  languages: { max: 30, itemMax: 80 },
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  return t.slice(0, max)
}

function cleanArray(value: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim().slice(0, itemMax))
    .filter(Boolean)
    .slice(0, max)
}

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile, consultant } = auth

  const { data: full } = await db
    .from('consultants')
    .select(
      'id, profile_id, bio, available, headshot_url, headshot_path, tagline, intro, jurisdictions, practice_areas, specialties, languages, education, timezone, years_experience, starting_price, offers_free_consult, consult_booking_url, video_intro_url',
    )
    .eq('id', consultant.id)
    .maybeSingle()

  const { data: profileRow } = await db
    .from('profiles')
    .select('id, email, full_name, status, username, intake_last_step')
    .eq('id', profile.id)
    .single()

  return Response.json({
    profile: {
      id: profileRow?.id,
      email: profileRow?.email,
      full_name: profileRow?.full_name,
      status: profileRow?.status,
      username: profileRow?.username ?? null,
      intake_last_step: profileRow?.intake_last_step ?? 0,
    },
    consultant: full ?? null,
  })
}

export async function PATCH(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile, consultant } = auth
  const body = await req.json().catch(() => ({}))

  /* ── profiles updates (full_name, email, username, intake_last_step) ── */
  const profilePayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') profilePayload.full_name = body.full_name.trim()
  if (typeof body.email === 'string' && body.email.trim()) profilePayload.email = body.email.trim()
  if (typeof body.intake_last_step === 'number' && body.intake_last_step >= 0) {
    profilePayload.intake_last_step = Math.floor(body.intake_last_step)
  }

  let usernameWrite: string | null | undefined
  if ('username' in body) {
    const raw = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
    if (raw === '') usernameWrite = null
    else if (!/^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/.test(raw)) {
      return Response.json(
        { error: 'Username must be 3–32 chars, lowercase letters, numbers, dashes or underscores; cannot start or end with - or _.' },
        { status: 400 },
      )
    } else usernameWrite = raw
  }

  if (usernameWrite !== undefined) {
    if (usernameWrite !== null) {
      const { data: clash } = await db
        .from('profiles')
        .select('id')
        .eq('username', usernameWrite)
        .neq('id', profile.id)
        .maybeSingle()
      if (clash) return Response.json({ error: 'That handle is taken — try another.' }, { status: 409 })
    }
    profilePayload.username = usernameWrite
  }

  if (Object.keys(profilePayload).length > 0) {
    const { error } = await db.from('profiles').update(profilePayload).eq('id', profile.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  /* ── consultants updates (rich profile fields) ── */
  const consultantPayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') consultantPayload.full_name = body.full_name.trim()
  if (typeof body.email === 'string' && body.email.trim()) consultantPayload.email = body.email.trim()
  if (typeof body.available === 'boolean') consultantPayload.available = body.available
  if (typeof body.auto_withdraw === 'boolean') consultantPayload.auto_withdraw = body.auto_withdraw
  if (typeof body.offers_free_consult === 'boolean') consultantPayload.offers_free_consult = body.offers_free_consult
  if ('consult_booking_url' in body) {
    // Light validation only — HTTPS-only, no javascript: schemes. The
    // editor enforces a Calendly/Cal.com hint but anything that looks
    // like a real URL is accepted (consultants may use other tools).
    const raw = cleanText((body as Record<string, unknown>).consult_booking_url, 400)
    consultantPayload.consult_booking_url = raw && /^https?:\/\//i.test(raw) ? raw : null
  }
  if (body.notif_prefs && typeof body.notif_prefs === 'object') consultantPayload.notif_prefs = body.notif_prefs

  for (const [k, max] of Object.entries(RICH_TEXT)) {
    if (k in body) consultantPayload[k] = cleanText((body as any)[k], max)
  }
  for (const [k, { max, itemMax }] of Object.entries(RICH_ARRAY)) {
    if (k in body) consultantPayload[k] = cleanArray((body as any)[k], max, itemMax)
  }

  if ('years_experience' in body) {
    const n = Number((body as any).years_experience)
    consultantPayload.years_experience = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
  }
  if ('starting_price' in body) {
    const n = Number((body as any).starting_price)
    consultantPayload.starting_price = Number.isFinite(n) && n > 0 ? n : null
  }

  if (Object.keys(consultantPayload).length > 0) {
    const { error } = await db.from('consultants').update(consultantPayload).eq('id', consultant.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, username: usernameWrite ?? undefined })
}
