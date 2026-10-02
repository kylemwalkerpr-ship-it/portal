import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'
import SellerShell from '@/components/seller/SellerShell'
import SellerGigManager from '@/components/seller/SellerGigManager'

const MARKETPLACE_URL = 'https://market.yousafeconsultancy.com/'

export default async function Page() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/dashboard/gigs')
  if (auth.role === 'client') redirect(MARKETPLACE_URL)
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  return (
    <SellerShell title="Gig Manager">
      <SellerGigManager />
    </SellerShell>
  )
}
