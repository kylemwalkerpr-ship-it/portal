'use client'
import { SignIn } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { dashboardForLane, normalizeAuthLane, signUpForLane } from '@/lib/roleLanes'

const SUPPORT_SIGN_IN_URL = 'https://support.yousafeconsultancy.com/sign-in'
const STUDENT_SIGN_IN_URL = '/sign-in/student'
const VALID_SIGN_IN_LANES = new Set(['student', 'client', 'consultant', 'admin'])

export default function SignInPage() {
  const pathname = usePathname()
  const laneSegment = pathname.split('/').filter(Boolean)[1]
  const lane = normalizeAuthLane(laneSegment)
  const isSupportLane = laneSegment === 'support'
  const isInvalidLane = Boolean(laneSegment) && !VALID_SIGN_IN_LANES.has(laneSegment)
  const redirectUrl = laneSegment === 'admin' ? '/dashboard' : dashboardForLane(lane)

  useEffect(() => {
    if (isSupportLane) window.location.replace(SUPPORT_SIGN_IN_URL)
    else if (isInvalidLane) window.location.replace(STUDENT_SIGN_IN_URL)
  }, [isSupportLane, isInvalidLane])

  if (isSupportLane || isInvalidLane) {
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
        forceRedirectUrl={redirectUrl}
        signUpUrl={signUpForLane(lane)}
      />
    </div>
  )
}
