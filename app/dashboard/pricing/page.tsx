import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'
import { redirectForPortalAuthFailure } from '@/lib/auth/serverAuthRedirect'
import SellerShell from '@/components/seller/SellerShell'
import ProviderPricingPreferences from '@/components/provider/ProviderPricingPreferences'

export default async function ProviderPricingPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirectForPortalAuthFailure(auth, '/dashboard/pricing')
  if (!['attorney', 'consultant'].includes(auth.role)) redirect('/dashboard')
  return <SellerShell title="YQAA pricing preferences" subtitle="Set how YQAA handles pricing flexibility across your services.">
    <ProviderPricingPreferences />
  </SellerShell>
}
