import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import { AttorneyIntakeWizard } from '@/components/marketplace/AttorneyIntakeWizard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Complete your profile · YouSafe',
  robots: { index: false, follow: false },
}

/**
 * /dashboard/attorney/intake — comprehensive profile intake wizard.
 *
 * Surfaces after signup as a to-do until the attorney's profile crosses the
 * 75% PROFILE_PUBLISH_THRESHOLD. Walks the attorney through every required
 * field in one sequenced flow with per-step auto-save, so when they hit the
 * gig builder the publish gate is already cleared.
 *
 * Consultants are redirected to their own profile editor — they have a
 * separate (smaller) intake surface inside the consultant dashboard.
 */
export default async function AttorneyIntakePage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in/student?return_to=/dashboard/attorney/intake')
  }
  if (auth.role === 'consultant') {
    redirect('/dashboard?goto=settings')
  }
  if (auth.role !== 'attorney') {
    redirect('/dashboard')
  }

  return <AttorneyIntakeWizard />
}
