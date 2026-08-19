import { verifyToken } from '@clerk/backend'

/**
 * Authorized parties accepted on the native app's Clerk session JWTs.
 *
 * The iOS app (bundle id `com.yousafeconsultancy.app`) signs in against the
 * Clerk frontend API `clerk.portal.yousafeconsultancy.com`; depending on how
 * the token is minted, Clerk stamps the `azp` claim with the frontend API,
 * the portal origin, or the native bundle id. Keep all three — do not drop
 * the azp check, and do not widen this to the whole Worker.
 */
export const MOBILE_AUTHORIZED_PARTIES = [
  'https://clerk.portal.yousafeconsultancy.com',
  'https://portal.yousafeconsultancy.com',
  'com.yousafeconsultancy.app',
]

export type MobileAuthResult =
  | { status: 'authenticated'; userId: string }
  | { status: 'unauthenticated'; reason: 'missing' | 'invalid' }

/** Decode only the `azp` claim from a JWT payload — never log the token. */
function readAzpClaim(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>
    return typeof claims.azp === 'string' ? claims.azp : null
  } catch {
    return null
  }
}

/**
 * Verify a Clerk session JWT sent as `Authorization: Bearer <token>`.
 *
 * This is the ONLY auth path for `/api/mobile/*` and must never be used to
 * replace `getClerkUserId()` (cookie auth) on the rest of the portal.
 */
export async function verifyMobileBearer(
  authorizationHeader: string | null | undefined,
): Promise<MobileAuthResult> {
  const token = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : ''
  if (!token) return { status: 'unauthenticated', reason: 'missing' }

  try {
    const verified = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: MOBILE_AUTHORIZED_PARTIES,
    })
    if (!verified?.sub) return { status: 'unauthenticated', reason: 'invalid' }
    return { status: 'authenticated', userId: verified.sub }
  } catch (error) {
    // If the token is otherwise well-formed but its azp is not in the
    // allow-list, log ONLY the azp claim (never the JWT) so the operator can
    // add that exact value. The azp check stays on.
    const reason = (error as { reason?: string } | null)?.reason
    if (reason === 'token-invalid-authorized-parties') {
      console.error('[mobileAuth] verifyToken azp mismatch — azp:', readAzpClaim(token))
    }
    return { status: 'unauthenticated', reason: 'invalid' }
  }
}
