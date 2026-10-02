/**
 * Clerk -> Supabase user sync (pure handler; route lives at
 * app/api/webhooks/clerk/route.ts and only does svix verification).
 *
 * Supabase `profiles` is the source of truth for role/status. This handler:
 *   - links a Clerk user to an existing profile by `external_id` (set by the
 *     provisioning script, trusted: only the backend API can write it) or by
 *     a VERIFIED, deliverable primary email (same rule as the dashboard),
 *   - keeps email / username / name in sync (never writes placeholder emails),
 *   - mirrors the DB role/status into Clerk publicMetadata when they differ,
 *   - soft-unlinks on user.deleted (profile and history are kept).
 * It never creates profiles or assigns roles (that is /onboarding's job).
 */
import { isPlaceholderClerkId, isUndeliverableEmail, mirrorProfileToClerk } from './roles'

type Db = { from: (table: string) => any }

export interface ClerkWebhookEventLike {
  type: string
  data: Record<string, any>
}

export interface WebhookOutcome {
  action: 'linked' | 'synced' | 'unlinked' | 'ignored' | 'no_profile'
  profileId?: string
  mirrored?: boolean
}

const PROFILE_COLUMNS = 'id, clerk_user_id, role, status, email, full_name, username'

export function verifiedPrimaryEmail(data: Record<string, any>): string | null {
  const list: any[] = Array.isArray(data?.email_addresses) ? data.email_addresses : []
  const primary = list.find((e) => e?.id === data?.primary_email_address_id) ?? list[0]
  const email = typeof primary?.email_address === 'string' ? primary.email_address.trim().toLowerCase() : ''
  if (!email || primary?.verification?.status !== 'verified' || isUndeliverableEmail(email)) return null
  return email
}

export function deletedClerkIdPlaceholder(clerkUserId: string): string {
  return `deleted:clerk:${clerkUserId}`
}

export async function handleClerkWebhookEvent(
  evt: ClerkWebhookEventLike,
  db: Db,
  mirror: typeof mirrorProfileToClerk = mirrorProfileToClerk,
): Promise<WebhookOutcome> {
  const data = evt?.data ?? {}
  const clerkUserId: string = typeof data.id === 'string' ? data.id : ''
  if (!clerkUserId.startsWith('user_')) return { action: 'ignored' }

  if (evt.type === 'user.deleted') {
    const { data: rows } = await db
      .from('profiles')
      .update({ clerk_user_id: deletedClerkIdPlaceholder(clerkUserId) })
      .eq('clerk_user_id', clerkUserId)
      .select('id')
    const row = Array.isArray(rows) ? rows[0] : null
    return row ? { action: 'unlinked', profileId: row.id } : { action: 'no_profile' }
  }

  if (evt.type !== 'user.created' && evt.type !== 'user.updated') return { action: 'ignored' }

  const email = verifiedPrimaryEmail(data)
  const username = typeof data.username === 'string' && data.username ? data.username.toLowerCase() : null
  const fullName = [data.first_name, data.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' ').trim() || null

  let action: WebhookOutcome['action'] = 'synced'
  let { data: profile } = await db.from('profiles').select(PROFILE_COLUMNS).eq('clerk_user_id', clerkUserId).maybeSingle()

  if (!profile && typeof data.external_id === 'string' && data.external_id) {
    const { data: byExternal } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', data.external_id).maybeSingle()
    // Only claim an unlinked (placeholder) profile; never steal a live link.
    if (byExternal && (isPlaceholderClerkId(byExternal.clerk_user_id) || String(byExternal.clerk_user_id ?? '').startsWith('deleted:'))) {
      profile = byExternal
      action = 'linked'
    }
  }
  if (!profile && email) {
    const { data: byEmail } = await db.from('profiles').select(PROFILE_COLUMNS).ilike('email', email).maybeSingle()
    if (byEmail && !String(byEmail.clerk_user_id ?? '').startsWith('user_')) {
      profile = byEmail
      action = 'linked'
    }
  }
  if (!profile) return { action: 'no_profile' }

  const patch: Record<string, unknown> = {}
  if (action === 'linked') patch.clerk_user_id = clerkUserId
  if (email && email !== String(profile.email ?? '').toLowerCase()) patch.email = email
  if (username && !profile.username && /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$/.test(username)) patch.username = username
  if (fullName && !profile.full_name) patch.full_name = fullName
  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('profiles').update(patch).eq('id', profile.id)
    if (error) throw new Error(`profile sync failed: ${error.message}`)
  }

  const meta = (data.public_metadata ?? {}) as Record<string, unknown>
  let mirrored = false
  if (meta.role !== profile.role || meta.status !== profile.status) {
    mirrored = await mirror(clerkUserId, { role: profile.role, status: profile.status })
  }
  return { action, profileId: profile.id, mirrored }
}
