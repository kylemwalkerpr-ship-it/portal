import { getStripe } from '@/lib/stripe'
import { getCurrentConsultant } from '@/lib/consultant'

export async function POST() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile } = auth
  let consultant = auth.consultant
  let stripeAccountId = consultant.stripe_account_id || consultant.stripeAccountId

  if (!stripeAccountId) {
    const account = await getStripe().accounts.create({
      type: 'express',
      email: consultant.email || profile.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { consultantId: String(consultant.id) },
    })

    stripeAccountId = account.id
    const { data, error } = await db
      .from('consultants')
      .update({ stripe_account_id: stripeAccountId, stripe_onboarding_complete: false })
      .eq('id', consultant.id)
      .select('*')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    consultant = data
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.yousafeconsultancy.com'
  const accountLink = await getStripe().accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/dashboard/connect/onboard`,
    return_url: `${appUrl}/dashboard/connect/complete`,
    type: 'account_onboarding',
  })

  return Response.json({ url: accountLink.url })
}
