/**
 * Pure helpers for scripts/clerk/provision-provider-accounts.ts (kept in lib/
 * so they are unit-tested and type-checked; no I/O here).
 *
 * Policy (Kyle, 2026-10-02):
 *   - Every provider gets a Clerk account with username = profiles.username.
 *   - A deliverable email is attached; placeholder / undeliverable emails
 *     (`*.invalid`, etc.) are NEVER sent to Clerk -> username-only account.
 *   - Temporary CSPRNG password + publicMetadata.mustChangePassword=true; the
 *     portal forces /account/change-password on first sign-in.
 *   - external_id = profiles.id, so re-runs and the webhook can re-link.
 */
import { isPlaceholderClerkId, isUndeliverableEmail } from '../auth/roles'

export interface ProviderProfile {
  id: string
  username: string | null
  email: string | null
  full_name: string | null
  role: string
  status: string | null
  clerk_user_id: string | null
}

export interface ClerkUserLite {
  id: string
  username: string | null
  external_id: string | null
  email_addresses: string[]
}

export type PlanAction =
  | 'skip_linked' // profile already linked to a live Clerk user
  | 'stale_link' // linked id not found in Clerk -> manual review
  | 'link_existing' // Clerk user we created earlier (external_id match) -> link only
  | 'create' // new Clerk user
  | 'conflict' // username/email already used by a different Clerk user
  | 'invalid' // cannot derive a valid username

export interface PlanItem {
  profileId: string
  username: string | null
  role: string
  status: string | null
  action: PlanAction
  email: string | null // deliverable email to attach, or null (username-only)
  clerkUserId: string | null
  reason?: string
}

/** Clerk default username rules: 4-64 chars; we stay within [a-z0-9_-]. */
export const CLERK_USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,62}[a-z0-9]$/

export function clerkUsernameFor(profile: Pick<ProviderProfile, 'username'>): { ok: true; username: string } | { ok: false; reason: string } {
  const raw = (profile.username ?? '').trim().toLowerCase()
  if (!raw) return { ok: false, reason: 'profile has no username' }
  if (!CLERK_USERNAME_RE.test(raw)) return { ok: false, reason: `username "${raw}" is not 4-64 chars of [a-z0-9_-]` }
  return { ok: true, username: raw }
}

