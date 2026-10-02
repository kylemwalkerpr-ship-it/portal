'use client'
import { SignIn } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AuthShell, clerkAppearance, safeReturnTo } from '@/components/auth-shell'
import { buildAuthUrl, pickReturnTo, PORTAL_ORIGIN } from '@/lib/auth/returnTo'
import { LEGACY_SIGN_IN_LANES } from '@/lib/auth/portalAuthRedirect'

/**
 * Portal keeps ONE sign-in document: /sign-in (Clerk path routing underneath:
 * /sign-in/factor-one, /sign-in/sso-callback, ...). Retired lane URLs are 301'd
 * by middleware; this client only normalizes the rare lane URL that reached
 * the shell because it carried Clerk protocol parameters (e.g. a
 * `__clerk_ticket` sign-in token), preserving the query so Clerk consumes it.
 */
export default function SignInClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [referrer, setReferrer] = useState<string | null>(null)
  const segments = pathname.split('/').filter(Boolean)
  // Detected after mount only: the prerendered shell (and the Clerk sub-screens
  // rewritten onto it) must hydrate with identical markup on every path.
  const [legacyLane, setLegacyLane] = useState<string | null>(null)
  useEffect(() => {
    setLegacyLane(segments[1] && LEGACY_SIGN_IN_LANES.has(segments[1].toLowerCase()) ? segments[1] : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  const returnTo = useMemo(
    () => pickReturnTo(new URLSearchParams(searchParams.toString()), PORTAL_ORIGIN),
    [searchParams],
  )
  const previousUrl = returnTo || referrer
  const signUpUrl = buildAuthUrl('sign-up', { returnTo, intent: searchParams.get('intent') })

  useEffect(() => {
    if (!legacyLane) return
    const rest = segments.slice(2).join('/')
    window.location.replace(`/sign-in${rest ? `/${rest}` : ''}${window.location.search}`)
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


  return (
    <AuthShell
      eyebrow="Secure YouSafe sign-in"
      title="Welcome back to your YouSafe workspace."
      body="One sign-in for every YouSafe site. Use your email or username and password (or Google) to continue your orders, messages, documents, cases, payouts, or support work."
      laneLabel="account"
      previousUrl={previousUrl}
    >
      {/* Lane URLs (prerendered shells, e.g. /sign-in/student) render the SAME shell copy
          (the static-cache deploy gate checks for it) and immediately replace to the
          canonical document; Clerk mounts only on the canonical path. */}
      {legacyLane ? (
        <p style={{ textAlign: 'center', color: '#4A4F5B', padding: '24px 0' }}>Opening secure sign-in…</p>
      ) : (
        <SignIn
          routing="path"
          path="/sign-in"
          {...(returnTo ? { forceRedirectUrl: returnTo } : { fallbackRedirectUrl: `${PORTAL_ORIGIN}/dashboard` })}
          signUpUrl={signUpUrl}
          appearance={clerkAppearance}
        />
      )}
    </AuthShell>
  )
}
