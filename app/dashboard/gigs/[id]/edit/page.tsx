import { GigBuilderWizardClient } from '@/components/marketplace/GigBuilderWizardClient'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/gigs')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  const { id } = await params
  return (
    <SellerShell title="Edit Service" subtitle="Update your service details and pricing">
      <GigBuilderWizardClient gigId={id} role={auth.role as 'attorney' | 'consultant'} />
    </SellerShell>
  )
}
