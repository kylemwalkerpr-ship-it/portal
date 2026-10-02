import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { redirectToMarketAuth } from '@/lib/auth/serverAuthRedirect'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import { createProfile, findOrLinkProfile, mirrorProfileToClerk } from '@/lib/auth/roles'
import { normalizeAuthIntent, normalizeReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { normalizeVertical } from '@/lib/platformConfig'
import OnboardingChoice from './OnboardingChoice'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Welcome to YouSafe',
  robots: { index: false, follow: false },
}

type Params = { return_to?: string; intent?: string; vertical?: string }

const PROVIDER_INTENTS = new Set(['provider', 'attorney', 'consultant', 'regulated_adviser'])

/**
 * /onboarding — the one place a new account picks a role (after sign-up /
 * first sign-in). Supabase `profiles` is the source of truth:
 *   - existing profile            -> forward to return_to (nothing changes)
 *   - intent=client               -> create client profile, forward
 *   - intent=provider|attorney|.. -> single provider application
 *   - no intent                   -> "I need help" vs "I provide services"
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const returnTo = normalizeReturnTo(params.return_to ?? null) ?? `${PORTAL_ORIGIN}/dashboard`
  const userId = await getClerkUserId()
  // return_to cannot nest a second return_to (the allow-list strips it), so the
  // modal returns to /onboarding with the intent hint; onboarding then forwards.
  if (!userId) redirectToMarketAuth(params.intent ? `/onboarding?intent=${encodeURIComponent(params.intent)}` : '/onboarding', { intent: params.intent ?? null })

  const identity = await getVerifiedClerkIdentity(userId)
  const intent = normalizeAuthIntent(params.intent) ?? normalizeAuthIntent(identity?.signupIntent)
  const db = createSupabaseAdminClient()
  const profile = await findOrLinkProfile(db, userId, identity?.email)

  const providerUrl = (type: string | null) => {
    const url = new URL('/onboarding/provider', PORTAL_ORIGIN)
    if (type && type !== 'provider') url.searchParams.set('type', type)
    url.searchParams.set('return_to', returnTo)
    return url.toString()
  }

  if (profile) {
    // A brand-new client (no activity) who arrived through a provider CTA may
    // still apply; the apply API enforces the activity guard.
    if (intent && PROVIDER_INTENTS.has(intent) && profile.role === 'client') redirect(providerUrl(intent))
    redirect(returnTo)
  }

  if (intent === 'client') {
    const created = await createProfile(db, {
      clerkUserId: userId,
      email: identity?.email ?? null,
      fullName: identity?.fullName || null,
      role: 'client',
      status: 'active',
      vertical: params.vertical ? normalizeVertical(params.vertical) : null,
    })
    if (created) {
      await mirrorProfileToClerk(userId, { role: 'client', status: 'active' })
      redirect(returnTo)
    }
  }

  if (intent && PROVIDER_INTENTS.has(intent)) redirect(providerUrl(intent))

  return (
    <OnboardingChoice
      returnTo={returnTo}
      providerHref={providerUrl(null)}
      vertical={params.vertical ?? null}
      firstName={identity?.fullName?.split(' ')[0] ?? ''}
    />
  )
}
