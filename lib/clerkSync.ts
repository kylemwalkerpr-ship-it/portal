/**
 * Helpers that mirror Clerk-managed user state into our profiles table.
 *
 * Clerk owns the source of truth for:
 *   - verified phone numbers
 *   - TOTP / 2FA enrolment
 *   - email primary verification
 *
 * Our `profiles` row mirrors these so the rest of the app can read them
 * without a per-request Clerk round-trip. Sync runs on every Settings →
 * read so it's always fresh by the time the user sees the form.
 */
import { clerkClient } from '@clerk/nextjs/server'
import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

type DB = ReturnType<typeof createSupabaseAdminClient>

export interface ClerkSnapshot {
  primary_email:   string | null
  primary_phone:   string | null
  phone_verified:  boolean
  email_verified:  boolean
  two_factor:      boolean
  totp_enabled:    boolean
  backup_codes:    boolean
}

/**
 * Read the signed-in user's Clerk state. Never throws — returns a blank
 * snapshot on failure so callers degrade gracefully.
 */
export async function readClerkSnapshot(): Promise<ClerkSnapshot> {
  try {
    const clerkUserId = await getClerkUserId()
    if (!clerkUserId) return blank()
    const client = await clerkClient()
    const u = await client.users.getUser(clerkUserId)
    const primaryEmail = u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)
    const primaryPhone = u.phoneNumbers.find(p => p.id === u.primaryPhoneNumberId)
    return {
      primary_email:  primaryEmail?.emailAddress || null,
      primary_phone:  primaryPhone?.phoneNumber || null,
      phone_verified: !!primaryPhone && primaryPhone.verification?.status === 'verified',
      email_verified: !!primaryEmail && primaryEmail.verification?.status === 'verified',
      two_factor:     !!u.totpEnabled || !!u.backupCodeEnabled || !!u.twoFactorEnabled,
      totp_enabled:   !!u.totpEnabled,
      backup_codes:   !!u.backupCodeEnabled,
    }
  } catch {
    return blank()
  }
}

function blank(): ClerkSnapshot {
  return {
    primary_email: null, primary_phone: null,
    phone_verified: false, email_verified: false,
    two_factor: false, totp_enabled: false, backup_codes: false,
  }
}

/**
 * Mirror the Clerk snapshot into the profiles row for this user.
 * Best-effort — never throws to the caller. Updates only the columns
 * that actually exist on the table (self-heals against partial migrations).
 */
export async function mirrorClerkSnapshotToProfile(
  db: DB, profileId: string, snap: ClerkSnapshot,
): Promise<void> {
  if (!profileId) return
  const payload: Record<string, any> = {}
  if (snap.primary_phone) payload.phone = snap.primary_phone
  payload.phone_verified = snap.phone_verified
  if (snap.phone_verified) payload.phone_verified_at = new Date().toISOString()
  payload.two_factor_enabled = snap.two_factor

  // Try the rich update first; if a column is missing, drop it and retry once.
  let { error } = await db.from('profiles').update(payload).eq('id', profileId)
  if (error && /column .* does not exist/i.test(error.message || '')) {
    const m = error.message.match(/column "?([\w_]+)"? of relation/i) || error.message.match(/column "?([\w_]+)"? does not exist/i)
    const bad = m?.[1]
    if (bad && bad in payload) {
      delete payload[bad]
      if (Object.keys(payload).length > 0) {
        await db.from('profiles').update(payload).eq('id', profileId)
      }
    }
  }
}
