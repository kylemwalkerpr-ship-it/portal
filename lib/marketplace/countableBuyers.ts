/**
 * Which buyers count toward public marketplace activity figures.
 *
 * Mirrors the buyer rule in public.real_completed_order_count (migration
 * 20261002105000_real_completed_order_counts.sql), which derives
 * gigs.order_count ("N completed orders"). A buyer counts unless they are:
 *   - missing (no client_id),
 *   - the gig's own provider (owner test purchases),
 *   - staff (admin / support), or
 *   - flagged profiles.is_test_account.
 * A buyer with no profile row counts (same as the SQL LEFT JOIN).
 */

export const NON_COUNTABLE_BUYER_ROLES: readonly string[] = ['admin', 'support']

export interface BuyerProfile {
  id: string
  role?: string | null
  is_test_account?: boolean | null
}

export function isCountableBuyer(
  clientId: string | null | undefined,
  providerId: string | null | undefined,
  profile: BuyerProfile | null | undefined,
): boolean {
  if (!clientId) return false
  if (providerId && clientId === providerId) return false
  if (profile?.is_test_account === true) return false
  if (NON_COUNTABLE_BUYER_ROLES.includes(String(profile?.role || '').toLowerCase())) return false
  return true
}

const PROFILE_CHUNK = 150

/**
 * Returns the subset of clientIds that count, or null when the profile lookup
 * fails (callers must then hide the figure rather than publish an unfiltered one).
 */
export async function loadCountableBuyerIds(
  db: any,
  clientIds: Iterable<string | null | undefined>,
  providerId: string | null | undefined,
): Promise<Set<string> | null> {
  const ids = [...new Set([...clientIds].filter((id): id is string => Boolean(id)))]
  const profiles = new Map<string, BuyerProfile>()
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
    const chunk = ids.slice(i, i + PROFILE_CHUNK)
    const { data, error } = await db.from('profiles').select('id, role, is_test_account').in('id', chunk)
    if (error) return null
    for (const row of (data || []) as BuyerProfile[]) profiles.set(row.id, row)
  }
  return new Set(ids.filter((id) => isCountableBuyer(id, providerId, profiles.get(id))))
}
