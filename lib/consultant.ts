import { getClerkUserId } from './auth'
import { createSupabaseAdminClient } from './supabase'

export type ConsultantAuth =
  | { error: string; status: 401 | 403 | 404 }
  | { db: ReturnType<typeof createSupabaseAdminClient>; profile: Record<string, any>; consultant: Record<string, any> }

export async function getCurrentConsultant(): Promise<ConsultantAuth> {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('*')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile || profile.role !== 'consultant') return { error: 'Forbidden', status: 403 }

  const consultant = await findConsultantForProfile(db, profile)
  if (!consultant) return { error: 'Consultant record not found', status: 404 }

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
      .maybeSingle()
    if (data) return data
  }

  return null
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
