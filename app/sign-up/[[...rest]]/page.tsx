'use client'
import { SignUp } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AuthShell, clerkAppearance, safeReturnTo } from '@/components/auth-shell'
import { dashboardForLane, normalizeAuthLane, signInForLane } from '@/lib/roleLanes'

const ADMIN_SIGN_IN_URL = '/sign-in/admin'
const STUDENT_SIGN_UP_URL = '/sign-up/student'
const VALID_SIGN_UP_LANES = new Set(['student', 'client', 'consultant', 'attorney'])

export default function SignUpPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [referrer, setReferrer] = useState<string | null>(null)
  const laneSegment = pathname.split('/').filter(Boolean)[1]
  const lane = normalizeAuthLane(laneSegment)
  const shouldRedirect =
    laneSegment === 'admin' ||
    (Boolean(laneSegment) && !VALID_SIGN_UP_LANES.has(laneSegment))
  const signUpPath = `/sign-up/${laneSegment || 'student'}`
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const previousUrl = returnTo || referrer
  const redirectUrl = returnTo || dashboardForLane(lane)
  const signInUrl = `${signInForLane(lane)}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`
  const laneLabel = lane === 'client' ? 'student / client' : lane

  useEffect(() => {
    if (laneSegment === 'admin') window.location.replace(ADMIN_SIGN_IN_URL)
    else if (shouldRedirect) window.location.replace(STUDENT_SIGN_UP_URL)
  }, [laneSegment, shouldRedirect])

  useEffect(() => {
    setReferrer(safeReturnTo(document.referrer))
  }, [])

  // Clear Clerk's internal redirect query params to prevent nested loops while
  // preserving our own return_to value for protected-route bounce-backs.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('redirect_url') || url.searchParams.has('sign_in_force_redirect_url') || url.searchParams.has('sign_up_force_redirect_url')) {
      url.searchParams.delete('redirect_url')
      url.searchParams.delete('sign_in_force_redirect_url')
      url.searchParams.delete('sign_up_force_redirect_url')
      window.history.replaceState({}, '', url)
    }
  }, [])

  if (shouldRedirect) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#E8E8E8',
          color: '#1F2937',
        }}
      >
        Redirecting to the correct account page...
      </div>
    )
  }

  return (
    <AuthShell
      eyebrow="Create your secure account"
      title="Start inside the right YouSafe lane."
      body="Create the account type that matches your work: student/client, consultant, or attorney. That keeps your dashboard, messages, files, escrow, and payouts routed correctly."
      laneLabel={laneLabel}
      previousUrl={previousUrl}
    >
      <SignUp
        routing="path"
        path={signUpPath}
        forceRedirectUrl={redirectUrl}
        signInUrl={signInUrl}
        unsafeMetadata={{ requestedRole: lane }}
        appearance={clerkAppearance}
      />
    </AuthShell>
  )
}
