import { GigBuilderWizardNew } from '@/components/marketplace/GigBuilderWizardNew'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'
import { computeAttorneyStrength, PROFILE_PUBLISH_THRESHOLD } from '@/lib/attorneyProfileStrength'
import { computeConsultantStrength, CONSULTANT_PUBLISH_THRESHOLD } from '@/lib/consultantProfileStrength'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/gigs/new')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')

  // Attorneys + consultants must clear the intake threshold (≥75% + username)
  // before opening the builder. The builder itself disables publish below
  // 75%, but redirecting here keeps the to-do flow honest.
  if (auth.role === 'attorney') {
    const strength = await computeAttorneyStrength(auth.db, auth.profileId)
    if (!strength.username || strength.score < PROFILE_PUBLISH_THRESHOLD) {
      redirect('/dashboard/attorney/intake?from=gig-new')
    }
  } else if (auth.role === 'consultant') {
    const strength = await computeConsultantStrength(auth.db, auth.profileId)
    if (!strength.username || strength.score < CONSULTANT_PUBLISH_THRESHOLD) {
      redirect('/dashboard/consultant/intake?from=gig-new')
    }
  }

  return (
    <SellerShell title="New Service" subtitle="Set up your service with clear scope and pricing">
      <GigBuilderWizardNew role={auth.role as 'attorney' | 'consultant'} />
    </SellerShell>
  )
}