export function deliverableEmail(profile: Pick<ProviderProfile, 'email'>): string | null {
  const email = (profile.email ?? '').trim().toLowerCase()
  return email && !isUndeliverableEmail(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const ALPHABET = LOWER + UPPER + DIGITS // 57 symbols, no 0/O/1/l/I

/**
 * Temporary password: 20 symbols from a 57-char unambiguous alphabet
 * (~116 bits) shown as 4 groups of 5 joined by '-', guaranteed to contain a
 * lower, an upper and a digit. `randomInt` must be a CSPRNG
 * (node:crypto.randomInt).
 */
export function generateTempPassword(randomInt: (max: number) => number): string {
  for (;;) {
    const chars: string[] = []
    for (let i = 0; i < 20; i += 1) chars.push(ALPHABET[randomInt(ALPHABET.length)])
    const joined = chars.join('')
    if (/[a-z]/.test(joined) && /[A-Z]/.test(joined) && /[2-9]/.test(joined)) {
      return joined.match(/.{5}/g)!.join('-')
    }
  }
}

export function planProvisioning(providers: ProviderProfile[], clerkUsers: ClerkUserLite[]): PlanItem[] {
  const byId = new Map(clerkUsers.map((u) => [u.id, u]))
  const byExternal = new Map(clerkUsers.filter((u) => u.external_id).map((u) => [u.external_id as string, u]))
  const byUsername = new Map(clerkUsers.filter((u) => u.username).map((u) => [(u.username as string).toLowerCase(), u]))
  const byEmail = new Map<string, ClerkUserLite>()
  for (const u of clerkUsers) for (const e of u.email_addresses) byEmail.set(e.toLowerCase(), u)
  const seenUsernames = new Set<string>()

  return providers.map((p): PlanItem => {
    const email = deliverableEmail(p)
    const base = { profileId: p.id, role: p.role, status: p.status, email }
    const linked = (p.clerk_user_id ?? '').startsWith('user_') ? (p.clerk_user_id as string) : null
    if (linked) {
      return byId.has(linked)
        ? { ...base, username: p.username, action: 'skip_linked', clerkUserId: linked }
        : { ...base, username: p.username, action: 'stale_link', clerkUserId: linked, reason: 'linked Clerk user not found' }
    }
    const ours = byExternal.get(p.id)
    if (ours) return { ...base, username: ours.username ?? p.username, action: 'link_existing', clerkUserId: ours.id }

    const uname = clerkUsernameFor(p)
    if (uname.ok === false) return { ...base, username: p.username, action: 'invalid', clerkUserId: null, reason: (uname as { reason: string }).reason }
    const username = (uname as { username: string }).username
    if (seenUsernames.has(username)) return { ...base, username, action: 'invalid', clerkUserId: null, reason: 'duplicate username in batch' }
    seenUsernames.add(username)

    const takenBy = byUsername.get(username)
    if (takenBy) return { ...base, username, action: 'conflict', clerkUserId: takenBy.id, reason: 'username already used by another Clerk user (no external_id match)' }
    const emailOwner = email ? byEmail.get(email) : undefined
    if (emailOwner) return { ...base, username, action: 'conflict', clerkUserId: emailOwner.id, reason: 'email already on another Clerk user; link via sign-in/webhook instead' }
    if (!isPlaceholderClerkId(p.clerk_user_id) && p.clerk_user_id) {
      // Unknown non-Clerk link format: leave for manual review.
      return { ...base, username, action: 'conflict', clerkUserId: null, reason: `unexpected clerk_user_id format` }
    }
    return { ...base, username, action: 'create', clerkUserId: null }
  })
}

export function summarizePlan(plan: PlanItem[]): Record<PlanAction | 'username_only' | 'with_email', number> {
  const out = { skip_linked: 0, stale_link: 0, link_existing: 0, create: 0, conflict: 0, invalid: 0, username_only: 0, with_email: 0 }
  for (const item of plan) {
    out[item.action] += 1
    if (item.action === 'create') item.email ? (out.with_email += 1) : (out.username_only += 1)
  }
  return out
}

export function splitName(fullName: string | null): { first_name?: string; last_name?: string } {
  // Drop editorial notes like "(also styled …)" and trailing ", KC" style suffixes.
  const cleaned = (fullName ?? '').replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first_name: parts[0].slice(0, 100) }
  return { first_name: parts.slice(0, -1).join(' ').slice(0, 100), last_name: parts[parts.length - 1].slice(0, 100) }
}

export const TEMP_PASSWORD_TTL_DAYS = 14

export function provisioningMetadata(item: Pick<PlanItem, 'role' | 'status'>, issuedAt: Date) {
  return {
    role: item.role,
    status: item.status ?? 'pending',
    mustChangePassword: true,
    tempPasswordIssuedAt: issuedAt.toISOString(),
    tempPasswordExpiresAt: new Date(issuedAt.getTime() + TEMP_PASSWORD_TTL_DAYS * 86400000).toISOString(),
    provisionedBy: 'scripts/clerk/provision-provider-accounts.ts',
  }
}

export function createUserBody(item: PlanItem, fullName: string | null, password: string, issuedAt: Date): Record<string, unknown> {
  const body: Record<string, unknown> = {
    username: item.username,
    password,
    external_id: item.profileId,
    public_metadata: provisioningMetadata(item, issuedAt),
    ...splitName(fullName),
  }
  // Never send placeholder/undeliverable addresses to Clerk.
  if (item.email) body.email_address = [item.email]
  return body
}

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // Neutralise spreadsheet formula injection, then RFC 4180 quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const CREDENTIALS_CSV_HEADER = ['profile_id', 'full_name', 'role', 'username', 'email', 'temporary_password', 'clerk_user_id', 'sign_in_url', 'issued_at', 'expires_at']

export function credentialsCsvLine(values: unknown[]): string {
  return `${values.map(csvEscape).join(',')}\n`
}

export const CREDENTIALS_DIR = '/home/box/private'

export function credentialsPath(date: Date, dir: string = CREDENTIALS_DIR): string {
  return `${dir}/provider-credentials-${date.toISOString().slice(0, 10)}.csv`
}

export function isProductionSecretKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk_live_')
}

/** pk_(live|test)_<base64("clerk.example.com$")> -> https://clerk.example.com */
export function frontendApiFromPublishableKey(pk: string | undefined): string | null {
  const m = /^pk_(?:live|test)_(.+)$/.exec(pk ?? '')
  if (!m) return null
  try {
    const host = Buffer.from(m[1], 'base64').toString('utf8').replace(/\$$/, '')
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null
  } catch {
    return null
  }
}

/** Reads Frontend API /v1/environment user_settings. */
export function usernameOnlySupport(environment: any): { usernameEnabled: boolean; usernameRequired: boolean; emailEnabled: boolean; emailRequired: boolean; passwordEnabled: boolean; usernameOnlyAccepted: boolean } {
  const attrs = environment?.user_settings?.attributes ?? {}
  const usernameEnabled = Boolean(attrs.username?.enabled)
  const usernameRequired = Boolean(attrs.username?.required)
  const emailEnabled = Boolean(attrs.email_address?.enabled)
  const emailRequired = Boolean(attrs.email_address?.required)
  const passwordEnabled = Boolean(attrs.password?.enabled)
  return {
    usernameEnabled,
    usernameRequired,
    emailEnabled,
    emailRequired,
    passwordEnabled,
    usernameOnlyAccepted: usernameEnabled && !emailRequired && passwordEnabled,
  }
}
