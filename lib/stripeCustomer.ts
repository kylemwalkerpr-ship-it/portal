import { getStripe } from './stripe'
import { createSupabaseAdminClient } from './supabase'

export async function getOrCreateStripeCustomer(clerkUserId: string): Promise<string> {
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, stripe_customer_id')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (!profile) throw new Error('Profile not found')

  if (profile.stripe_customer_id) return profile.stripe_customer_id

  const customer = await getStripe().customers.create({
    email: profile.email,
    name: profile.full_name ?? undefined,
    metadata: { clerk_user_id: clerkUserId },
  })

  await db
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('clerk_user_id', clerkUserId)

  return customer.id
}
