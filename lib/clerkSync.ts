/**
 * Helpers that mirror Clerk-managed user state into our profiles table.
 *
 * Clerk owns the source of truth for:
 *   - verified phone numbers
 *   - TOTP / 2FA enrolment
 *   - email primary verification
 *
 * Our `profiles` row mirrors these so the rest of the app can read them
 * without a per-request Clerk round-trip. Sync runs on Settings reads
 * with aggressive guards so it never blows the Workers CPU budget:
 *
 *   - 1.5-second wall-time cap via Promise.race (Cloudflare 1102 prevention)
 *   - 60-second per-user in-memory cache (per Worker isolate)
 *   - Lazy ESM import of @clerk/nextjs/server so the cost is only paid
 *     when a sync actually fires
 *   - Silent fallback to a blank snapshot on ANY failure
 */
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

const SNAPSHOT_TTL_MS = 60_000
const snapshotCache = new Map<string, { snap: ClerkSnapshot; expires: number }>()

function blank(): ClerkSnapshot {
  return {
    primary_email: null, primary_phone: null,
    phone_verified: false, email_verified: false,
    two_factor: false, totp_enabled: false, backup_codes: false,
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(timer); resolve(v) })
     .catch(() => { clearTimeout(timer); resolve(fallback) })
  })
}

export async function readClerkSnapshot(): Promise<ClerkSnapshot> {
  try {
    const clerkUserId = await getClerkUserId()
    if (!clerkUserId) return blank()

    const cached = snapshotCache.get(clerkUserId)
    if (cached && cached.expires > Date.now()) return cached.snap

    const snap = await withTimeout(
      (async () => {
        // Lazy import — keeps the Clerk SDK out of the cold-start path of
        // every other API route that doesn't actually need it.
        const { clerkClient } = await import('@clerk/nextjs/server')
        const client = await clerkClient()
        const u: any = await client.users.getUser(clerkUserId)
        const primaryEmail = u.emailAddresses?.find?.((e: any) => e.id === u.primaryEmailAddressId)
        const primaryPhone = u.phoneNumbers?.find?.((p: any) => p.id === u.primaryPhoneNumberId)
        return {
          primary_email:  primaryEmail?.emailAddress || null,
          primary_phone:  primaryPhone?.phoneNumber || null,
          phone_verified: !!primaryPhone && primaryPhone.verification?.status === 'verified',
          email_verified: !!primaryEmail && primaryEmail.verification?.status === 'verified',
          two_factor:     !!u.totpEnabled || !!u.backupCodeEnabled || !!u.twoFactorEnabled,
          totp_enabled:   !!u.totpEnabled,
          backup_codes:   !!u.backupCodeEnabled,
        } as ClerkSnapshot
      })(),
      1500,
      blank(),
    )

    // Cache even blank snapshots so a flaky Clerk doesn't get retried
    // every request during a burst.
    snapshotCache.set(clerkUserId, { snap, expires: Date.now() + SNAPSHOT_TTL_MS })
    return snap
  } catch {
    return blank()
  }
}

/**
 * Mirror the Clerk snapshot into the profiles row for this user.
 * Best-effort — never throws. Self-heals against partial migrations.
 */
export async function mirrorClerkSnapshotToProfile(
  db: DB, profileId: string, snap: ClerkSnapshot,
): Promise<void> {
  if (!profileId) return
  // If we have no Clerk info to mirror, skip the write entirely.
  if (!snap.primary_phone && !snap.phone_verified && !snap.two_factor) return

  const payload: Record<string, any> = {}
  if (snap.primary_phone) payload.phone = snap.primary_phone
  payload.phone_verified = snap.phone_verified
  if (snap.phone_verified) payload.phone_verified_at = new Date().toISOString()
  payload.two_factor_enabled = snap.two_factor

  try {
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
  } catch {
    /* never bubble */
  }
}
