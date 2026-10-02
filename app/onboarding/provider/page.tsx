import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { redirectToMarketAuth } from '@/lib/auth/serverAuthRedirect'
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getVerifiedClerkIdentity } from '@/lib/auth/clerkIdentity'
import { findOrLinkProfile, normalizeProviderType } from '@/lib/auth/roles'
import { normalizeReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import {
  CONSULTANT_CREDENTIAL_BODIES,
  CONSULTANT_SPECIALTIES,
  formValuesFromApplication,
  NON_US_BAR_JURISDICTIONS,
  OPEN_APPLICATION_STATUSES,
  REGULATORS,
  US_BAR_JURISDICTIONS,
  type ProviderFormValues,
} from '@/lib/provider/application'
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

  // Resume: prefill from the open application ("Review or update application").
  let initialValues: ProviderFormValues = {}
  let hasOpenApplication = false
  if (profile && initialType) {
    const table = initialType === 'consultant' ? 'consultant_applications' : 'attorney_applications'
    const { data: open } = await db
      .from(table)
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (open && OPEN_APPLICATION_STATUSES.includes(open.status)) {
      initialValues = formValuesFromApplication(table, open)
      hasOpenApplication = true
    }
  }

  const doneUrl = normalizeReturnTo(params.return_to ?? null) ?? `${PORTAL_ORIGIN}/dashboard`

  return (
    <ProviderApplicationForm
      initialType={initialType}
      defaultFullName={profile?.full_name || identity?.fullName || ''}
      email={identity?.email ?? profile?.email ?? null}
      draftKey={`ys-provider-application:v2:${userId}`}
      initialValues={initialValues}
      hasOpenApplication={hasOpenApplication}
      regulators={REGULATORS}
      usBarJurisdictions={US_BAR_JURISDICTIONS}
      nonUsBarJurisdictions={NON_US_BAR_JURISDICTIONS.map((j) => j.value)}
      credentialBodies={CONSULTANT_CREDENTIAL_BODIES}
      specialties={CONSULTANT_SPECIALTIES}
      doneUrl={doneUrl.includes('/onboarding') ? `${PORTAL_ORIGIN}/dashboard` : doneUrl}
    />
  )
}
