import { MarketplaceProvidersIndex } from '@/components/marketplace/MarketplaceProvidersIndex'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function MarketplaceProvidersIndexPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/marketplace/providers')
  if (auth.role !== 'client') redirect('/dashboard')

  return <MarketplaceProvidersIndex />
}
