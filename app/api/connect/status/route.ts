import { getStripe } from '@/lib/stripe'
import { getCurrentConsultant } from '@/lib/consultant'

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, consultant } = auth
  const stripeAccountId = consultant.stripe_account_id || consultant.stripeAccountId
  const bypassed = Boolean(consultant.stripe_bypass ?? consultant.stripeBypass)

  if (!stripeAccountId) {
    return Response.json({
      onboarded: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      bypassed,
      effective_onboarded: bypassed,
    })
  }

  const account = await getStripe().accounts.retrieve(stripeAccountId)
  const onboarded = Boolean(account.details_submitted && account.charges_enabled)

  if (onboarded && !(consultant.stripe_onboarding_complete ?? consultant.stripeOnboardingComplete)) {
    await db.from('consultants').update({ stripe_onboarding_complete: true }).eq('id', consultant.id)
  }

  return Response.json({
    onboarded,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    bypassed,
    effective_onboarded: onboarded || bypassed,
  })
}
