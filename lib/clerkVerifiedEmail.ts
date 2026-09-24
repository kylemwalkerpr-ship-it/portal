type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Return a normalized email only when it is the explicitly identified,
 * verified primary email in Clerk's SDK or REST user shape.
 */
export function getVerifiedPrimaryEmail(user: unknown): string | null {
  if (!isRecord(user)) return null

  const isSdkShape = 'primaryEmailAddressId' in user || 'emailAddresses' in user
  const primaryId = isSdkShape ? user.primaryEmailAddressId : user.primary_email_address_id
  if (typeof primaryId !== 'string' || !primaryId.trim()) return null

  const addresses = isSdkShape ? user.emailAddresses : user.email_addresses
  if (!Array.isArray(addresses)) return null

  const primary = addresses.find((address) => isRecord(address) && address.id === primaryId)
  if (!isRecord(primary)) return null

  const verification = primary.verification
  if (!isRecord(verification) || verification.status !== 'verified') return null

  const rawEmail = primary.emailAddress ?? primary.email_address
  if (typeof rawEmail !== 'string') return null

  const normalized = rawEmail.trim().toLowerCase()
  return normalized || null
}

/**
 * Supabase `ilike` treats `%` and `_` as pattern characters. Call this on
 * every returned row before treating it as an email identity match.
 */
export function profileEmailMatchesExactly(profileEmail: unknown, clerkEmail: unknown): boolean {
  if (typeof profileEmail !== 'string' || typeof clerkEmail !== 'string') return false
  const profileNormalized = profileEmail.trim().toLowerCase()
  const clerkNormalized = clerkEmail.trim().toLowerCase()
  return profileNormalized.length > 0 && profileNormalized === clerkNormalized
}
