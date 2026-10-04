'use client'
import { SignUp } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AuthShell, clerkAppearance, safeReturnTo } from '@/components/auth-shell'
import { buildAuthUrl, normalizeAuthIntent, pickReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { LEGACY_SIGN_UP_LANES } from '@/lib/auth/portalAuthRedirect'
import { onboardingUrl } from '@/lib/auth/ysAuthModal'

/**
 * Portal keeps ONE sign-up document: /sign-up. The account type is NOT chosen
 * here any more: every new account lands on /onboarding (role selection, with
 * Supabase as the source of truth). `intent` (client / provider / attorney /
 * consultant) is only a hint that pre-selects the onboarding choice; it is
 * stored as analytics in unsafeMetadata and never used for authorization.
 */
export default function SignUpClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [referrer, setReferrer] = useState<string | null>(null)
  const segments = pathname.split('/').filter(Boolean)
  // Detected after mount only: the prerendered shell (and the Clerk sub-screens
  // rewritten onto it) must hydrate with identical markup on every path.
  const [legacyLane, setLegacyLane] = useState<string | null>(null)
  useEffect(() => {
    setLegacyLane(segments[1] && LEGACY_SIGN_UP_LANES.has(segments[1].toLowerCase()) ? segments[1].toLowerCase() : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  const source = searchParams.get('source')
  const intent =
    normalizeAuthIntent(searchParams.get('intent')) ??
    (source === 'marketing' ? 'client' : null)
  const returnTo = useMemo(
    () => pickReturnTo(new URLSearchParams(searchParams.toString()), PORTAL_ORIGIN),
    [searchParams],
  )
  const destination = returnTo ?? `${PORTAL_ORIGIN}/dashboard`
  const afterSignUpUrl = onboardingUrl(destination, intent)
  const signInUrl = buildAuthUrl('sign-in', { returnTo })
  const previousUrl = returnTo || referrer

  useEffect(() => {
    if (!legacyLane) return
    const rest = segments.slice(2).join('/')
    const url = new URL(window.location.href)
    if (legacyLane === 'admin') {
      window.location.replace(`/sign-in${url.search}`)
      return
    }
    const laneIntent = normalizeAuthIntent(legacyLane)
    if (!rest && laneIntent && !url.searchParams.has('intent')) url.searchParams.set('intent', laneIntent)
    window.location.replace(`/sign-up${rest ? `/${rest}` : ''}${url.search}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyLane])

  useEffect(() => {
    setReferrer(safeReturnTo(document.referrer))
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('redirect_url') || url.searchParams.has('sign_in_force_redirect_url') || url.searchParams.has('sign_up_force_redirect_url')) {
      url.searchParams.delete('redirect_url')
      url.searchParams.delete('sign_in_force_redirect_url')
      url.searchParams.delete('sign_up_force_redirect_url')
      window.history.replaceState({}, '', url)
    }
  }, [])


  const isProvider = intent === 'provider' || intent === 'attorney' || intent === 'consultant' || intent === 'regulated_adviser'

  return (
    <AuthShell
      eyebrow="Create your secure YouSafe account"
      title="One YouSafe account for every site."
      body={
        isProvider
          ? 'Create your account first, then complete one short provider application (attorney, regulated adviser, or consultant). Our team verifies your licence or registration before your profile goes live.'
          : 'Create your account, then tell us whether you need help or provide services. Your dashboard, messages, files, payments, and payouts are routed from that one choice.'
      }
      laneLabel={isProvider ? 'provider' : 'account'}
      previousUrl={previousUrl}
    >
      {/* Lane URLs (prerendered shells, e.g. /sign-up/student) render the SAME shell copy
          (the static-cache deploy gate checks for it) and immediately replace to the
          canonical document; Clerk mounts only on the canonical path. */}
      {legacyLane ? (
        <p style={{ textAlign: 'center', color: '#4A4F5B', padding: '24px 0' }}>Opening secure sign-up…</p>
      ) : (
        <SignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl={afterSignUpUrl}
          signInUrl={signInUrl}
          unsafeMetadata={{ signupIntent: intent ?? undefined, signupSource: source ?? undefined }}
          appearance={clerkAppearance}
        />
      )}
    </AuthShell>
  )
}
