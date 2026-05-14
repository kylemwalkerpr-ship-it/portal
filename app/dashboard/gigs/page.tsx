import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import SellerShell from '@/components/seller/SellerShell'
import SellerGigManager from '@/components/seller/SellerGigManager'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/dashboard/gigs')
  if (auth.role === 'client') redirect('/marketplace')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  return (
    <SellerShell title="Gig Manager">
      <SellerGigManager />
    </SellerShell>
  )
}
