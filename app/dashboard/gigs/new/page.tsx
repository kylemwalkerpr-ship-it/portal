import { GigBuilderWizardNew } from '@/components/marketplace/GigBuilderWizardNew'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { computeAttorneyStrength, PROFILE_PUBLISH_THRESHOLD } from '@/lib/attorneyProfileStrength'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/gigs/new')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')

  // Attorneys must clear the intake threshold (≥75% + username) before
  // opening the builder. The builder itself disables publish below 75%,
  // but redirecting here keeps the to-do flow honest — they're sent to the
  // intake wizard until everything is filled in.
  if (auth.role === 'attorney') {
    const strength = await computeAttorneyStrength(auth.db, auth.profileId)
    if (!strength.username || strength.score < PROFILE_PUBLISH_THRESHOLD) {
      redirect('/dashboard/attorney/intake?from=gig-new')
    }
  }

  return <GigBuilderWizardNew />
}
