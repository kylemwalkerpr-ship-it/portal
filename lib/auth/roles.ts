/**
 * Roles: Supabase `profiles.role` / `profiles.status` is the SOURCE OF TRUTH.
 *
 * - Roles are never read from Clerk `unsafeMetadata` (browser-writable) or
 *   from the URL. New accounts choose on /onboarding; providers go through
 *   one application (pending -> admin approval -> active).
 * - The DB value is mirrored (best-effort, server-only) to Clerk
 *   `publicMetadata.{role,status}` so the session token can carry it as a
 *   claim. Mirroring is skipped silently when CLERK_SECRET_KEY is absent or
 *   YS_CLERK_ROLE_MIRROR=off, so nothing breaks before Clerk is configured.
 */

export type ProviderType = 'attorney' | 'regulated_adviser' | 'consultant'
export type ProviderRole = 'attorney' | 'consultant'
export type SelfServiceRole = 'client' | ProviderRole

export const PROVIDER_TYPES: readonly ProviderType[] = ['attorney', 'regulated_adviser', 'consultant']

export function normalizeProviderType(value: unknown): ProviderType | null {
  if (typeof value !== 'string') return null
  const lower = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (lower === 'attorney' || lower === 'lawyer' || lower === 'solicitor' || lower === 'barrister') return 'attorney'
  if (lower === 'regulated_adviser' || lower === 'regulated_advisor' || lower === 'rcic' || lower === 'oisc' || lower === 'iaa' || lower === 'rma') return 'regulated_adviser'
  if (lower === 'consultant') return 'consultant'
  return null
}

/**
 * Licensed lawyers and regulated immigration advisers (RCIC, OISC/IAA, RMA)
 * share the legal-panel role and queue (attorney_applications already models
 * those credential types); non-legal consultants use the consultant queue.
 */
export function roleForProviderType(type: ProviderType): ProviderRole {
  return type === 'consultant' ? 'consultant' : 'attorney'
}

export function isProviderRole(role: unknown): role is ProviderRole {
  return role === 'attorney' || role === 'consultant'
}

/** Profile statuses that still allow (re)submitting a provider application. */
export function canSubmitProviderApplication(status: unknown): boolean {
  return status !== 'active' && status !== 'suspended'
}

/** True for the synthetic placeholder link used by un-provisioned providers. */
export function isPlaceholderClerkId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('inactive:')
}

/** True for an address that can never receive mail (placeholders). */
export function isUndeliverableEmail(value: unknown): boolean {
  if (typeof value !== 'string') return true
  const email = value.trim().toLowerCase()
  if (!email || !email.includes('@')) return true
  return email.endsWith('.invalid') || email.endsWith('@providers.invalid') || email.endsWith('.example') || email.endsWith('.test')
}

export function clerkRoleMirrorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if ((env.YS_CLERK_ROLE_MIRROR ?? '').toLowerCase() === 'off') return false
  return Boolean(env.CLERK_SECRET_KEY)
}

/**
 * Best-effort mirror of the DB role/status into Clerk publicMetadata (merged,
 * other keys preserved). Never throws; 1.5 s cap (Workers CPU/wall budget).
 */
export async function mirrorProfileToClerk(
  clerkUserId: string | null | undefined,
  fields: { role?: string | null; status?: string | null; extra?: Record<string, unknown> },
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!clerkUserId || !clerkUserId.startsWith('user_')) return false
  if (!clerkRoleMirrorEnabled(env)) return false
  const publicMetadata: Record<string, unknown> = { ...(fields.extra ?? {}) }
  if (fields.role) publicMetadata.role = fields.role
  if (fields.status) publicMetadata.status = fields.status
  if (Object.keys(publicMetadata).length === 0) return false
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), 1500) : null
  try {
    const res = await fetchImpl(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}/metadata`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ public_metadata: publicMetadata }),
      signal: controller?.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type Db = { from: (table: string) => any }

/** Client activity guard: never silently turn a transacting client into a provider. */
export async function clientHasActivity(db: Db, profileId: string): Promise<boolean> {
  try {
    const [orders, inquiries] = await Promise.all([
      db.from('orders').select('id', { count: 'exact', head: true }).eq('client_id', profileId),
      db.from('inquiries').select('id', { count: 'exact', head: true }).eq('client_profile_id', profileId),
    ])
    return (orders?.count ?? 0) > 0 || (inquiries?.count ?? 0) > 0
  } catch {
    // Fail closed: if we cannot prove there is no activity, treat it as active.
    return true
  }
}

const PROFILE_COLUMNS = 'id, clerk_user_id, role, status, full_name, email, username'

export interface ProfileRow {
  id: string
  clerk_user_id: string | null
  role: string
  status: string
  full_name: string | null
  email: string | null
  username?: string | null
}

/**
 * Find the caller's profile by Clerk id, falling back to a relink by the
 * VERIFIED Clerk email (same rule as lib/portalAuth.ts requirePortalUser).
 * Role and status are preserved exactly; nothing is inferred.
 */
export async function findOrLinkProfile(
  db: Db,
  clerkUserId: string,
  verifiedEmail: string | null | undefined,
): Promise<ProfileRow | null> {
  const { data: byId } = await db.from('profiles').select(PROFILE_COLUMNS).eq('clerk_user_id', clerkUserId).maybeSingle()
  if (byId) return byId as ProfileRow
  const email = (verifiedEmail ?? '').trim().toLowerCase()
  if (!email || isUndeliverableEmail(email)) return null
  const { data: byEmail } = await db.from('profiles').select(PROFILE_COLUMNS).ilike('email', email).maybeSingle()
  if (!byEmail) return null
  const { data: linked } = await db
    .from('profiles')
    .update({ clerk_user_id: clerkUserId })
    .eq('id', (byEmail as ProfileRow).id)
    .select(PROFILE_COLUMNS)
    .single()
  return (linked as ProfileRow) ?? (byEmail as ProfileRow)
}

/** Create the first profile row for a brand-new account (onboarding only). */
export async function createProfile(
  db: Db,
  row: { clerkUserId: string; email: string | null; fullName: string | null; role: SelfServiceRole; status: string; vertical?: string | null },
): Promise<ProfileRow | null> {
  const base: Record<string, unknown> = {
    clerk_user_id: row.clerkUserId,
    email: (row.email ?? '').trim().toLowerCase(),
    full_name: row.fullName || null,
    role: row.role,
    status: row.status,
  }
  if (row.vertical) base.vertical = row.vertical
  let result = await db.from('profiles').upsert(base, { onConflict: 'clerk_user_id' }).select(PROFILE_COLUMNS).single()
  if (result.error && /column .*vertical/i.test(result.error.message || '')) {
    const { vertical: _v, ...rest } = base
    result = await db.from('profiles').upsert(rest, { onConflict: 'clerk_user_id' }).select(PROFILE_COLUMNS).single()
  }
  if (result.error) {
    console.error('[roles] profile create failed:', result.error.message)
    return null
  }
  return result.data as ProfileRow
}
