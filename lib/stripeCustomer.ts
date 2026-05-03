import { getStripe } from './stripe'
import { createSupabaseAdminClient } from './supabase'

export async function getOrCreateStripeCustomer(clerkUserId: string): Promise<string> {
  const db = createSupabaseAdminClient()

  // Try with stripe_customer_id column (may not exist yet if migration hasn't run)
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (error || !profile) {
    // Column likely missing — fall back to basic select
    const { data: basic, error: basicErr } = await db
      .from('profiles')
      .select('id, email, full_name')
      .eq('clerk_user_id', clerkUserId)
      .single()
    if (basicErr || !basic) throw new Error('Profile not found')

    const customer = await getStripe().customers.create({
      email: basic.email,
      name: basic.full_name ?? undefined,
      metadata: { clerk_user_id: clerkUserId },
    })
    return customer.id
  }

  if (profile.stripe_customer_id) return profile.stripe_customer_id

  const customer = await getStripe().customers.create({
    email: profile.email,
    name: profile.full_name ?? undefined,
    metadata: { clerk_user_id: clerkUserId },
  })

  // Best-effort update — silently ignored if column doesn't exist yet
  await db
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('clerk_user_id', clerkUserId)

  return customer.id
}
