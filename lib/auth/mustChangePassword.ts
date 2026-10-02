/**
 * Forced first-sign-in password change for provisioned (provider) accounts.
 *
 * Source of the flag: Clerk `publicMetadata.mustChangePassword` (server-set
 * only), surfaced to middleware through a custom session-token claim so the
 * check costs no network call (1102 budget):
 *
 *   Clerk Dashboard -> Sessions -> Customize session token:
 *   { "ys_mcp": "{{user.public_metadata.mustChangePassword}}",
 *     "ys_role": "{{user.public_metadata.role}}",
 *     "ys_status": "{{user.public_metadata.status}}" }
 *
 * Feature-flag safe: when the claim is absent (dashboard not configured yet)
 * or the flag is false/missing, nothing happens. `YS_PASSWORD_CHANGE_GATE=off`
 * is an emergency kill switch.
 */

export const CHANGE_PASSWORD_PATH = '/account/change-password'
export const CHANGE_PASSWORD_API_PATH = '/api/account/password'

const EXEMPT_PREFIXES = [
  CHANGE_PASSWORD_PATH,
  CHANGE_PASSWORD_API_PATH,
  '/sign-in',
  '/sign-up',
  '/api/webhooks',
  '/_next',
]

function flagIsTrue(value: unknown): boolean {
  return value === true || value === 'true'
}

/** True when the verified session claims say the user must change password. */
export function sessionRequiresPasswordChange(sessionClaims: unknown): boolean {
  if (!sessionClaims || typeof sessionClaims !== 'object') return false
  const claims = sessionClaims as Record<string, unknown>
  if (flagIsTrue(claims.ys_mcp)) return true
  // Also accept a nested metadata claim if Kyle prefers
  // { "metadata": "{{user.public_metadata}}" } in the session token.
  const metadata = claims.metadata ?? claims.public_metadata ?? claims.publicMetadata
  if (metadata && typeof metadata === 'object') {
    return flagIsTrue((metadata as Record<string, unknown>).mustChangePassword)
  }
  return false
}

export function isPasswordChangeExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`))
}

export function passwordChangeGateEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.YS_PASSWORD_CHANGE_GATE ?? '').toLowerCase() !== 'off'
}

/**
 * Redirect target (or null) for a signed-in request. Pure function of the
 * path and the already-verified claims.
 */
export function passwordChangeRedirect(
  pathname: string,
  search: string,
  sessionClaims: unknown,
  origin: string,
  env: Record<string, string | undefined> = process.env,
): URL | null {
  if (!passwordChangeGateEnabled(env)) return null
  if (isPasswordChangeExemptPath(pathname)) return null
  if (!sessionRequiresPasswordChange(sessionClaims)) return null
  const target = new URL(CHANGE_PASSWORD_PATH, origin)
  if (!pathname.startsWith('/api/')) {
    target.searchParams.set('return_to', new URL(`${pathname}${search}`, origin).toString())
  }
  return target
}

/** How recent a password update must be to clear the flag when no issue time is recorded. */
export const PASSWORD_CHANGE_FRESHNESS_MS = 15 * 60 * 1000

function toMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value) {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

/**
 * Server-side proof that the user really rotated the temporary password before
 * we clear `mustChangePassword` (so the API cannot be used to skip the change).
 * Uses Clerk's `password_last_updated_at` (ms) from the Backend API user.
 */
export function passwordChangeClearable(
  user: { password_last_updated_at?: number | null; public_metadata?: Record<string, unknown> | null },
  now: number = Date.now(),
): { ok: true } | { ok: false; reason: 'not_required' | 'not_changed' } {
  const meta = user.public_metadata ?? {}
  if (!flagIsTrue(meta.mustChangePassword)) return { ok: false, reason: 'not_required' }
  const changedAt = toMs(user.password_last_updated_at)
  if (changedAt === null) return { ok: false, reason: 'not_changed' }
  const issuedAt = toMs(meta.tempPasswordIssuedAt)
  if (issuedAt !== null) return changedAt > issuedAt ? { ok: true } : { ok: false, reason: 'not_changed' }
  return now - changedAt <= PASSWORD_CHANGE_FRESHNESS_MS ? { ok: true } : { ok: false, reason: 'not_changed' }
}
