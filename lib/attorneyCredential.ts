import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Single source of truth for an attorney credential.
 *
 * The confidential identifier stays on the attorneys/application rows for
 * verification. Public callers must use `isAttorneyCredentialPublic` before
 * returning it. Admin override precedence is intentional:
 *   false -> force hidden
 *   true  -> force visible
 *   null  -> respect the provider preference (default visible)
 */

export type CredentialPair = {
  credential_type: string | null
  bar_number: string | null
  show_bar_number: boolean | null
  admin_show_bar_number_override: boolean | null
  bar_state: string | null
}

export function isAttorneyCredentialPublic(credential: CredentialPair): boolean {
  const providerChoice = credential.show_bar_number !== false
  return credential.admin_show_bar_number_override ?? providerChoice
}

export async function fetchAttorneyCredentialColumns(
  db: SupabaseClient,
  profileId: string,
): Promise<CredentialPair> {
  const { data, error } = await db
    .from('attorneys')
    .select('credential_type, bar_number, show_bar_number, admin_show_bar_number_override, bar_state')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return {
      credential_type: null,
      bar_number: null,
      show_bar_number: null,
      admin_show_bar_number_override: null,
      bar_state: null,
    }
  }
  return {
    credential_type: (data?.credential_type as string | null) ?? null,
    bar_number: (data?.bar_number as string | null) ?? null,
    show_bar_number: (data?.show_bar_number as boolean | null) ?? null,
    admin_show_bar_number_override: (data?.admin_show_bar_number_override as boolean | null) ?? null,
    bar_state: (data?.bar_state as string | null) ?? null,
  }
}

export async function fetchApprovedApplicationCredential(
  db: SupabaseClient,
  profileId: string,
): Promise<CredentialPair> {
  const { data } = await db
    .from('attorney_applications')
    .select('credential_type, bar_number')
    .eq('profile_id', profileId)
    .eq('status', 'approved')
    .order('decided_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return {
    credential_type: (data?.credential_type as string | null) ?? null,
    bar_number: (data?.bar_number as string | null) ?? null,
    show_bar_number: null,
    admin_show_bar_number_override: null,
    bar_state: null,
  }
}

export async function fetchAttorneyCredentialColumnsBatch(
  db: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, CredentialPair>> {
  const map = new Map<string, CredentialPair>()
  if (profileIds.length === 0) return map
  const { data, error } = await db
    .from('attorneys')
    .select('profile_id, credential_type, bar_number, show_bar_number, admin_show_bar_number_override, bar_state')
    .in('profile_id', profileIds)
  if (error || !data) return map
  for (const row of data as any[]) {
    map.set(row.profile_id, {
      credential_type: (row.credential_type as string | null) ?? null,
      bar_number: (row.bar_number as string | null) ?? null,
      show_bar_number: (row.show_bar_number as boolean | null) ?? null,
      admin_show_bar_number_override: (row.admin_show_bar_number_override as boolean | null) ?? null,
      bar_state: (row.bar_state as string | null) ?? null,
    })
  }
  return map
}

export async function resolveAttorneyCredential(
  db: SupabaseClient,
  profileId: string,
): Promise<CredentialPair> {
  const editable = await fetchAttorneyCredentialColumns(db, profileId)
  if (editable.credential_type && editable.bar_number) return editable
  const approved = await fetchApprovedApplicationCredential(db, profileId)
  return {
    credential_type: editable.credential_type ?? approved.credential_type,
    bar_number: editable.bar_number ?? approved.bar_number,
    show_bar_number: editable.show_bar_number ?? true,
    admin_show_bar_number_override: editable.admin_show_bar_number_override ?? null,
    bar_state: editable.bar_state ?? null,
  }
}
