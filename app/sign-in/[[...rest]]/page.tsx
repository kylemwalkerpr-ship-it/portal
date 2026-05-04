'use client'
import { SignIn } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { dashboardForLane, normalizeAuthLane, signUpForLane } from '@/lib/roleLanes'

export default function SignInPage() {
  const pathname = usePathname()
  const lane = normalizeAuthLane(pathname.split('/').filter(Boolean)[1])

  return (
    <div style={{
      minHeight: '100vh', background: '#05080f',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <SignIn
        fallbackRedirectUrl={dashboardForLane(lane)}
        signUpUrl={signUpForLane(lane)}
      />
    </div>
  )
}
