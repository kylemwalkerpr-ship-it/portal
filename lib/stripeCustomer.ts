import { getStripe } from './stripe'
import { createSupabaseAdminClient } from './supabase'

export async function getOrCreateStripeCustomer(clerkUserId: string): Promise<string> {
  const db = createSupabaseAdminClient()

  // Try full select including stripe_customer_id
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile) {
    if (profile.stripe_customer_id) return profile.stripe_customer_id

    const customer = await getStripe().customers.create({
      email: profile.email,
      name: profile.full_name ?? undefined,
      metadata: { clerk_user_id: clerkUserId },
    })

    // Best-effort — silently skipped if stripe_customer_id column not yet added
    await db.from('profiles').update({ stripe_customer_id: customer.id }).eq('clerk_user_id', clerkUserId)
    return customer.id
  }

  // stripe_customer_id column may not exist — fall back to basic select
  const { data: basic } = await db
    .from('profiles')
    .select('id, email, full_name')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!basic) {
    throw new Error(
      'Your profile was not found. Please sign out, sign back in, and try again.'
    )
  }

  const customer = await getStripe().customers.create({
    email: basic.email,
    name: basic.full_name ?? undefined,
    metadata: { clerk_user_id: clerkUserId },
  })
  return customer.id
}
