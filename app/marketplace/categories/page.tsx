import { MarketplaceCategoriesIndex } from '@/components/marketplace/MarketplaceCategoriesIndex'
import { requirePortalUser } from '@/lib/portalAuth'
import { redirect } from 'next/navigation'

export default async function MarketplaceCategoriesIndexPage() {
  const auth = await requirePortalUser()
  if ('error' in auth) redirect('/sign-in/student?return_to=/marketplace/categories')
  if (auth.role !== 'client') redirect('/dashboard')

  return <MarketplaceCategoriesIndex />
}
