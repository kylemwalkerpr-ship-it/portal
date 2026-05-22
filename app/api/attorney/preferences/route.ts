/**
 * GET / PATCH /api/attorney/preferences
 *
 * Reads + writes the signed-in attorney's profile + notification + privacy
 * preferences, and surfaces a compliance snapshot (manual-payout status,
 * bar admission, insurance) so the Settings UI can show progress in one shot.
 *
 * Self-heals when newer columns on profiles/attorneys aren't migrated yet.
 */
import { requireAttorney } from '@/lib/attorneyAuth'

const DEFAULT_NOTIF = {
  email_inquiries: true,
  email_offers: true,
  email_orders: true,
  email_messages: true,
  email_payments: true,
  email_weekly_digest: false,
  email_promo: false,
}
const DEFAULT_PRIVACY = {
  show_full_name: true,
  share_email_with_clients: false,
  allow_analytics: true,
  marketing_emails: false,
}

const PROFILE_COLS = [
  'phone', 'timezone', 'language', 'avatar_url',
  'address_line1', 'address_line2', 'city', 'postal_code', 'country',
]

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })
  const { db, profileId, attorneyId } = ctx

  // Mirror Clerk-managed state. Snapshot is time-bounded + cached (see
  // lib/clerkSync.ts); DB mirror is fire-and-forget. Prevents 1102.
  const { readClerkSnapshot, mirrorClerkSnapshotToProfile } = await import('@/lib/clerkSync')
  const snap = await readClerkSnapshot()
  void mirrorClerkSnapshotToProfile(db, profileId, snap)

  let { data: profile, error: pErr } = await db
    .from('profiles')
    .select('id, full_name, email, phone, phone_verified, phone_verified_at, two_factor_enabled, timezone, language, avatar_url, address_line1, address_line2, city, postal_code, country, notif_prefs, privacy_prefs, ui_prefs, vertical, created_at')
    .eq('id', profileId)
    .single()
  if (pErr && /column .* does not exist/i.test(pErr.message || '')) {
    const r = await db.from('profiles').select('*').eq('id', profileId).single()
    profile = r.data as any
    pErr = r.error as any
  }
  if (pErr || !profile) return Response.json({ error: pErr?.message || 'Profile not found' }, { status: 500 })

  const [{ data: attorney }, { data: application }] = await Promise.all([
    db.from('attorneys').select('available, notif_prefs').eq('id', attorneyId).maybeSingle(),
    db.from('attorney_applications')
      .select('credential_type, bar_number, malpractice_insurance, jurisdictions, decided_at, status')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .order('decided_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Merge notification prefs from BOTH profile.notif_prefs and attorneys.notif_prefs.
  // Profile-level is the source of truth; attorney row is the legacy storage.
  const mergedNotif = {
    ...DEFAULT_NOTIF,
    ...((attorney as any)?.notif_prefs || {}),
    ...((profile as any)?.notif_prefs || {}),
  }

  return Response.json({
    profile: {
      id:        profile.id,
      full_name: profile.full_name,
      email:     profile.email,
      phone:     (profile as any).phone || snap.primary_phone || '',
      phone_verified: !!(profile as any).phone_verified || snap.phone_verified,
      phone_verified_at: (profile as any).phone_verified_at || null,
      timezone:  (profile as any).timezone || '',
      language:  (profile as any).language || 'en',
      avatar_url: (profile as any).avatar_url || null,
      address_line1: (profile as any).address_line1 || '',
      address_line2: (profile as any).address_line2 || '',
      city:      (profile as any).city || '',
      postal_code: (profile as any).postal_code || '',
      country:   (profile as any).country || '',
      vertical:  (profile as any).vertical || null,
      member_since: profile.created_at || null,
    },
    notif_prefs:   mergedNotif,
    privacy_prefs: { ...DEFAULT_PRIVACY, ...((profile as any)?.privacy_prefs || {}) },
    ui_prefs:      (profile as any)?.ui_prefs || {},
    security: {
      email_verified:      snap.email_verified,
      phone_verified:      !!(profile as any).phone_verified || snap.phone_verified,
      two_factor_enabled:  !!(profile as any).two_factor_enabled || snap.two_factor,
      totp_enabled:        snap.totp_enabled,
      backup_codes:        snap.backup_codes,
    },
    compliance: {
      available:                  (attorney as any)?.available !== false,
      credential_type:            (application as any)?.credential_type || null,
      bar_number:                 (application as any)?.bar_number || null,
      malpractice_insurance:      (application as any)?.malpractice_insurance || null,
      jurisdictions:              (application as any)?.jurisdictions || null,
      approved_at:                (application as any)?.decided_at || null,
    },
  })
}

export async function PATCH(req: Request) {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })
  const { db, profileId, attorneyId } = ctx

  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const profilePayload: Record<string, any> = {}
  for (const k of PROFILE_COLS) {
    if (k in body && typeof body[k] === 'string') profilePayload[k] = body[k].trim().slice(0, 200)
  }
  if (body.first_name || body.last_name || body.salutation) {
    const full = [body.salutation, body.first_name, body.last_name].filter((s: any) => typeof s === 'string' && s.trim()).join(' ').trim()
    if (full) profilePayload.full_name = full.slice(0, 200)
  }
  if (body.notif_prefs && typeof body.notif_prefs === 'object') {
    profilePayload.notif_prefs = { ...DEFAULT_NOTIF, ...body.notif_prefs }
  }
  if (body.privacy_prefs && typeof body.privacy_prefs === 'object') {
    profilePayload.privacy_prefs = { ...DEFAULT_PRIVACY, ...body.privacy_prefs }
  }
  if (body.ui_prefs && typeof body.ui_prefs === 'object') {
    profilePayload.ui_prefs = body.ui_prefs
  }

  // Attorney-level mirrors (kept for legacy reads on /api/attorney/data)
  const attorneyPayload: Record<string, any> = {}
  if (body.available !== undefined) attorneyPayload.available = !!body.available
  if (body.notif_prefs && typeof body.notif_prefs === 'object') {
    attorneyPayload.notif_prefs = { ...DEFAULT_NOTIF, ...body.notif_prefs }
  }

  if (Object.keys(profilePayload).length === 0 && Object.keys(attorneyPayload).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Save profile (self-heal if some column is missing)
  if (Object.keys(profilePayload).length > 0) {
    let { error: profErr } = await db.from('profiles').update(profilePayload).eq('id', profileId)
    if (profErr && /column .* does not exist/i.test(profErr.message || '')) {
      const m = profErr.message.match(/column "?([\w_]+)"? of relation/i) || profErr.message.match(/column "?([\w_]+)"? does not exist/i)
      const bad = m?.[1]
      if (bad && bad in profilePayload) {
        delete profilePayload[bad]
        if (Object.keys(profilePayload).length > 0) {
          const retry = await db.from('profiles').update(profilePayload).eq('id', profileId)
          profErr = retry.error as any
        } else { profErr = null }
      }
    }
    if (profErr) return Response.json({ error: profErr.message }, { status: 500 })
  }

  if (Object.keys(attorneyPayload).length > 0) {
    const { error: attorneyErr } = await db.from('attorneys').update(attorneyPayload).eq('id', attorneyId)
    if (attorneyErr) return Response.json({ error: attorneyErr.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
