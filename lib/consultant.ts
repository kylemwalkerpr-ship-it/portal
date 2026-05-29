import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type ConsultantAuth =
  | { error: string; status: 401 | 403 | 404 | 500 }
  | { db: ReturnType<typeof createSupabaseAdminClient>; profile: Record<string, any>; consultant: Record<string, any> }

export async function getCurrentConsultant(): Promise<ConsultantAuth> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, clerk_user_id, role, status, email, full_name')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile || profile.role !== 'consultant') return { error: 'Forbidden', status: 403 }

  let consultant = await findConsultantForProfile(db, profile)
  if (!consultant) {
    consultant = await provisionConsultantForProfile(db, profile)
  }
  if (!consultant) {
    return {
      error:
        'Unable to provision your consultant workspace. Run the supabase/consultant_provisioning.sql migration and try again.',
      status: 500,
    }
  }

  return { db, profile, consultant }
}

export async function findConsultantForProfile(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profile: Record<string, any>,
) {
  const attempts = [
    { column: 'profile_id', value: profile.id },
    { column: 'user_id', value: profile.id },
    { column: 'profile_id', value: profile.clerk_user_id },
    { column: 'email', value: profile.email },
  ].filter(a => a.value)

  for (const attempt of attempts) {
    const { data } = await db
      .from('consultants')
      .select('*')
      .eq(attempt.column, attempt.value)
      // Order + limit so duplicate rows resolve to the newest (the write
      // target) and maybeSingle doesn't error on >1 row.
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  return null
}

/**
 * Idempotently create a `consultants` row for a profile that has role=consultant
 * but no matching consultants record yet.
 *
 * The base consultants table was provisioned outside our migration history, so
 * we don't know its exact column shape. Try the common foreign-key shapes
 * (`profile_id`, then `user_id`) and fall back to an email-only insert.
 */
export async function provisionConsultantForProfile(
  db: ReturnType<typeof createSupabaseAdminClient>,
  profile: Record<string, any>,
) {
  if (profile.role !== 'consultant') return null

  const baseRow: Record<string, unknown> = {
    email: profile.email || null,
    full_name: profile.full_name || null,
  }

  const candidates: Array<Record<string, unknown>> = [
    { ...baseRow, profile_id: profile.id },
    { ...baseRow, user_id: profile.id },
    baseRow,
  ]

  for (const candidate of candidates) {
    const { data, error } = await db
      .from('consultants')
      .insert(candidate)
      .select('*')
      .single()
    if (!error && data) return data
    // If the column doesn't exist (legacy schema), try the next shape.
    if (error && /column .* does not exist|column .* of relation/i.test(error.message)) {
      continue
    }
    // Race: another request just created the row — re-find and return.
    if (error && /duplicate key|unique constraint/i.test(error.message)) {
      const found = await findConsultantForProfile(db, profile)
      if (found) return found
    }
    if (error) {
      console.error('[provisionConsultantForProfile] insert error', error.message)
    }
  }

  // Final attempt: re-find in case a concurrent request created it.
  return findConsultantForProfile(db, profile)
}

export async function findConsultantForOrder(
  db: ReturnType<typeof createSupabaseAdminClient>,
  order: Record<string, any>,
) {
  if (!order.consultant_id) return null
  const { data: profile } = await db.from('profiles').select('*').eq('id', order.consultant_id).maybeSingle()
  if (!profile) return null
  return findConsultantForProfile(db, profile)
}
