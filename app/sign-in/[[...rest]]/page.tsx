'use client'
import { SignIn } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { dashboardForLane, normalizeAuthLane, signUpForLane } from '@/lib/roleLanes'

const STUDENT_SIGN_IN_URL = '/sign-in/student'
const VALID_SIGN_IN_LANES = new Set(['student', 'client', 'consultant', 'admin'])

export default function SignInPage() {
  const pathname = usePathname()
  const laneSegment = pathname.split('/').filter(Boolean)[1]
  const lane = normalizeAuthLane(laneSegment)
  const isInvalidLane = Boolean(laneSegment) && !VALID_SIGN_IN_LANES.has(laneSegment)
  const redirectUrl = laneSegment === 'admin' ? '/dashboard' : dashboardForLane(lane)
  const signInPath = `/sign-in/${laneSegment || 'student'}`

  useEffect(() => {
    if (isInvalidLane) window.location.replace(STUDENT_SIGN_IN_URL)
  }, [isInvalidLane])

  // Clear any lingering redirect query params to prevent nested loops
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
    <div style={{
      minHeight: '100vh', background: '#05080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <SignIn
        routing="path"
        path={signInPath}
        forceRedirectUrl={redirectUrl}
        signUpUrl={signUpForLane(lane)}
      />
    </div>
  )
}
