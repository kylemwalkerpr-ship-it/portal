'use client'
import { SignUp } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AuthShell, clerkAppearance, safeReturnTo } from '@/components/auth-shell'
import { dashboardForLane, normalizeAuthLane, signInForLane } from '@/lib/roleLanes'

const ADMIN_SIGN_IN_URL = '/sign-in/admin'
const STUDENT_SIGN_UP_URL = '/sign-up/student'
const VALID_SIGN_UP_LANES = new Set(['student', 'client', 'consultant', 'attorney'])

export default function SignUpClient() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [referrer, setReferrer] = useState<string | null>(null)
  const laneSegment = pathname.split('/').filter(Boolean)[1]
  const source = searchParams.get('source')
  let lane = normalizeAuthLane(laneSegment)
  if (source === 'marketing') {
    lane = 'client'
  }
  const shouldRedirect =
    laneSegment === 'admin' ||
    (Boolean(laneSegment) && !VALID_SIGN_UP_LANES.has(laneSegment) && source !== 'marketing')
  const signUpPath = source === 'marketing' ? '/sign-up/student' : `/sign-up/${laneSegment || 'student'}`
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const action = searchParams.get('action')
  const meta = searchParams.get('meta')
  const previousUrl = returnTo || referrer

  // If action/meta are present (marketplace gate), redirect back to the
  // originating page with ?resume so the page can re-trigger the action.
  const redirectUrl = useMemo(() => {
    const base = returnTo || dashboardForLane(lane)
    if (action) {
      const sep = base.includes('?') ? '&' : '?'
      return `${base}${sep}resume=${action}${meta ? `&meta=${meta}` : ''}`
    }
    return base
  }, [returnTo, lane, action, meta])

  const signInUrl = `${signInForLane(lane)}${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`
  const laneLabel = lane === 'client' ? 'student / client' : lane

  useEffect(() => {
    if (laneSegment === 'admin') window.location.replace(ADMIN_SIGN_IN_URL)
    else if (shouldRedirect) window.location.replace(STUDENT_SIGN_UP_URL)
  }, [laneSegment, shouldRedirect])

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

  // Mirror the resolved lane into BOTH sessionStorage and a cookie
  // BEFORE Clerk takes the browser over for OAuth. Clerk's
  // `unsafeMetadata.requestedRole` is dropped on several OAuth
  // roundtrips (most reliably with Google's first-time consent screen),
  // which is what produced `/dashboard?lane=student` for users who
  // clicked "Apply as attorney with Google".
  //
  // Why two stores:
  //   - sessionStorage works for inline same-tab OAuth — fast, no
  //     network roundtrip — and is what DashboardClient consumes.
  //   - A cookie is the only thing that survives popup-style OAuth
  //     (Clerk sometimes opens Google in a new window) and is also
  //     readable server-side from app/dashboard/page.tsx, so the
  //     dashboard's first server render lands on the right lane
  //     without a client-side reload.
  //
  // The cookie is path=/, SameSite=Lax (so it travels through the
  // OAuth redirect), no Secure flag in dev so localhost still works,
  // and a 1-hour Max-Age so it can't outlive its purpose. Both
  // stores get cleared after the dashboard promotes the profile.
  useEffect(() => {
    if (typeof window === 'undefined' || lane === 'client') return
    try { window.sessionStorage.setItem('ys.requestedLane', lane) } catch {}
    try {
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `ys_requested_lane=${encodeURIComponent(lane)}; Max-Age=3600; Path=/; SameSite=Lax${secure}`
    } catch {}
  }, [lane])

  if (shouldRedirect) {
    return (
      <div
        style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#E8E8E8', color: '#1F2937',
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
      body="Create the account type that matches your work: student/client, consultant (non-legal: academic, career, business, settlement, mentorship), or attorney (licensed legal practice). That keeps your dashboard, messages, files, escrow, and payouts routed correctly."
      laneLabel={laneLabel}
      previousUrl={previousUrl}
    >
      <SignUp
        routing="path"
        path={signUpPath}
        fallbackRedirectUrl={redirectUrl}
        signInUrl={signInUrl}
        unsafeMetadata={{ requestedRole: lane, signupSource: source ?? undefined }}
        appearance={clerkAppearance}
      />
    </AuthShell>
  )
}
