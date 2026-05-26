import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'
import SellerMarketplaceView from '@/components/seller/SellerMarketplaceView'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/marketplace')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) redirect('/dashboard')

  return (
    <SellerShell
      title="Marketplace"
      subtitle="Browse what buyers see · scout competitors · find keyword opportunities"
    >
      <SellerMarketplaceView
        viewerProfileId={auth.profileId}
        viewerRole={auth.role as 'attorney' | 'consultant' | 'admin'}
      />
    </SellerShell>
  )
}
