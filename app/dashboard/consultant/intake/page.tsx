import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requirePortalUser } from '@/lib/portalAuth'
import { ConsultantIntakeWizard } from '@/components/marketplace/ConsultantIntakeWizard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Complete your profile · YouSafe',
  robots: { index: false, follow: false },
}

export default async function ConsultantIntakePage() {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    redirect('/sign-in/student?return_to=/dashboard/consultant/intake')
  }
  if (auth.role === 'attorney') {
    redirect('/dashboard/attorney/intake')
  }
  if (auth.role !== 'consultant') {
    redirect('/dashboard')
  }
  return <ConsultantIntakeWizard />
}
