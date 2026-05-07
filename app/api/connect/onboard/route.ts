import { getStripe } from '@/lib/stripe'
import { getCurrentConsultant } from '@/lib/consultant'

function describeStripeError(err: unknown): string {
  if (err && typeof err === 'object') {
    // Stripe SDK errors carry .raw.message / .code; SDK also surfaces .message
    const e = err as { raw?: { message?: string; code?: string }; message?: string; code?: string }
    const msg = e.raw?.message || e.message || 'Unknown Stripe error'
    const code = e.raw?.code || e.code
    return code ? `${msg} (${code})` : msg
  }
  return 'Unknown error'
}

export async function POST() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile } = auth
  let consultant = auth.consultant
  let stripeAccountId = consultant.stripe_account_id || consultant.stripeAccountId

  const email = consultant.email || profile.email
  if (!email) {
    return Response.json(
      { error: 'Your profile has no email address. Add one in Settings before connecting a bank account.' },
      { status: 400 },
    )
  }

  try {
    if (!stripeAccountId) {
      const account = await getStripe().accounts.create({
        type: 'express',
        email,
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

      if (error) {
        console.error('[connect/onboard] failed to persist stripe_account_id', error.message)
        return Response.json(
          { error: `Stripe account created but couldn't be saved: ${error.message}` },
          { status: 500 },
        )
      }
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
  } catch (err) {
    const message = describeStripeError(err)
    console.error('[connect/onboard] Stripe error', message, err)
    // Surface the real Stripe message so the consultant (and we) can act on it.
    // Common cause: the platform isn't enrolled in Connect yet at
    // https://dashboard.stripe.com/connect/overview — Stripe returns
    // "Your platform is not yet ready to onboard accounts" until that's done.
    return Response.json({ error: `Stripe Connect: ${message}` }, { status: 500 })
  }
}
