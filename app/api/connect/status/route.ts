import { getCurrentConsultant } from '@/lib/consultant'

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, consultant } = auth

  const { data: row, error } = await db
    .from('consultants')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', consultant.id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const onboarded = row?.stripe_onboarding_complete === true
  const stripeAccountId = row?.stripe_account_id || null

  return Response.json({
    onboarded,
    stripeAccountId,
    chargesEnabled: onboarded,
    payoutsEnabled: onboarded,
  })
}
