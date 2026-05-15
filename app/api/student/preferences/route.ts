/**
 * GET / PATCH /api/student/preferences
 * Read and update the signed-in student's profile + notification + privacy
 * preferences. Self-heals if preference columns aren't migrated yet by
 * returning sensible defaults / no-op on PATCH.
 */
import { getCurrentStudent } from '@/lib/student'

const DEFAULT_NOTIF = {
  email_messages: true,
  email_orders: true,
  email_offers: true,
  email_promo: false,
  email_weekly_digest: false,
}
const DEFAULT_PRIVACY = {
  share_profile_with_consultants: true,
  allow_analytics: true,
  marketing_emails: false,
}

const ALLOWED_COLS = new Set([
  'phone', 'timezone', 'language', 'avatar_url',
  'address_line1', 'address_line2', 'city', 'postal_code', 'country',
  'salutation', 'first_name', 'last_name', // pass-through; merged into full_name below
])

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  // Mirror Clerk-managed state (verified phone, 2FA) into our row before read
  const { readClerkSnapshot, mirrorClerkSnapshotToProfile } = await import('@/lib/clerkSync')
  const snap = await readClerkSnapshot()
  await mirrorClerkSnapshotToProfile(db, profile.id, snap)

  let { data, error } = await db
    .from('profiles')
    .select('id, full_name, email, phone, phone_verified, phone_verified_at, two_factor_enabled, timezone, language, avatar_url, address_line1, address_line2, city, postal_code, country, notif_prefs, privacy_prefs, ui_prefs, vertical, created_at')
    .eq('id', profile.id)
    .single()

  // Self-heal if the migration hasn't run yet
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const r = await db.from('profiles').select('*').eq('id', profile.id).single()
    data = r.data as any
    error = r.error as any
  }
  if (error || !data) return Response.json({ error: error?.message || 'Profile not found' }, { status: 500 })
  const row: any = data

  return Response.json({
    profile: {
      id:        row.id,
      full_name: row.full_name,
      email:     row.email,
      phone:     row.phone || snap.primary_phone || '',
      phone_verified: !!row.phone_verified || snap.phone_verified,
      phone_verified_at: row.phone_verified_at || null,
      timezone:  row.timezone || '',
      language:  row.language || 'en',
      avatar_url: row.avatar_url || null,
      address_line1: row.address_line1 || '',
      address_line2: row.address_line2 || '',
      city:      row.city || '',
      postal_code: row.postal_code || '',
      country:   row.country || '',
      vertical:  row.vertical || null,
      member_since: row.created_at || null,
    },
    security: {
      email_verified:      snap.email_verified,
      phone_verified:      !!row.phone_verified || snap.phone_verified,
      two_factor_enabled:  !!row.two_factor_enabled || snap.two_factor,
      totp_enabled:        snap.totp_enabled,
      backup_codes:        snap.backup_codes,
    },
    notif_prefs:   { ...DEFAULT_NOTIF,   ...(row.notif_prefs   || {}) },
    privacy_prefs: { ...DEFAULT_PRIVACY, ...(row.privacy_prefs || {}) },
    ui_prefs:      row.ui_prefs || {},
  })
}

export async function PATCH(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const payload: Record<string, any> = {}

  // Identity & contact
  for (const k of ALLOWED_COLS) {
    if (k in body && typeof body[k] === 'string') payload[k] = body[k].trim().slice(0, 200)
  }
  // Merge first/last/salutation into full_name if provided
  if (body.first_name || body.last_name || body.salutation) {
    const full = [body.salutation, body.first_name, body.last_name].filter(s => typeof s === 'string' && s.trim()).join(' ').trim()
    if (full) payload.full_name = full.slice(0, 200)
    // The split-name columns themselves aren't in the schema, so remove them.
    delete payload.first_name; delete payload.last_name; delete payload.salutation
  }

  if (body.notif_prefs && typeof body.notif_prefs === 'object') {
    payload.notif_prefs = { ...DEFAULT_NOTIF, ...body.notif_prefs }
  }
  if (body.privacy_prefs && typeof body.privacy_prefs === 'object') {
    payload.privacy_prefs = { ...DEFAULT_PRIVACY, ...body.privacy_prefs }
  }
  if (body.ui_prefs && typeof body.ui_prefs === 'object') {
    payload.ui_prefs = body.ui_prefs
  }

  if (Object.keys(payload).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  let { data, error } = await db.from('profiles').update(payload).eq('id', profile.id).select('*').single()

  // Self-heal: drop unknown columns and retry once
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const m = error.message.match(/column "?([\w_]+)"? of relation/i) || error.message.match(/column "?([\w_]+)"? does not exist/i)
    const bad = m?.[1]
    if (bad && bad in payload) {
      delete payload[bad]
      if (Object.keys(payload).length > 0) {
        const r = await db.from('profiles').update(payload).eq('id', profile.id).select('*').single()
        data = r.data as any
        error = r.error as any
      } else {
        return Response.json({ warning: 'preferences_schema_partial — run supabase/profile_preferences.sql for full fidelity', profile: null })
      }
    }
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ profile: data })
}
