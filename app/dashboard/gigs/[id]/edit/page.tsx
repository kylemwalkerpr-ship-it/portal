import { GigBuilderWizardClient } from '@/components/marketplace/GigBuilderWizardClient'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'
import SellerShell from '@/components/seller/SellerShell'

const MARKETPLACE_URL = 'https://market.yousafeconsultancy.com/'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/dashboard/gigs')
  if (auth.role === 'client') redirect(MARKETPLACE_URL)
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  const { id } = await params
  return (
    <SellerShell title="Edit Service" subtitle="Update your service details and pricing">
      <GigBuilderWizardClient gigId={id} role={auth.role as 'attorney' | 'consultant'} />
    </SellerShell>
  )
}
