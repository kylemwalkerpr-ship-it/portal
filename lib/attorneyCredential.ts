import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Single source of truth for an attorney's credential_type + bar_number.
 *
 * These two fields are editable from the "My Profile" dashboard. They live
 * on the attorneys row (unique per profile_id) so the editor, the strength
 * scorer, and the public seller pages all resolve the SAME value — the
 * previous design read/wrote attorney_applications (multiple rows per
 * profile) with three different orderings, so a saved value could land on a
 * row the other surfaces never read.
 *
 * attorney_applications remains the immutable vetting record (admin queue +
 * compliance). It is used here only as a read fallback, which also keeps
 * everything working before attorney_credential_columns.sql is applied.
 */

export type CredentialPair = {
  credential_type: string | null
  bar_number: string | null
}

// Reads the editable columns off the attorneys row. Returns nulls (not an
// error) if the columns don't exist yet — i.e. before the migration has run
// — so callers degrade to the application fallback instead of 500ing.
export async function fetchAttorneyCredentialColumns(
  db: SupabaseClient,
  profileId: string,
): Promise<CredentialPair> {
  const { data, error } = await db
    .from('attorneys')
    .select('credential_type, bar_number')
    .eq('profile_id', profileId)
    // Order + limit so this resolves the SAME (newest) row the write path
    // targets, and so maybeSingle doesn't error on duplicate rows.
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { credential_type: null, bar_number: null }
  return {
    credential_type: (data?.credential_type as string | null) ?? null,
    bar_number: (data?.bar_number as string | null) ?? null,
  }
}

// Most recent APPROVED application's credential — the vetting record and the
// fallback when the editable columns are empty/absent.
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
  }
}

// Batch variant for listing endpoints: maps profile_id → editable
// credential columns off the attorneys rows. Returns an empty map (not an
// error) if the columns don't exist yet, so callers fall back to the
// application join without breaking the public marketplace pre-migration.
export async function fetchAttorneyCredentialColumnsBatch(
  db: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, CredentialPair>> {
  const map = new Map<string, CredentialPair>()
  if (profileIds.length === 0) return map
  const { data, error } = await db
    .from('attorneys')
    .select('profile_id, credential_type, bar_number')
    .in('profile_id', profileIds)
  if (error || !data) return map
  for (const row of data as any[]) {
    map.set(row.profile_id, {
      credential_type: (row.credential_type as string | null) ?? null,
      bar_number: (row.bar_number as string | null) ?? null,
    })
  }
  return map
}

// Editable attorneys value wins per-field; falls back to the approved
// application. Skips the fallback query entirely once both editable values
// are present (the common post-migration case).
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
  }
}
