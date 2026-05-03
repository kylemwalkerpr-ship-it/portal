import { getStripe } from '@/lib/stripe'
import { getCurrentConsultant } from '@/lib/consultant'

export async function POST() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const consultant = auth.consultant
  const stripeAccountId = consultant.stripe_account_id || consultant.stripeAccountId
  const onboarded = Boolean(consultant.stripe_onboarding_complete ?? consultant.stripeOnboardingComplete)

  if (!stripeAccountId || !onboarded) {
    return Response.json({ error: 'Onboarding not complete' }, { status: 400 })
  }

  const loginLink = await getStripe().accounts.createLoginLink(stripeAccountId)
  return Response.json({ url: loginLink.url })
}
