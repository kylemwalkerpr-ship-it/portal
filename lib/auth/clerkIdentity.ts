/**
 * Verified Clerk identity for server components / route handlers.
 * Email is only returned when Clerk marks it verified (username-only accounts
 * have none). Never reads unsafeMetadata for authorization.
 */
import { currentUser } from '@clerk/nextjs/server'

export interface VerifiedClerkIdentity {
  id: string
  email: string | null
  fullName: string
  username: string | null
  publicRole: string | null
  publicStatus: string | null
  mustChangePassword: boolean
  signupIntent: string | null
}

export function identityFromClerkUser(user: any): VerifiedClerkIdentity | null {
  if (!user?.id) return null
  const emails: any[] = Array.isArray(user.emailAddresses) ? user.emailAddresses : []
  const primary = emails.find((entry) => entry?.id === user.primaryEmailAddressId) ?? emails[0]
  const verified = primary?.verification?.status === 'verified'
  const publicMetadata = (user.publicMetadata ?? {}) as Record<string, unknown>
  const unsafeMetadata = (user.unsafeMetadata ?? {}) as Record<string, unknown>
  const intent = unsafeMetadata.signupIntent ?? unsafeMetadata.requestedRole
  return {
    id: user.id,
    email: verified && typeof primary?.emailAddress === 'string' ? primary.emailAddress.trim().toLowerCase() : null,
    fullName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim(),
    username: typeof user.username === 'string' ? user.username : null,
    publicRole: typeof publicMetadata.role === 'string' ? publicMetadata.role : null,
    publicStatus: typeof publicMetadata.status === 'string' ? publicMetadata.status : null,
    mustChangePassword: publicMetadata.mustChangePassword === true || publicMetadata.mustChangePassword === 'true',
    // Hint for which onboarding screen to show first. NEVER an authorization input.
    signupIntent: typeof intent === 'string' ? intent : null,
  }
}

export async function getVerifiedClerkIdentity(expectedUserId?: string): Promise<VerifiedClerkIdentity | null> {
  try {
    const user = await currentUser()
    if (!user || (expectedUserId && user.id !== expectedUserId)) return null
    return identityFromClerkUser(user)
  } catch {
    return null
  }
}
