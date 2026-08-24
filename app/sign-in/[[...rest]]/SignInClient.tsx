'use client'
import { SignIn } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AuthShell, clerkAppearance, safeReturnTo } from '@/components/auth-shell'
import { dashboardForLane, normalizeAuthLane, signUpForLane } from '@/lib/roleLanes'

const STUDENT_SIGN_IN_URL = '/sign-in/student'
const VALID_SIGN_IN_LANES = new Set(['student', 'client', 'consultant', 'admin', 'attorney'])

export default function SignInClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [referrer, setReferrer] = useState<string | null>(null)
  const laneSegment = pathname.split('/').filter(Boolean)[1]
  const lane = normalizeAuthLane(laneSegment)
  const isInvalidLane = Boolean(laneSegment) && !VALID_SIGN_IN_LANES.has(laneSegment)
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const previousUrl = returnTo || referrer
  const redirectUrl = returnTo || (laneSegment === 'admin' ? '/dashboard?lane=admin' : dashboardForLane(lane))
  const signInPath = `/sign-in/${laneSegment || 'student'}`
  const signUpUrl = `${signUpForLane(lane)}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`
  const laneLabel = laneSegment === 'admin' ? 'admin' : lane === 'client' ? 'client' : lane

  useEffect(() => {
    if (isInvalidLane) window.location.replace(STUDENT_SIGN_IN_URL)
  }, [isInvalidLane])

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

  if (isInvalidLane) {
    return (
      <div style={{
        minHeight: '100vh', background: '#05080f', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        Redirecting to the correct sign-in page...
      </div>
    )
  }

  return (
    <AuthShell
      eyebrow="Secure portal access"
      title="Welcome back to your YouSafe workspace."
      body="Sign in to continue your orders, messages, document uploads, attorney inquiries, payouts, or support work without leaving the YouSafe family of sites."
      laneLabel={laneLabel}
      previousUrl={previousUrl}
    >
      <SignIn
        routing="path"
        path={signInPath}
        fallbackRedirectUrl={redirectUrl}
        signUpUrl={signUpUrl}
        appearance={clerkAppearance}
      />
    </AuthShell>
  )
}
