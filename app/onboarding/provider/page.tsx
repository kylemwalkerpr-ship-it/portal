import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { redirectToMarketAuth } from '@/lib/auth/serverAuthRedirect'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import { findOrLinkProfile, normalizeProviderType } from '@/lib/auth/roles'
import { normalizeReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { REGULATORS } from '@/lib/provider/application'
import ProviderApplicationForm from './ProviderApplicationForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Provider application · YouSafe',
  robots: { index: false, follow: false },
}

type Params = { type?: string; return_to?: string }

/** /onboarding/provider — the single provider application. */
export default async function ProviderApplicationPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const self = new URL('/onboarding/provider', PORTAL_ORIGIN)
  if (params.type) self.searchParams.set('type', params.type)
  const userId = await getClerkUserId()
  if (!userId) {
    redirectToMarketAuth(self.toString(), { mode: 'sign-up', intent: params.type ?? 'provider' })
  }

  const identity = await getVerifiedClerkIdentity(userId)
  const db = createSupabaseAdminClient()
  const profile = await findOrLinkProfile(db, userId, identity?.email)

  if (profile && (profile.role === 'admin' || profile.role === 'support')) redirect('/dashboard')
  if (profile && (profile.role === 'attorney' || profile.role === 'consultant') && profile.status === 'active') {
    redirect('/dashboard')
  }

  const initialType =
    normalizeProviderType(params.type) ??
    (profile?.role === 'consultant' ? 'consultant' : profile?.role === 'attorney' ? 'attorney' : null)

  const doneUrl = normalizeReturnTo(params.return_to ?? null) ?? `${PORTAL_ORIGIN}/dashboard`

  return (
    <ProviderApplicationForm
      initialType={initialType}
      defaultFullName={profile?.full_name || identity?.fullName || ''}
      regulators={REGULATORS}
      doneUrl={doneUrl.includes('/onboarding') ? `${PORTAL_ORIGIN}/dashboard` : doneUrl}
    />
  )
}
